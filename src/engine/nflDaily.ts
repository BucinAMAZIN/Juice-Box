import { easternDate } from "../data/autograde";
import type { NbaGame, NflAvg, NflBox, WeekInfo } from "../data/espn";
import type { Offer } from "../data/linemate";
import { nameKey } from "../data/nhl";
import { applyPriors, blendWithMarket } from "./filter";
import { buildNflHistories, nflCandidates, nflLeaders, NFL_MARKETS, projectNfl } from "./nfl";
import type { Priors } from "./priors";
import parlaybot from "./priors/parlaybot.json";
import type { Projection } from "./project";
import { selectDay } from "./select";
import type { DayFile } from "./types";

export interface NflFetchers {
  loadWeek(week?: number): Promise<WeekInfo>;
  loadBox(gameId: number): Promise<NflBox | null>;
  loadAverages(date: string): Promise<NflAvg[]>;
  loadOffers(): Promise<Offer[]>;
}

export const NFL_MODEL_VERSION = "nfl-v0.1";
export const NFL_HISTORY_WEEKS = 6;
export const MIN_LEAD_MINUTES = 15;

export const NFL_MARKETS_LM = ["RECEIVING_YARDS", "RUSHING_YARDS", "PASSING_YARDS", "RECEPTIONS", "RUSHING_PLUS_RECEIVING_YARDS"];

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

export async function generateNflDay(f: NflFetchers, now: Date, opts: { date?: string } = {}): Promise<{ day: DayFile; log: string[] }> {
  const log: string[] = [];
  const date = opts.date ?? easternDate(now.toISOString());
  const cutoff = now.getTime() + MIN_LEAD_MINUTES * 60_000;
  const empty = (note: string) => {
    const day = selectDay(date, [], now, undefined, { priced: true, idPrefix: "nfl-", modelVersion: NFL_MODEL_VERSION });
    day.notes = [note];
    return { day, log };
  };

  const current = await retry(() => f.loadWeek());
  const slate = current.games.filter((g) => g.state === "pre" && Date.parse(g.startUtc) > cutoff && easternDate(g.startUtc) === date);
  log.push(`NFL week ${current.week}: ${current.games.length} games, ${slate.length} open for picks on ${date}`);
  if (slate.length === 0) return empty("NFL: no games left to pick today.");

  let offers: Offer[];
  try {
    offers = await retry(() => f.loadOffers());
  } catch (err) {
    log.push(`Could not read Linemate NFL (${(err as Error).message})`);
    return empty("NFL: Linemate could not be read, so no picks were made.");
  }
  log.push(`Linemate: ${offers.length} NFL offers`);
  if (offers.length === 0) return empty("NFL: Linemate has no data yet, so no picks were made.");

  let averages: NflAvg[];
  try {
    averages = await retry(() => f.loadAverages(date));
  } catch (err) {
    log.push(`Could not read NFL leaders (${(err as Error).message})`);
    return empty("NFL: league leaders could not be read, so no picks were made.");
  }
  const leaders = nflLeaders(averages);
  log.push(`${averages.length} season averages read`);

  const weeks = Array.from({ length: NFL_HISTORY_WEEKS }, (_, i) => current.week - 1 - i).filter((w) => w >= 1);
  const finals: Array<{ g: NbaGame }> = [];
  await mapLimit(weeks, 3, async (w) => {
    try {
      for (const g of (await retry(() => f.loadWeek(w))).games) if (g.state === "post") finals.push({ g });
    } catch {
      /* a missing week only thins the history */
    }
  });
  // This week's finished games count too, such as a Thursday night game.
  for (const g of current.games) if (g.state === "post") finals.push({ g });
  const boxes: Array<{ date: string; box: NflBox }> = [];
  await mapLimit(finals, 4, async ({ g }) => {
    try {
      const box = await retry(() => f.loadBox(g.id));
      if (box && box.final) boxes.push({ date: g.startUtc, box });
    } catch {
      /* skip */
    }
  });
  log.push(`${boxes.length} box scores loaded`);
  if (boxes.length === 0) return empty("NFL: no box score history could be read, so no picks were made.");

  const h = buildNflHistories(boxes);
  const seasonByName = new Map(averages.map((a) => [nameKey(a.name), a]));
  const projections: Projection[] = [];
  for (const g of slate) {
    for (const [team, opponent] of [[g.away, g.home], [g.home, g.away]] as const) {
      for (const player of h.players.values()) {
        if (player.team !== team) continue;
        const season = seasonByName.get(player.id);
        if (!season) continue;
        const markets = NFL_MARKETS.filter((m) => leaders[m].has(player.id));
        if (markets.length === 0) continue;
        projections.push(...projectNfl(h, player, season, { team, opponent, gameId: g.id, gameStart: g.startUtc }, markets));
      }
    }
  }
  log.push(`${new Set(projections.map((p) => p.key)).size} leaders projected`);

  const raw = nflCandidates(projections, offers);
  log.push(`${raw.length} alt-line candidates with a Hard Rock price`);
  const candidates = blendWithMarket(applyPriors(raw, "nfl", parlaybot as Priors));
  const day = selectDay(date, candidates, now, undefined, { priced: true, idPrefix: "nfl-", modelVersion: NFL_MODEL_VERSION });
  if (raw.length === 0) day.notes.push("NFL: no leader had a matching Hard Rock line, so no picks were made.");
  return { day, log };
}

/** Run the NFL day, turning an unexpected failure into a note so the other sports still go out. */
export async function generateNflDayOrNote(f: NflFetchers, now: Date, opts: { date?: string } = {}): Promise<{ day: DayFile; log: string[] }> {
  try {
    return await generateNflDay(f, now, opts);
  } catch (err) {
    const date = opts.date ?? easternDate(now.toISOString());
    const day = selectDay(date, [], now, undefined, { priced: true, idPrefix: "nfl-", modelVersion: NFL_MODEL_VERSION });
    day.notes = [`NFL: could not run (${(err as Error).message}), so no NFL picks were made.`];
    return { day, log: [`NFL run failed: ${(err as Error).message}`] };
  }
}
