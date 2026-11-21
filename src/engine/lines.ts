import type { NcaaGame, NcaaLine } from "../data/ncaa";
import { etDate } from "./blowouts";

/** One game with its closing (or current) spread and total, and how it finished. */
export interface LineGame {
  id: string;
  start: string;
  /** Kickoff date in Eastern time. */
  date: string;
  fav: string;
  dog: string;
  favHome: boolean;
  /** Points the favorite gives. Zero for a pick'em. Hockey and baseball use the standard 1.5 line. */
  spread: number;
  /** The favorite's moneyline price as a positive number (150 means -150), for leagues where ESPN lists that and not a spread. */
  ml?: number;
  total: number;
  status: "pre" | "in" | "post";
  favScore?: number;
  dogScore?: number;
  /** Win share of each team's record on the scoreboard (tracked games only). */
  favWin?: number;
  dogWin?: number;
}

/** ESPN lists a moneyline in the spread slot for hockey and baseball. No real point spread is 100 or more. */
export function withMoneyline<T extends { spread: number; ml?: number }>(g: T): T {
  return g.spread >= 100 ? { ...g, ml: g.spread, spread: 1.5 } : g;
}

export function toLineGame(g: NcaaGame, line: NcaaLine): LineGame {
  const favHome = line.favHome ?? line.fav === g.home;
  const out: LineGame = withMoneyline({ id: g.id, start: g.start, date: etDate(g.start), fav: favHome ? g.home : g.away, dog: favHome ? g.away : g.home, favHome, spread: line.spread, total: line.total, status: g.state } as LineGame);
  const fw = favHome ? g.homeWin : g.awayWin;
  const dw = favHome ? g.awayWin : g.homeWin;
  if (fw != null) out.favWin = fw;
  if (dw != null) out.dogWin = dw;
  if (g.state === "post" && g.homeScore != null && g.awayScore != null) {
    out.favScore = favHome ? g.homeScore : g.awayScore;
    out.dogScore = favHome ? g.awayScore : g.homeScore;
  }
  return out;
}

export const points = (g: LineGame): number | null => (g.favScore != null && g.dogScore != null ? g.favScore + g.dogScore : null);
export const totalResult = (g: LineGame): "over" | "under" | "push" | null => {
  const p = points(g);
  return p == null ? null : p > g.total ? "over" : p < g.total ? "under" : "push";
};
/** Did the favorite cover? Null for a pick'em, which has no spread to cover. */
export const coverResult = (g: LineGame): "cover" | "miss" | "push" | null => {
  if (g.favScore == null || g.dogScore == null || g.spread <= 0) return null;
  const margin = g.favScore - g.dogScore;
  return margin > g.spread ? "cover" : margin < g.spread ? "miss" : "push";
};

/** Compact rows for the big history files: [id, start, fav, dog, favHome, spread, total, favScore, dogScore]. */
export type LineRow = [string, string, string, string, 0 | 1, number, number, number, number];
export const toRow = (g: LineGame): LineRow | null => (g.favScore != null && g.dogScore != null ? [g.id, g.start, g.fav, g.dog, g.favHome ? 1 : 0, g.ml ?? g.spread, g.total, g.favScore, g.dogScore] : null);
export const fromRow = (r: LineRow): LineGame => withMoneyline({ id: r[0], start: r[1], date: etDate(r[1]), fav: r[2], dog: r[3], favHome: r[4] === 1, spread: r[5], total: r[6], status: "post" as const, favScore: r[7], dogScore: r[8] });

export interface Rate {
  n: number;
  hits: number;
  /** Hit share of decided games, or null with none. */
  pct: number | null;
  /** 95% Wilson interval for the true rate. */
  lo: number | null;
  hi: number | null;
}

export function rate(hits: number, misses: number): Rate {
  const n = hits + misses;
  if (n === 0) return { n: 0, hits: 0, pct: null, lo: null, hi: null };
  const p = hits / n;
  const z = 1.96;
  const d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { n, hits, pct: p, lo: centre - half, hi: centre + half };
}

export const overRate = (games: LineGame[]): Rate => rate(games.filter((g) => totalResult(g) === "over").length, games.filter((g) => totalResult(g) === "under").length);
/** How often the favorite simply wins. */
export const winRate = (games: LineGame[]): Rate => rate(games.filter((g) => g.favScore! > g.dogScore!).length, games.filter((g) => g.favScore! < g.dogScore!).length);
export const coverRate = (games: LineGame[]): Rate => rate(games.filter((g) => coverResult(g) === "cover").length, games.filter((g) => coverResult(g) === "miss").length);

