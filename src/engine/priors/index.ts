import { impliedProb } from "../../core/odds";

/** The few fields of a ParlayBOT results row that the import reads. */
export interface FeedRow {
  date?: string;
  sport?: string;
  fam?: string;
  prop?: string;
  pick?: string;
  odds?: string;
  res?: string;
  legs?: unknown[];
}

export interface Segment {
  /** "nba:Player points", or "heavy" for every single priced -200 or worse. */
  key: string;
  n: number;
  wins: number;
  hit: number;
  /** Average win probability the prices implied. */
  implied: number;
  /** Probability points to take off a model probability for this segment. */
  haircut: number;
}

export interface Priors {
  source: string;
  from: string;
  to: string;
  sample: number;
  segments: Segment[];
}

/** Evidence weight for shrinking: a gap seen over n plays counts n / (n + SHRINK_N) of its size. */
export const SHRINK_N = 150;
export const MIN_SEGMENT = 30;
export const HEAVY_PRICE = -200;

function americanOf(odds: string | undefined): number | null {
  if (!odds) return null;
  const n = Number(odds.replace("+", ""));
  return Number.isFinite(n) && n !== 0 ? n : null;
}

export function segmentKey(sport: string, family: string): string {
  return `${sport.toLowerCase()}:${family}`;
}

/** Only graded, priced single props count. Parlays, voids, pushes and unpriced rows are left out. */
export function buildPriors(rows: FeedRow[]): Priors {
  const groups = new Map<string, { n: number; wins: number; implied: number }>();
  const add = (key: string, win: boolean, implied: number) => {
    const g = groups.get(key) ?? { n: 0, wins: 0, implied: 0 };
    g.n++;
    g.implied += implied;
    if (win) g.wins++;
    groups.set(key, g);
  };
  let sample = 0;
  let from = "9999";
  let to = "0000";
  for (const r of rows) {
    if (r.legs && r.legs.length > 0) continue;
    if (r.res !== "W" && r.res !== "L") continue;
    if ((r.prop ?? "").toLowerCase().includes("parlay") || r.fam === "Parlay") continue;
    const a = americanOf(r.odds);
    if (a == null || !r.sport || !r.fam) continue;
    const implied = impliedProb(a);
    const win = r.res === "W";
    sample++;
    if (r.date) {
      if (r.date < from) from = r.date;
      if (r.date > to) to = r.date;
    }
    add(segmentKey(r.sport, r.fam), win, implied);
    if (a <= HEAVY_PRICE) add("heavy", win, implied);
  }
  const segments: Segment[] = [];
  for (const [key, g] of groups) {
    if (g.n < MIN_SEGMENT) continue;
    const hit = g.wins / g.n;
    const implied = g.implied / g.n;
    const gap = Math.max(0, implied - hit);
    segments.push({ key, n: g.n, wins: g.wins, hit, implied, haircut: gap * (g.n / (g.n + SHRINK_N)) });
  }
  segments.sort((a, b) => b.haircut - a.haircut);
  return { source: "ParlayBOT desk feed results_v2", from, to, sample, segments };
}
