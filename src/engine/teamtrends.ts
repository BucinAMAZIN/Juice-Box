import { type LineGame } from "./lines";

/** Linemate's team markets that grade from a final score alone. First-half and first-quarter versions need period scores and are left out. */
export type TrendMarket = "SPREAD" | "TEAM_TOTAL" | "MONEY_LINE" | "GAME_TOTAL";
export const TREND_MARKETS: TrendMarket[] = ["SPREAD", "TEAM_TOTAL", "MONEY_LINE", "GAME_TOTAL"];
export const MARKET_TEXT: Record<TrendMarket, string> = { SPREAD: "Spread", TEAM_TOTAL: "Team total", MONEY_LINE: "Moneyline", GAME_TOTAL: "Game total" };

/** One Linemate team trend: a team has beaten this line in `hits` of its last `games`. */
export interface TeamTrend {
  id: string;
  sport: "nba" | "nfl" | "nhl";
  /** Linemate's game id, "YYYYMMDD-AWAY-HOME". */
  gameId: string;
  start: string;
  team: string;
  opponent: string;
  teamName?: string;
  home: boolean;
  market: TrendMarket;
  side: "cover" | "over" | "under";
  /** Spread: points the team receives (negative when it gives them). Totals: the number. Moneyline: 0. */
  line: number;
  hits: number;
  games: number;
  h2h?: { games: number; hits: number };
  split?: { games: number; hits: number };
  /** Price at the exact line: Hard Rock's when it lists that line, otherwise the best other book's. */
  price?: number;
  book?: string;
  /** Hard Rock selection id, only when Hard Rock lists this exact line. */
  sid?: string;
}

/** Linemate's numbers at face value: the recent record, the head to head and the home/away split, each padded with one win and one loss and weighted by games. */
export function trendChance(t: Pick<TeamTrend, "hits" | "games" | "h2h" | "split">): number {
  const parts: Array<[number, number]> = [];
  const add = (hits: number, n: number) => { if (n > 0) parts.push([(hits + 1) / (n + 2), n]); };
  add(t.hits, t.games);
  if (t.split) add(t.split.hits, t.split.games);
  if (t.h2h) add(t.h2h.hits, t.h2h.games);
  const w = parts.reduce((a, [, n]) => a + n, 0);
  return w === 0 ? 0.5 : parts.reduce((a, [r, n]) => a + r * n, 0) / w;
}

export type TrendOutcome = "win" | "loss" | "push";

/** The final score for a team's game, found by the teams' codes and kickoff, or null when the game is not finished or cannot be matched. */
export function finalFor(t: TeamTrend, finals: LineGame[], canon: (code: string) => string): { team: number; opp: number } | null {
  const a = canon(t.team);
  const b = canon(t.opponent);
  const kickoff = Date.parse(t.start);
  for (const g of finals) {
    if (g.favScore == null || g.dogScore == null || Math.abs(Date.parse(g.start) - kickoff) > 3 * 3_600_000) continue;
    const fav = canon(g.fav);
    const dog = canon(g.dog);
    if (fav === a && dog === b) return { team: g.favScore, opp: g.dogScore };
    if (dog === a && fav === b) return { team: g.dogScore, opp: g.favScore };
  }
  return null;
}

export function gradeTrend(t: TeamTrend, score: { team: number; opp: number }): TrendOutcome {
  const cmp = (x: number, y: number): TrendOutcome => (x > y ? "win" : x < y ? "loss" : "push");
  switch (t.market) {
    case "MONEY_LINE": return cmp(score.team, score.opp);
    case "SPREAD": return cmp(score.team + t.line, score.opp);
    case "TEAM_TOTAL": return t.side === "under" ? cmp(t.line, score.team) : cmp(score.team, t.line);
    case "GAME_TOTAL": return t.side === "under" ? cmp(t.line, score.team + score.opp) : cmp(score.team + score.opp, t.line);
  }
}

/** Team codes differ between Linemate and ESPN (WSH/WAS, GS/GSW, OKL/OKC). Both are mapped to one spelling. */
const ALIAS: Record<string, string> = { WSH: "WAS", GS: "GSW", NY: "NYK", SA: "SAS", NO: "NOP", UTAH: "UTA", OKL: "OKC", WPJ: "WPG", FLO: "FLA", TB: "TBL", NJ: "NJD", LA: "LAK", SJ: "SJS", CLB: "CBJ", VGK: "VGK", LV: "LV" };
export const canonTeam = (sport: string, code: string): string => (sport === "nfl" ? (code === "WSH" ? "WAS" : code === "LAR" ? "LA" : code) : (ALIAS[code] ?? code));