/** Cut points that split a list of numbers into thirds, rounded to the half point. */
export function thirds(values: number[]): [number, number] {
  const v = [...values].sort((a, b) => a - b);
  if (v.length === 0) return [0, 0];
  const at = (q: number): number => Math.round(v[Math.min(v.length - 1, Math.floor(v.length * q))]! * 2) / 2;
  return [at(1 / 3), at(2 / 3)];
}

const band = (x: number, [a, b]: [number, number]): 0 | 1 | 2 => (x < a ? 0 : x < b ? 1 : 2);
const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export interface Cell {
  /** Readable label, such as "Favorite by 3 to 6.5, total 221 or more". */
  label: string;
  games: LineGame[];
  over: Rate;
  cover: Rate;
  /** The favorite winning outright. */
  win: Rate;
  /** Largest gap from 50% among the two rates whose interval clears 50%, 0 when neither does. */
  edge: number;
  pick: "over" | "under" | "favorite" | "underdog" | null;
}

export interface Slice {
  spreadCuts: [number, number];
  totalCuts: [number, number];
  /** True when favorite strength is a moneyline price. */
  ml: boolean;
  cells: Cell[];
}

/** How strong the favorite is: the spread, or the moneyline price where that is what the league lists. */
export const strength = (g: LineGame): number => g.ml ?? g.spread;
const spreadLabel = (i: number, [a, b]: [number, number], ml = false): string =>
  ml ? (i === 0 ? `favorite shorter than -${fmt(a)}` : i === 1 ? `favorite -${fmt(a)} to -${fmt(b - 1)}` : `favorite -${fmt(b)} or longer`) : i === 0 ? `favorite by under ${fmt(a)}` : i === 1 ? `favorite by ${fmt(a)} to ${fmt(b - 0.5)}` : `favorite by ${fmt(b)}+`;
const totalLabel = (i: number, [a, b]: [number, number]): string => (i === 0 ? `total under ${fmt(a)}` : i === 1 ? `total ${fmt(a)} to ${fmt(b - 0.5)}` : `total ${fmt(b)}+`);

/** Split a league's games into three spread bands by three total bands and measure each. A cell is flagged only when its interval clears 50%. */
export function slice(games: LineGame[], minGames = 30): Slice {
  const done = games.filter((g) => g.favScore != null);
  const ml = done.some((g) => g.ml != null);
  const spreadCuts = thirds(done.map(strength));
  const totalCuts = thirds(done.map((g) => g.total));
  const cells: Cell[] = [];
  for (let s = 0; s < 3; s++) {
    for (let t = 0; t < 3; t++) {
      const here = done.filter((g) => band(strength(g), spreadCuts) === s && band(g.total, totalCuts) === t);
      if (here.length === 0) continue;
      const over = overRate(here);
      const cover = coverRate(here);
      const flags: Array<[Cell["pick"], number]> = [];
      if (over.n >= minGames && over.lo! > 0.5) flags.push(["over", over.pct! - 0.5]);
      if (over.n >= minGames && over.hi! < 0.5) flags.push(["under", 0.5 - over.pct!]);
      if (!ml && cover.n >= minGames && cover.lo! > 0.5) flags.push(["favorite", cover.pct! - 0.5]);
      if (!ml && cover.n >= minGames && cover.hi! < 0.5) flags.push(["underdog", 0.5 - cover.pct!]);
      flags.sort((a, b) => b[1] - a[1]);
      cells.push({ label: `${spreadLabel(s, spreadCuts, ml)}, ${totalLabel(t, totalCuts)}`, games: here, over, cover, win: winRate(here), edge: flags[0]?.[1] ?? 0, pick: flags[0]?.[0] ?? null });
    }
  }
  return { spreadCuts, totalCuts, ml, cells };
}

/** Which cell today's game falls in, by the cut points of the history. */
export function cellFor(g: LineGame, s: Slice): Cell | null {
  const label = `${spreadLabel(band(strength(g), s.spreadCuts), s.spreadCuts, s.ml)}, ${totalLabel(band(g.total, s.totalCuts), s.totalCuts)}`;
  return s.cells.find((c) => c.label === label) ?? null;
}
