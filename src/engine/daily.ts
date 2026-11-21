import { easternDate } from "../data/autograde";
import type { NbaBox } from "../data/espn";
import type { Offer } from "../data/linemate";
import type { Boxscore, ClubGame, Leaders, ScheduledGame } from "../data/nhl";
import { attachPrices } from "./pricing";
import { gradeDay, mergeGrades } from "./grade";
import { buildHistories, type DatedBox } from "./history";
import { projectPlayer, type Projection } from "./project";
import { applyPriors, blendWithMarket } from "./filter";
import parlaybot from "./priors/parlaybot.json";
import type { Priors } from "./priors";
import { candidatesFrom, selectDay } from "./select";
import type { DayFile, DayGrades } from "./types";

/** The network calls the engine needs, so tests can swap in fakes. */
export interface Fetchers {
  loadSchedule(date: string): Promise<ScheduledGame[]>;
  loadClubSchedule(team: string): Promise<ClubGame[]>;
  loadBoxscore(gameId: number): Promise<Boxscore | null>;
  /** Season top-12 skaters per stat. When provided, only those players are priced for that stat. */
  loadLeaders?(date: string): Promise<Leaders>;
  /** Linemate offers. When provided, a pick needs a matching Linemate price, and no Linemate data means no picks. */
  loadOffers?(): Promise<Offer[]>;
  /** NBA box scores, for grading NBA picks. */
  loadNbaBox?(gameId: number): Promise<NbaBox | null>;
}

const FINAL = new Set(["FINAL", "OFF"]);
export const HISTORY_GAMES = 10;
/** Skip games that start too soon to log a pick honestly. */
export const MIN_LEAD_MINUTES = 15;

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function retry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw last;
}

export interface Generated {
  day: DayFile;
  log: string[];
}

/** Fetch today's slate and recent box scores, project every regular, and select the day's picks. */
export async function generateDay(f: Fetchers, now: Date, opts: { date?: string } = {}): Promise<Generated> {
  const log: string[] = [];
  const date = opts.date ?? easternDate(now.toISOString());
  const cutoff = now.getTime() + MIN_LEAD_MINUTES * 60_000;

  const all = await retry(() => f.loadSchedule(date));
  const slate = all.filter((g) => Date.parse(g.startUtc) > cutoff);
  log.push(`${date}: ${all.length} games on the schedule, ${slate.length} games still open for picks`);
  if (slate.length === 0) {
    return { day: selectDay(date, [], now), log: [...log, "No upcoming games, so nothing to pick."] };
  }

  const teams = [...new Set(slate.flatMap((g) => [g.away, g.home]))];
  const failedTeams: string[] = [];
  const clubs = await mapLimit(teams, 3, async (t) => {
    try {
      return await retry(() => f.loadClubSchedule(t));
    } catch {
      failedTeams.push(t);
      return [] as ClubGame[];
    }
  });
  if (failedTeams.length) log.push(`Could not read the schedule for ${failedTeams.join(", ")}, so those teams get no picks`);
  const recent = new Map<number, string>();
  clubs.forEach((games) => {
    games
      .filter((g) => FINAL.has(g.state) && (g.type === 2 || g.type === 3) && g.date < date)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, HISTORY_GAMES)
      .forEach((g) => recent.set(g.id, g.date));
  });
  log.push(`${teams.length} teams, ${recent.size} recent games to read`);

  const boxes: DatedBox[] = [];
  let failed = 0;
  await mapLimit([...recent], 3, async ([id, boxDate]) => {
    try {
      const box = await retry(() => f.loadBoxscore(id));
      if (box && box.final && box.players.length > 0) boxes.push({ date: boxDate, box });
    } catch {
      failed++;
    }
  });
  log.push(`${boxes.length} box scores loaded${failed ? `, ${failed} failed` : ""}`);

  let leaders: Leaders | null = null;
  if (f.loadLeaders) {
    try {
      leaders = await retry(() => f.loadLeaders!(date));
      log.push(`League leaders loaded (${Object.entries(leaders).map(([k, v]) => `${k} ${v.length}`).join(", ")})`);
    } catch (err) {
      log.push(`Could not load league leaders (${(err as Error).message}), so no picks were made`);
      const day = selectDay(date, [], now);
      day.notes.push("League leaders could not be read, so no picks were made.");
      return { day, log };
    }
  }

  const histories = buildHistories(boxes);
  const projections: Projection[] = [];
  for (const g of slate) {
    for (const [team, opponent] of [[g.away, g.home], [g.home, g.away]] as const) {
      for (const player of histories.players.values()) {
        if (player.team !== team) continue;
        const all = projectPlayer(histories, player, { team, opponent, gameId: g.id, gameStart: g.startUtc });
        projections.push(...(leaders ? all.filter((p) => leaders![p.market as keyof Leaders]?.includes(p.key)) : all));
      }
    }
  }
  log.push(`${new Set(projections.map((p) => p.key)).size} players projected`);

  let candidates = applyPriors(candidatesFrom(projections), "nhl", parlaybot as Priors);
  let priced = false;
  if (f.loadOffers) {
    let offers: Offer[];
    try {
      offers = await retry(() => f.loadOffers!());
    } catch (err) {
      log.push(`Could not read Linemate (${(err as Error).message}), so no picks were made`);
      const none = selectDay(date, [], now);
      none.notes.push("Linemate could not be read, so no picks were made.");
      return { day: none, log };
    }
    log.push(`Linemate: ${offers.length} NHL offers`);
    if (offers.length === 0) {
      const none = selectDay(date, [], now);
      none.notes.push("Linemate has no NHL data yet, so no picks were made.");
      return { day: none, log };
    }
    const res = attachPrices(candidates, offers, "nhl");
    log.push(`${res.priced.length} candidates matched a Linemate price, ${res.dropped} had none and were dropped`);
    candidates = blendWithMarket(res.priced);
    priced = true;
  }
  const day = selectDay(date, candidates, now, undefined, { priced });
  if (boxes.length === 0) day.notes.push("No box score history could be read, so no picks were made.");
  return { day, log };
}

