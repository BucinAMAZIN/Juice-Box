import { hardRockUrl } from "../data/hardrock";
import { boxNameKey, hrRungAt, indexOffers, type LmSport, type Offer } from "../data/linemate";
import { LM_NAMES } from "./pricing";
import type { DayFile } from "./types";

export interface PickLink {
  /** Hard Rock's current price for this exact line. */
  american: number;
  url: string;
}

export interface DayLinks {
  date: string;
  updatedAt: string;
  picks: Record<string, PickLink>;
  tickets: Record<string, string>;
}

/** Find Hard Rock's current price and bet link for every saved pick it still lists. Links are a convenience, not part of the saved pick. */
export function buildLinks(day: DayFile, offers: Offer[], now: Date): DayLinks {
  const index = indexOffers(offers);
  const picks: Record<string, PickLink> = {};
  const sidById = new Map<string, string>();
  for (const p of day.picks) {
    for (const name of LM_NAMES[p.market]) {
      const offer = index.find(p.sport as LmSport, boxNameKey(p.player), p.team, name);
      const rung = offer ? hrRungAt(offer, p.line) : null;
      if (rung?.sid) {
        picks[p.id] = { american: rung.american, url: hardRockUrl([rung.sid]) };
        sidById.set(p.id, rung.sid);
        break;
      }
    }
  }
  const tickets: Record<string, string> = {};
  for (const t of day.tickets) {
    const sids = t.legIds.map((id) => sidById.get(id));
    if (sids.every((s): s is string => s != null)) tickets[t.id] = hardRockUrl(sids);
  }
  return { date: day.date, updatedAt: now.toISOString(), picks, tickets };
}
