import { cushionOf } from "./filters";
import type { DayResult } from "./results";
import type { HandedPick } from "../engine/types";
import { cushionBucket, priceBucket, rateBucket, streakBucket } from "./records";

/** One graded prop: the pick as saved, whether it won, and the units it made. */
export interface GradedRow {
  date: string;
  pick: HandedPick;
  won: boolean;
  units: number;
}

export const gradedRows = (history: DayResult[]): GradedRow[] => {
  const out: GradedRow[] = [];
  for (const { date, day, grades } of history) {
    const byId = new Map((grades?.grades ?? []).map((g) => [g.pickId, g]));
    for (const pick of day.picks) {
      const g = byId.get(pick.id);
      if (g && g.outcome !== "push") out.push({ date, pick, won: g.outcome === "win", units: g.profitAtLimit });
    }
  }
  return out;
};

/** The ways a prop is sliced on the Records tab. Each gives a name and the bucket this prop falls in. */
const dims = (p: HandedPick): Array<[string, string]> => [
  ["streak", streakBucket(p.streak ?? 0)],
  ["price", priceBucket(p.price ?? p.limitOdds)],
  ["market", p.market],
  ["h2h", rateBucket(p.h2h)],
  ["split", rateBucket(p.split)],
  ["cushion", cushionBucket(cushionOf(p))],
  ["line", p.alt ? "alt" : "main"],
];

interface Count { hits: number; n: number }
export interface Model {
  sport: string;
  n: number;
  base: number;
  buckets: Map<string, Count>;
}
export type Models = Map<string, Model>;

/** Graded props a sport needs before our grade is shown for it. Below this the sport has too little of its own history to learn from. */
export const MIN_GRADED = 30;
/** How many props of prior weight each bucket gets, so a bucket with a handful of games is pulled back toward the sport's overall rate. */
const PRIOR = 20;
/** The slices overlap (a short price usually comes with a long streak), so their combined push is damped. */
const DAMP = 0.5;

const logit = (p: number): number => Math.log(p / (1 - p));
const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

/** Learn each sport's hit rates from its own graded props, overall and by every slice. */
export function fit(rows: GradedRow[]): Models {
  const models: Models = new Map();
  for (const sport of new Set(rows.map((r) => r.pick.sport))) {
    const mine = rows.filter((r) => r.pick.sport === sport);
    if (mine.length < MIN_GRADED) continue;
    const buckets = new Map<string, Count>();
    for (const r of mine) {
      for (const [d, b] of dims(r.pick)) {
        const c = buckets.get(`${d}|${b}`) ?? { hits: 0, n: 0 };
        c.n++;
        if (r.won) c.hits++;
        buckets.set(`${d}|${b}`, c);
      }
    }
    const hits = mine.filter((r) => r.won).length;
    models.set(sport, { sport, n: mine.length, base: Math.min(0.97, Math.max(0.03, hits / mine.length)), buckets });
  }
  return models;
}

/** Our chance a prop hits, from our own graded results for its sport. Null when the sport has too few graded props. */
export function ourChance(p: HandedPick, models: Models): number | null {
  const m = models.get(p.sport);
  if (!m) return null;
  let x = logit(m.base);
  for (const [d, b] of dims(p)) {
    const c = m.buckets.get(`${d}|${b}`);
    if (!c) continue;
    const shrunk = (c.hits + PRIOR * m.base) / (c.n + PRIOR);
    x += DAMP * (logit(shrunk) - logit(m.base));
  }
  return Math.min(0.97, Math.max(0.03, sigmoid(x)));
}

/**
 * Linemate's side of it: what its own numbers say taken at face value. Straight games over the line, the home/away
 * split and the head-to-head record each become a rate (with one win and one loss added, so a short record is not
 * read as certain), weighted by how many games stand behind them.
 */
export function linemateChance(p: HandedPick): number {
  const parts: Array<[number, number]> = [];
  const add = (hits: number, n: number) => { if (n > 0) parts.push([(hits + 1) / (n + 2), n]); };
  add(p.streak ?? 0, p.streak ?? 0);
  if (p.split) add(p.split.hits, p.split.games);
  if (p.h2h) add(p.h2h.hits, p.h2h.games);
  const w = parts.reduce((a, [, n]) => a + n, 0);
  return w === 0 ? 0.5 : parts.reduce((a, [r, n]) => a + r * n, 0) / w;
}

export type Letter = "A" | "B" | "C" | "D" | "F";
export const letter = (x: number): Letter => (x >= 0.8 ? "A" : x >= 0.7 ? "B" : x >= 0.6 ? "C" : x >= 0.5 ? "D" : "F");

/** Predict each graded day from a model fit on the other days only, so the score is not graded on its own homework. */
export function outOfDay(rows: GradedRow[]): Array<GradedRow & { ours: number | null }> {
  const dates = [...new Set(rows.map((r) => r.date))];
  if (dates.length < 2) return rows.map((r) => ({ ...r, ours: null }));
  const models = new Map(dates.map((d) => [d, fit(rows.filter((r) => r.date !== d))]));
  return rows.map((r) => ({ ...r, ours: ourChance(r.pick, models.get(r.date)!) }));
}

/** The records behind our grade for this prop, such as "10+ straight 16-0", so the colour can be checked against the results. */
export function evidence(p: HandedPick, models: Models): string[] {
  const m = models.get(p.sport);
  if (!m) return [];
  const names: Record<string, string> = { streak: "", price: "", market: "", h2h: "head to head ", split: "home/away ", cushion: "cushion ", line: "" };
  const out: string[] = [];
  for (const [d, b] of dims(p)) {
    if (d === "market" || d === "line" || b.startsWith("No ")) continue;
    const c = m.buckets.get(`${d}|${b}`);
    if (c && c.n >= 5) out.push(`${names[d]}${b} ${c.hits}-${c.n - c.hits}`);
  }
  return out;
}
