import type { CountDist } from "./dist";
import type { Market } from "./types";

/**
 * Rate x opportunity. A player's expected count is what he does per 60 minutes in each game
 * state, times the minutes we project him to play in that state.
 */
export interface Situation {
  ev: number;
  pp: number;
  pk: number;
}

export function expectedCount(ratesPer60: Situation, toiMinutes: Situation): number {
  return (ratesPer60.ev * toiMinutes.ev + ratesPer60.pp * toiMinutes.pp + ratesPer60.pk * toiMinutes.pk) / 60;
}

/**
 * Empirical-Bayes style shrinkage. A small sample is pulled toward the prior; a large one is not.
 * `exposure` and `priorWeight` share a unit (minutes played, or games).
 */
export function shrinkRate(observedRate: number, exposure: number, priorRate: number, priorWeight: number): number {
  if (exposure <= 0) return priorRate;
  return (observedRate * exposure + priorRate * priorWeight) / (exposure + priorWeight);
}

/**
 * Blend a rate observed in a specific lineup context (for example, "with his usual linemate out")
 * with the player's overall rate. Small samples barely move the number.
 */
export function blendContext(contextRate: number, contextExposure: number, overallRate: number, k: number): number {
  return shrinkRate(contextRate, contextExposure, overallRate, k);
}

/** Multiply adjustment factors together, clamped so no single input can run away with a projection. */
export function combineFactors(factors: number[], min = 0.7, max = 1.3): number {
  const product = factors.reduce((acc, f) => acc * f, 1);
  return Math.min(max, Math.max(min, product));
}

/**
 * Starting dispersion per market. These are assumptions to calibrate against logged results,
 * not measured constants. Smaller size means more game-to-game spread.
 */
export const DEFAULT_DISPERSION: Record<Market, number | null> = {
  sog: 10,
  points: 12,
  goals: null, // close to Poisson
  assists: 12,
  saves: 40,
};

export function distributionFor(market: Market, mean: number, size?: number): CountDist {
  const s = size ?? DEFAULT_DISPERSION[market];
  return s == null ? { kind: "poisson", mean } : { kind: "negbin", mean, size: s };
}

export interface ProjectionInput {
  market: Market;
  ratesPer60: Situation;
  toiMinutes: Situation;
  /** Opponent, pace, venue and similar multipliers. Each near 1.0. */
  factors?: number[];
  dispersion?: number;
}

export interface Projection {
  mean: number;
  dist: CountDist;
}

export function project(input: ProjectionInput): Projection {
  const base = expectedCount(input.ratesPer60, input.toiMinutes);
  const mean = base * combineFactors(input.factors ?? []);
  return { mean, dist: distributionFor(input.market, mean, input.dispersion) };
}
