import { overUnder, type CountDist } from "./dist";
import { americanToDecimal, devigTwoWay, expectedValue, impliedProb, stakeFraction, type DevigMethod } from "./odds";
import type { Side } from "./types";

export interface PropQuote {
  overOdds?: number;
  underOdds?: number;
}

export interface SideEval {
  side: Side;
  odds: number;
  /** Model win probability, conditional on the bet not pushing. */
  modelProb: number;
  /** Book probability used for the edge: no-vig when both sides are priced, otherwise raw implied. */
  bookProb: number;
  /** True when bookProb is a real no-vig number. False means the vig is still baked in. */
  devigged: boolean;
  /** modelProb - bookProb. */
  edge: number;
  /** Expected profit per unit staked at the offered price. */
  ev: number;
  /** Suggested fraction of bankroll (quarter Kelly, capped). */
  stakeFraction: number;
}

function sideEval(
  side: Side,
  odds: number,
  winRaw: number,
  push: number,
  fair: number | null,
): SideEval {
  const modelProb = push < 1 ? winRaw / (1 - push) : 0;
  const bookProb = fair ?? impliedProb(odds);
  // EV counts a push as zero profit: win pays b, loss costs 1, push returns the stake.
  const b = americanToDecimal(odds) - 1;
  const loss = Math.max(0, 1 - winRaw - push);
  const ev = winRaw * b - loss;
  return {
    side,
    odds,
    modelProb,
    bookProb,
    devigged: fair != null,
    edge: modelProb - bookProb,
    ev,
    stakeFraction: stakeFraction(modelProb, odds),
  };
}

/** Price both sides of a prop against a model distribution. Sides without a price are skipped. */
export function evaluateProp(
  dist: CountDist,
  line: number,
  quote: PropQuote,
  method: DevigMethod = "multiplicative",
): SideEval[] {
  const { over, under, push } = overUnder(dist, line);
  const bothPriced = quote.overOdds != null && quote.underOdds != null;
  const fair = bothPriced ? devigTwoWay(quote.overOdds!, quote.underOdds!, method) : null;
  const out: SideEval[] = [];
  if (quote.overOdds != null) out.push(sideEval("over", quote.overOdds, over, push, fair?.over ?? null));
  if (quote.underOdds != null) out.push(sideEval("under", quote.underOdds, under, push, fair?.under ?? null));
  return out;
}

export interface FlagRules {
  minEdge: number;
  minEv: number;
  /** Require a real no-vig comparison before flagging. */
  requireDevig: boolean;
}

export const DEFAULT_FLAG_RULES: FlagRules = { minEdge: 0.03, minEv: 0.02, requireDevig: false };

/** The single best side of a prop, if it clears the bar. Props carry heavy vig, so the bar is real. */
export function flagBest(evals: SideEval[], rules: FlagRules = DEFAULT_FLAG_RULES): SideEval | null {
  const ok = evals
    .filter((e) => e.edge >= rules.minEdge && e.ev >= rules.minEv && (!rules.requireDevig || e.devigged))
    .sort((a, b) => b.ev - a.ev);
  return ok[0] ?? null;
}

// Re-exported so callers that only need a quick check do not import from two places.
export { expectedValue };
