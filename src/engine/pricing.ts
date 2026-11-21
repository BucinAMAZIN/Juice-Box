import { boxNameKey, hrRungAt, indexOffers, type LmSport, type Offer } from "../data/linemate";
import type { Candidate } from "./select";
import type { PickMarket } from "./types";

/** Linemate market names to try for each of our markets. */
export const LM_NAMES: Record<PickMarket, string[]> = {
  sog: ["SHOTS_ON_GOAL"],
  points: ["POINTS"],
  assists: ["ASSISTS"],
  goals: ["GOALS", "ANYTIME_GOAL_SCORER"],
  rebounds: ["REBOUNDS"],
  threes: ["THREE_POINTS_MADE"],
  pr: ["POINTS_PLUS_REBOUNDS"],
  pa: ["POINTS_PLUS_ASSISTS"],
  ra: ["ASSISTS_PLUS_REBOUNDS"],
  pra: ["POINTS_PLUS_ASSISTS_PLUS_REBOUNDS"],
  passYds: ["PASSING_YARDS"],
  rushYds: ["RUSHING_YARDS"],
  recYds: ["RECEIVING_YARDS"],
  receptions: ["RECEPTIONS"],
  rushRecYds: ["RUSHING_PLUS_RECEIVING_YARDS"],
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
      rung = offer ? hrRungAt(offer, c.line) : null;
      if (rung) break;
    }
    if (rung) priced.push({ ...c, price: { american: rung.american, book: "Hard Rock" } });
    else dropped++;
  }
  return { priced, dropped };
}
