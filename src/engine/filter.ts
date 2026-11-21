import type { Candidate } from "./select";
import { segmentKey, type Priors } from "./priors";
import type { PickMarket } from "./types";
import type { Sport } from "../core/potd";

/** ParlayBOT's family names for each market we price. */
export const FAMILY: Record<PickMarket, string> = {
  sog: "SOG",
  points: "Player points",
  goals: "Goals",
  assists: "Assists",
  rebounds: "Rebounds",
  threes: "3PM",
  pr: "Pts+Reb",
  pa: "Pts+Ast",
  ra: "Reb+Ast",
  pra: "PRA",
};

/** A model probability at or above this would be priced about -233 or worse, where ParlayBOT's history lost money. */
export const HEAVY_PROB = 0.7;

export interface Adjustment {
  haircut: number;
  reason: string;
}

/** Probability points to take off, taken from how ParlayBOT's graded plays did against their prices. */
export function haircutFor(sport: Sport, market: PickMarket, prob: number, priors: Priors): Adjustment {
  const byKey = new Map(priors.segments.map((s) => [s.key, s]));
  const own = byKey.get(segmentKey(sport, FAMILY[market]));
  const heavy = prob >= HEAVY_PRICE_PROB ? byKey.get("heavy") : undefined;
  const a = own?.haircut ?? 0;
  const b = heavy?.haircut ?? 0;
  // The larger one applies. Adding them would count the same plays twice.
  if (a === 0 && b === 0) return { haircut: 0, reason: "" };
  return b > a
    ? { haircut: b, reason: `heavy favorites like this hit ${((heavy!.implied - heavy!.hit) * 100).toFixed(0)} pts below their price in ParlayBOT's history` }
    : { haircut: a, reason: `${sport.toUpperCase()} ${FAMILY[market]} ran ${((own!.implied - own!.hit) * 100).toFixed(0)} pts below price in ParlayBOT's history` };
}

const HEAVY_PRICE_PROB = HEAVY_PROB;

/** Lower each candidate's probability by its haircut. The original is kept in rawProb. */
export function applyPriors(candidates: Candidate[], sport: Sport, priors: Priors): Candidate[] {
  return candidates.map((c) => {
    const adj = haircutFor(sport, c.projection.market, c.prob, priors);
    if (adj.haircut === 0) return c;
    return { ...c, rawProb: c.prob, prob: Math.max(0.01, c.prob - adj.haircut), adjustment: adj.reason };
  });
}
