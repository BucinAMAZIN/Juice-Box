import { boxNameKey, indexOffers, rungAt, type LmSport, type Offer } from "../data/linemate";
import type { Candidate } from "./select";
import type { PickMarket } from "./types";

/** Linemate market names to try for each of our markets. */
export const LM_NAMES: Record<PickMarket, string[]> = {
  sog: ["SHOTS_ON_GOAL"],
  points: ["POINTS"],
  assists: ["ASSISTS"],
  goals: ["GOALS", "ANYTIME_GOAL_SCORER"],
};

/** Attach Linemate's best price to each candidate. A candidate Linemate has no matching price for is dropped. */
export function attachPrices(candidates: Candidate[], offers: Offer[], sport: LmSport): { priced: Candidate[]; dropped: number } {
  const index = indexOffers(offers);
  const priced: Candidate[] = [];
  let dropped = 0;
  for (const c of candidates) {
    const p = c.projection;
    let rung = null;
    for (const name of LM_NAMES[p.market]) {
      const offer = index.find(sport, boxNameKey(p.player), p.team, name);
      rung = offer ? rungAt(offer, c.line) : null;
      if (rung) break;
    }
    if (rung) priced.push({ ...c, price: { american: rung.american, book: rung.book } });
    else dropped++;
  }
  return { priced, dropped };
}
