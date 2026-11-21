import { overUnder, type CountDist } from "./dist";
import { expectedValue, impliedProb } from "./odds";

/** P(X >= n): the "n+" alternate line. */
export function atLeast(dist: CountDist, n: number): number {
  return overUnder(dist, n - 0.5).over;
}

export interface Rung {
  /** The "n+" threshold, for example 25 for "25+ points". */
  threshold: number;
  /** Model probability that the player reaches the threshold. */
  prob: number;
  odds: number | null;
  /**
   * Break-even rate of the quoted price. Alternate lines are usually posted one-sided, so this still
   * includes the vig and the edge shown is conservative.
   */
  bookProb: number | null;
  edge: number | null;
  ev: number | null;
}

/** Price every rung of an alternate-line ladder against the model. Rungs without a quote carry no edge. */
export function priceLadder(
  dist: CountDist,
  thresholds: number[],
  quotes: Partial<Record<number, number>> = {},
): Rung[] {
  return [...thresholds]
    .sort((a, b) => a - b)
    .map((threshold) => {
      const prob = atLeast(dist, threshold);
      const odds = quotes[threshold] ?? null;
      if (odds == null) return { threshold, prob, odds: null, bookProb: null, edge: null, ev: null };
      const bookProb = impliedProb(odds);
      return { threshold, prob, odds, bookProb, edge: prob - bookProb, ev: expectedValue(prob, odds) };
    });
}

export interface RungRules {
  minEv: number;
  minProb: number;
}

export const DEFAULT_RUNG_RULES: RungRules = { minEv: 0.02, minProb: 0 };

/** Priced rungs that clear the bar, best expected value first. */
export function rankRungs(rungs: Rung[], rules: RungRules = DEFAULT_RUNG_RULES): Rung[] {
  return rungs
    .filter((r) => r.ev != null && r.ev >= rules.minEv && r.prob >= rules.minProb)
    .sort((a, b) => (b.ev ?? 0) - (a.ev ?? 0));
}
