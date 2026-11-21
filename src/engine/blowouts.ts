import type { NcaaGame } from "../data/ncaa";

/** One game with a big favorite: the line it closed or stands at, and how it finished. */
export interface BlowoutGame {
  id: string;
  /** Kickoff, UTC. */
  start: string;
  /** Kickoff date in Eastern time. */
  date: string;
  fav: string;
  dog: string;
  spread: number;
  total: number;
  status: "pre" | "in" | "post";
  favScore?: number;
  dogScore?: number;
  points?: number;
  result?: "over" | "under" | "push";
}

export const etDate = (iso: string): string => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

export function toBlowout(g: NcaaGame, line: { fav: string; spread: number; total: number }): BlowoutGame {
  const out: BlowoutGame = { id: g.id, start: g.start, date: etDate(g.start), fav: line.fav, dog: line.fav === g.home ? g.away : g.home, spread: line.spread, total: line.total, status: g.state };
  if (g.state === "post" && g.homeScore != null && g.awayScore != null) {
    const favHome = line.fav === g.home;
    out.favScore = favHome ? g.homeScore : g.awayScore;
    out.dogScore = favHome ? g.awayScore : g.homeScore;
    out.points = g.homeScore + g.awayScore;
    out.result = out.points > line.total ? "over" : out.points < line.total ? "under" : "push";
  }
  return out;
}

export interface Tally {
  n: number;
  over: number;
  under: number;
  push: number;
  /** Share of decided games that went over, or null with none. */
  overPct: number | null;
}

export function tally(games: BlowoutGame[]): Tally {
  const done = games.filter((g) => g.result);
  const over = done.filter((g) => g.result === "over").length;
  const under = done.filter((g) => g.result === "under").length;
  return { n: done.length, over, under, push: done.length - over - under, overPct: over + under > 0 ? over / (over + under) : null };
}

export const ratioOf = (g: BlowoutGame): number => g.total / g.spread;

export const SPREAD_BANDS: Array<[string, (g: BlowoutGame) => boolean]> = [
  ["Favored by 20 to 29.5", (g) => g.spread >= 20 && g.spread < 30],
  ["Favored by 30 to 39.5", (g) => g.spread >= 30 && g.spread < 40],
  ["Favored by 40+", (g) => g.spread >= 40],
];

/** Total against the spread: 40 and a 50 total is a ratio of 1.25. */
export const RATIO_BANDS: Array<[string, (g: BlowoutGame) => boolean]> = [
  ["Total up to 1.3x the spread", (g) => ratioOf(g) <= 1.3],
  ["1.3x to 1.6x", (g) => ratioOf(g) > 1.3 && ratioOf(g) <= 1.6],
  ["Over 1.6x", (g) => ratioOf(g) > 1.6],
];

export const isCoreCase = (g: BlowoutGame): boolean => g.spread >= 40 && g.total >= 50 && g.total <= 52.5;
