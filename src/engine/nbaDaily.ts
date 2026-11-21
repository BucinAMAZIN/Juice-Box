import { easternDate } from "../data/autograde";
import type { NbaBox, NbaGame, SeasonAvg } from "../data/espn";
import type { Offer } from "../data/linemate";
import { nameKey } from "../data/nhl";
import { applyPriors, blendWithMarket } from "./filter";
import { buildNbaHistories, nbaCandidates, nbaLeaders, NBA_MARKETS, projectNba } from "./nba";
import type { Priors } from "./priors";
import parlaybot from "./priors/parlaybot.json";
import type { Projection } from "./project";
import { selectDay } from "./select";
import type { DayFile } from "./types";

export interface NbaFetchers {
  loadScoreboard(date: string): Promise<NbaGame[]>;
  loadBox(gameId: number): Promise<NbaBox | null>;
  loadAverages(date: string): Promise<SeasonAvg[]>;
  loadOffers(): Promise<Offer[]>;
}

export const NBA_MODEL_VERSION = "nba-v0.1";
export const NBA_HISTORY_DAYS = 21;
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

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function generateNbaDay(f: NbaFetchers, now: Date, opts: { date?: string } = {}): Promise<{ day: DayFile; log: string[] }> {
  const log: string[] = [];
  const date = opts.date ?? easternDate(now.toISOString());
  const cutoff = now.getTime() + MIN_LEAD_MINUTES * 60_000;
  const empty = (note: string): { day: DayFile; log: string[] } => {
    const day = selectDay(date, [], now, undefined, { priced: true, idPrefix: "nba-", modelVersion: NBA_MODEL_VERSION });
    day.notes = [note];
    return { day, log };
  };

  const all = await retry(() => f.loadScoreboard(date));
  const slate = all.filter((g) => g.state === "pre" && Date.parse(g.startUtc) > cutoff);
  log.push(`NBA ${date}: ${all.length} games on the scoreboard, ${slate.length} still open for picks`);
  if (slate.length === 0) return empty("NBA: no upcoming games.");

  let offers: Offer[];
  try {
    offers = await retry(() => f.loadOffers());
  } catch (err) {
    log.push(`Could not read Linemate NBA (${(err as Error).message})`);
    return empty("NBA: Linemate could not be read, so no picks were made.");
  }
  log.push(`Linemate: ${offers.length} NBA offers`);
  if (offers.length === 0) return empty("NBA: Linemate has no data yet, so no picks were made.");

  let averages: SeasonAvg[];
  try {
    averages = await retry(() => f.loadAverages(date));
  } catch (err) {
    log.push(`Could not read NBA leaders (${(err as Error).message})`);
    return empty("NBA: league leaders could not be read, so no picks were made.");
  }
  const leaders = nbaLeaders(averages);
  log.push(`${averages.length} season averages read; top ${leaders.points.size} per category kept`);

  const days = Array.from({ length: NBA_HISTORY_DAYS }, (_, i) => shiftDate(date, -(i + 1)));
  const finals: Array<{ id: number; date: string }> = [];
  await mapLimit(days, 3, async (d) => {
    try {
      for (const g of await retry(() => f.loadScoreboard(d))) if (g.state === "post") finals.push({ id: g.id, date: d });
    } catch {
      /* a missing day only thins the history */
    }
  });
  const boxes: Array<{ date: string; box: NbaBox }> = [];
  let failed = 0;
  await mapLimit(finals, 4, async ({ id, date: d }) => {
    try {
      const box = await retry(() => f.loadBox(id));
      if (box && box.final) boxes.push({ date: d, box });
    } catch {
      failed++;
    }
  });
  log.push(`${boxes.length} box scores loaded from the last ${NBA_HISTORY_DAYS} days${failed ? `, ${failed} failed` : ""}`);
  if (boxes.length === 0) return empty("NBA: no box score history could be read, so no picks were made.");

  const h = buildNbaHistories(boxes);
  const seasonByName = new Map(averages.map((a) => [nameKey(a.name), a]));
  const projections: Projection[] = [];
  for (const g of slate) {
    for (const [team, opponent] of [[g.away, g.home], [g.home, g.away]] as const) {
      for (const player of h.players.values()) {
        if (player.team !== team) continue;
        const season = seasonByName.get(player.id);
        if (!season) continue;
        const markets = NBA_MARKETS.filter((m) => leaders[m].has(player.id));
        if (markets.length === 0) continue;
        projections.push(...projectNba(h, player, season, { team, opponent, gameId: g.id, gameStart: g.startUtc }, markets));
      }
    }
  }
  log.push(`${new Set(projections.map((p) => p.key)).size} leaders projected`);

  const raw = nbaCandidates(projections, offers);
  log.push(`${raw.length} alt-line candidates with a Linemate price`);
  const candidates = blendWithMarket(applyPriors(raw, "nba", parlaybot as Priors));
  const day = selectDay(date, candidates, now, undefined, { priced: true, idPrefix: "nba-", modelVersion: NBA_MODEL_VERSION });
  if (raw.length === 0) day.notes.push("NBA: no leader had a matching Linemate line, so no picks were made.");
  return { day, log };
}
