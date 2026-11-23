import { boxNameKey } from "../data/linemate";
import { statOf as nbaStat } from "../engine/nba";
import { statOf as nflStat } from "../engine/nfl";
import type { HandedPick, NbaMarket, NflMarket } from "../engine/types";

type NbaLine = { points: number; rebounds: number; assists: number; threes: number };
type NflLine = { passYds: number; rushYds: number; recYds: number; receptions: number };
let nba: Record<string, NbaLine> = {};
let nfl: Record<string, NflLine> = {};
type NhlLine = { sog: number; points: number; goals: number; assists: number };
let nhl: Record<string, NhlLine> = {};

export function setSeasonAvgs(j: { nba?: Record<string, NbaLine>; nfl?: Record<string, NflLine>; nhl?: Record<string, NhlLine> }): void {
  nba = j.nba ?? {};
  nfl = j.nfl ?? {};
  nhl = j.nhl ?? {};
}

/** What this player averages per game this season for this prop's stat, or null when we have no number. */
export function seasonAvgOf(p: HandedPick): number | null {
  const key = boxNameKey(p.player);
  if (p.sport === "nba") { const l = nba[key]; return l ? Math.round(nbaStat(l, p.market as NbaMarket) * 10) / 10 : null; }
  if (p.sport === "nfl") { const l = nfl[key]; return l ? Math.round(nflStat(l, p.market as NflMarket) * 10) / 10 : null; }
  if (p.sport === "nhl") { const l = nhl[key]; const v = l ? (l as Record<string, number>)[p.market] : undefined; return v == null ? null : Math.round(v * 100) / 100; }
  return null;
}
