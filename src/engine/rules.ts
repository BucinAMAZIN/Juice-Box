import { type LineGame, type Rate, rate, strength, totalResult } from "./lines";

/** A lean found in the history: play the over or the under when a game fits. */
export interface Rule {
  id: string;
  league: string;
  label: string;
  lean: "over" | "under";
  test: (g: LineGame) => boolean;
}

const month = (g: LineGame): number => new Date(g.start).getUTCMonth() + 1;

export const RULES: Rule[] = [
  { id: "nba-under-pickem", league: "nba", label: "Favorite by under 2.5", lean: "under", test: (g) => strength(g) < 2.5 },
  { id: "nfl-under-pickem", league: "nfl", label: "Favorite by under 2.5", lean: "under", test: (g) => strength(g) < 2.5 },
  { id: "nfl-over-bigfav", league: "nfl", label: "Favorite by 7.5 or more", lean: "over", test: (g) => strength(g) >= 7.5 },
  { id: "nfl-under-nov", league: "nfl", label: "Played in November", lean: "under", test: (g) => month(g) === 11 },
  { id: "ncaaf-over-bigfav", league: "ncaaf", label: "Favorite by 22.5 or more", lean: "over", test: (g) => strength(g) >= 22.5 },
  { id: "ncaaf-under-hightotal", league: "ncaaf", label: "Total of 59 or more", lean: "under", test: (g) => g.total >= 59 },
  { id: "ncaaf-under-aug", league: "ncaaf", label: "Played in August", lean: "under", test: (g) => month(g) === 8 },
  { id: "nhl-over-low", league: "nhl", label: "Total of 5.5 or 6", lean: "over", test: (g) => g.total <= 6 },
  { id: "nhl-under-high", league: "nhl", label: "Total of 6.5 or more", lean: "under", test: (g) => g.total >= 6.5 },
  { id: "mlb-over-low", league: "mlb", label: "Total under 7.5", lean: "over", test: (g) => g.total < 7.5 },
];

/** Forward results count only games played after the rules were set, so they are a real test and not a replay of the history they came from. */
export const RULES_START = "2026-11-22";

export const ruleWon = (r: Rule, g: LineGame): boolean | null => {
  const t = totalResult(g);
  return t == null || t === "push" ? null : r.lean === t;
};

export function ruleRate(r: Rule, games: LineGame[]): Rate {
  const hits = games.filter((g) => r.test(g) && ruleWon(r, g) === true).length;
  const misses = games.filter((g) => r.test(g) && ruleWon(r, g) === false).length;
  return rate(hits, misses);
}

/** Win rate needed to break even at the usual -110 price. */
export const BREAK_EVEN = 110 / 210;
