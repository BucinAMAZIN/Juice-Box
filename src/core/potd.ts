import type { SideEval } from "./evaluate";
import { americanToDecimal } from "./odds";

export type Sport = "nba" | "nfl" | "nhl" | "mlb";
export const SPORTS: Sport[] = ["nba", "nfl", "nhl", "mlb"];

export type Candidate = SideEval & { sport: Sport; label: string };

export interface PotdRules {
  /** Price window for the play of the day, as American odds. Default -135 to -110. */
  minAmerican: number;
  maxAmerican: number;
  minEdge: number;
  minEv: number;
  /** Require a real no-vig comparison, so the edge is not flattered by hidden juice. */
  requireDevig: boolean;
}

export const DEFAULT_POTD_RULES: PotdRules = {
  minAmerican: -135,
  maxAmerican: -110,
  minEdge: 0.03,
  minEv: 0.02,
  requireDevig: true,
};

/** Compare by decimal price so negative and positive American odds sort correctly. */
export function inPriceWindow(american: number, min: number, max: number): boolean {
  const d = americanToDecimal(american);
  const a = americanToDecimal(min);
  const b = americanToDecimal(max);
  return d >= Math.min(a, b) && d <= Math.max(a, b);
}

/** One play per sport: the best expected value inside the price window that clears the bar, or null. */
export function playsOfTheDay(
  candidates: Candidate[],
  rules: PotdRules = DEFAULT_POTD_RULES,
): Record<Sport, Candidate | null> {
  const result: Record<Sport, Candidate | null> = { nba: null, nfl: null, nhl: null, mlb: null };
  for (const sport of SPORTS) {
    const eligible = candidates
      .filter(
        (c) =>
          c.sport === sport &&
          inPriceWindow(c.odds, rules.minAmerican, rules.maxAmerican) &&
          c.edge >= rules.minEdge &&
          c.ev >= rules.minEv &&
          (!rules.requireDevig || c.devigged),
      )
      .sort((a, b) => b.ev - a.ev);
    result[sport] = eligible[0] ?? null;
  }
  return result;
}
