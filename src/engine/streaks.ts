import { easternDate } from "../data/autograde";
import { hrRungAt, normalizeTeam, rungAt, type LmSport, type Offer } from "../data/linemate";
import { impliedProb } from "../core/odds";
import { hardRockUrl } from "../data/hardrock";
import type { DayFile, HandedPick, PickMarket } from "./types";

/** Fewest straight games that count as a streak. */
export const MIN_STREAK = 5;
/** Hard Rock price window for the list: shorter than this is too expensive to be worth listing. */
export const PRICE_MIN = -1000;
export const PRICE_MAX = 500;
/** Safety cap on streaks listed per sport per run. It is far above what a day produces, so in practice every 5+ streak is listed. */
export const PER_SPORT = 200;
/** Skip games that start within this many minutes: the list is for bets you can still place. */
export const LEAD_MINUTES = 10;

export const STREAK_MARKETS_LM: Record<"nba" | "nfl" | "nhl", Record<string, PickMarket>> = {
  nba: {
    POINTS: "points",
    REBOUNDS: "rebounds",
    ASSISTS: "assists",
    THREE_POINTS_MADE: "threes",
    POINTS_PLUS_REBOUNDS: "pr",
    POINTS_PLUS_ASSISTS: "pa",
    ASSISTS_PLUS_REBOUNDS: "ra",
    POINTS_PLUS_ASSISTS_PLUS_REBOUNDS: "pra",
  },
  nfl: {
    RECEIVING_YARDS: "recYds",
    RUSHING_YARDS: "rushYds",
    PASSING_YARDS: "passYds",
    RECEPTIONS: "receptions",
    RUSHING_PLUS_RECEIVING_YARDS: "rushRecYds",
  },
  nhl: { SHOTS_ON_GOAL: "sog", POINTS: "points", ASSISTS: "assists", ANYTIME_GOAL_SCORER: "goals" },
};

export interface GameRef {
  id: number;
  startUtc: string;
  away: string;
  home: string;
  state: string;
}

const bookName = (b: string): string => (b ? b.charAt(0).toUpperCase() + b.slice(1) : "Other book");
const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Over streaks with a Hard Rock price, best streak first, matched to a real game that has not started. */
export function buildStreakPicks(sport: LmSport, offers: Offer[], games: GameRef[], now: Date, date: string, limit = PER_SPORT): { picks: HandedPick[]; log: string[] } {
  const markets = STREAK_MARKETS_LM[sport as "nba" | "nfl" | "nhl"];
  const log: string[] = [];
  if (!markets) return { picks: [], log };
  const cutoff = now.getTime() + LEAD_MINUTES * 60_000;
  const open = games.filter((g) => /^(pre|fut)$/i.test(g.state) && Date.parse(g.startUtc) > cutoff && easternDate(g.startUtc) === date);
  const gameFor = (team: string, opp: string): GameRef | undefined =>
    open.find((g) => {
      const a = normalizeTeam(g.away);
      const h = normalizeTeam(g.home);
      return (a === team && h === opp) || (a === opp && h === team);
    });

  let streaks = 0;
  let unmatched = 0;
  let noPrice = 0;
  let outOfRange = 0;
  let otherBook = 0;
  const out: HandedPick[] = [];
  for (const o of offers) {
    const market = markets[o.marketName];
    if (!market || o.side !== "over" || o.line == null || !o.recent) continue;
    if (o.recent.games < MIN_STREAK || o.recent.hits !== o.recent.games) continue;
    streaks++;
    const game = gameFor(o.team, o.opponent);
    if (!game) {
      unmatched++;
      continue;
    }
    const hr = hrRungAt(o, o.line);
    // Hard Rock does not list every alternate line. Those streaks still show, with the best other book's price and no Hard Rock link.
    const rung = hr ?? rungAt(o, o.line);
    if (!rung) {
      noPrice++;
      continue;
    }
    if (!hr) otherBook++;
    if (rung.american < PRICE_MIN || rung.american > PRICE_MAX) {
      outOfRange++;
      continue;
    }
    const gameId = game.id;
    out.push({
      id: `${date}-s-${sport}-${gameId}-${slug(o.key)}-${market}-${o.line}`,
      createdAt: now.toISOString(),
      gameStart: game.startUtc,
      gameId,
      sport,
      kind: "streak",
      player: o.fullName,
      team: o.team,
      opponent: o.opponent,
      market,
      line: o.line,
      side: "over",
      // No model here: the price's own implied chance stands in so old screens still read.
      modelProb: impliedProb(rung.american),
      limitOdds: rung.american,
      mean: o.line,
      price: rung.american,
      book: hr ? "Hard Rock" : bookName(rung.book),
      streak: o.recent.games,
      ...(o.home != null ? { home: o.home } : {}),
      ...(o.alternate != null ? { alt: o.alternate } : {}),
      ...(o.h2h ? { h2h: o.h2h } : {}),
      ...(o.split ? { split: o.split } : {}),
      ...(o.avg != null ? { avg: Math.round(o.avg * 100) / 100 } : {}),
      ...(o.teamName ? { teamName: o.teamName } : {}),
      ...(hr?.sid ? { sid: hr.sid, url: hardRockUrl([hr.sid]) } : {}),
      note: `Over ${o.line} in ${o.recent.games} straight games.`,
    });
  }
  out.sort((a, b) => (b.streak ?? 0) - (a.streak ?? 0) || (b.price ?? 0) - (a.price ?? 0));
  log.push(`${sport.toUpperCase()}: ${offers.length} rows, ${streaks} streaks of ${MIN_STREAK}+, ${unmatched} without an open game, ${otherBook} shown with another book's price (not at Hard Rock), ${noPrice} with no price anywhere, ${outOfRange} priced outside ${PRICE_MIN} to +${PRICE_MAX}, ${Math.min(limit, out.length)} listed`);
  return { picks: out.slice(0, limit), log };
}

/** Add today's new streaks to the saved file. Saved rows are never changed or removed. */
export function appendStreaks(saved: DayFile | null, date: string, fresh: HandedPick[], notes: string[], now: Date): { day: DayFile; added: number } {
  const base: DayFile = saved ?? { date, generatedAt: now.toISOString(), modelVersion: "streaks-v1", picks: [], tickets: [], notes: [] };
  const have = new Set(base.picks.map((p) => p.id));
  const add = fresh.filter((p) => !have.has(p.id));
  // A saved row keeps its line, price and link for good. Only context fields it lacks (signals) may be filled in.
  const freshById = new Map(fresh.map((p) => [p.id, p]));
  const filled = base.picks.map((p) => {
    const f = freshById.get(p.id);
    if (!f) return p;
    const extra: Partial<HandedPick> = {};
    for (const k of ["home", "alt", "h2h", "split", "avg"] as const) if (p[k] === undefined && f[k] !== undefined) Object.assign(extra, { [k]: f[k] });
    return Object.keys(extra).length ? { ...p, ...extra } : p;
  });
  return { day: { ...base, picks: [...filled, ...add], notes: saved ? base.notes : notes }, added: add.length };
}