/** Grade whatever is gradable. Returns updated grade files keyed by date. Picks are never regraded. */
export async function gradePending(
  f: Fetchers,
  days: DayFile[],
  existing: Map<string, DayGrades>,
  now: Date,
  graceHours = 3,
): Promise<{ updated: Map<string, DayGrades>; log: string[] }> {
  const log: string[] = [];
  const updated = new Map<string, DayGrades>();
  const lastStart = now.getTime() - graceHours * 3_600_000;

  for (const day of days) {
    const done = new Set((existing.get(day.date)?.grades ?? []).map((g) => g.pickId));
    const pending = day.picks.filter((p) => !done.has(p.id) && Date.parse(p.gameStart) < lastStart);
    if (pending.length === 0) continue;

    const ids = [...new Set(pending.filter((p) => p.sport !== "nba").map((p) => p.gameId))];
    const boxes = new Map<number, Boxscore | null>();
    await mapLimit(ids, 4, async (id) => {
      try {
        boxes.set(id, await retry(() => f.loadBoxscore(id)));
      } catch {
        boxes.set(id, null);
      }
    });
    const nbaIds = [...new Set(pending.filter((p) => p.sport === "nba").map((p) => p.gameId))];
    const nbaBoxes = new Map<number, NbaBox | null>();
    await mapLimit(nbaIds, 4, async (id) => {
      try {
        nbaBoxes.set(id, f.loadNbaBox ? await retry(() => f.loadNbaBox!(id)) : null);
      } catch {
        nbaBoxes.set(id, null);
      }
    });

    const { grades, open } = gradeDay({ ...day, picks: pending }, boxes, new Set(), nbaBoxes);
    log.push(`${day.date}: graded ${grades.length}, left ${open.length} open`);
    if (grades.length > 0) updated.set(day.date, mergeGrades(existing.get(day.date) ?? null, day.date, grades, now));
  }
  return { updated, log };
}
