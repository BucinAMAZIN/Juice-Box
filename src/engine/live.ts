import type { TeamTrend } from "./teamtrends";

export type GameState = "pre" | "in" | "post";

/** Where a game stands: its clock text and how much of regulation is gone (0 to 1). */
export interface GameStatus {
  state: GameState;
  detail: string;
  frac: number;
}

/** Regulation length in periods and minutes per period. */
export const REGULATION: Record<string, { periods: number; minutes: number }> = { nba: { periods: 4, minutes: 12 }, nfl: { periods: 4, minutes: 15 }, nhl: { periods: 3, minutes: 20 }, ncaaf: { periods: 4, minutes: 15 }, ncaab: { periods: 2, minutes: 20 }, mlb: { periods: 9, minutes: 0 } };

/** "5:12" or "5:12.3" to minutes. */
export const clockMinutes = (clock: string): number => {
  const m = /^(\d+):(\d+)/.exec(clock.trim());
  return m ? Number(m[1]) + Number(m[2]) / 60 : 0;
};

/** Share of regulation played, from the period and the time left on its clock. Overtime counts as finished. */
export function elapsedFraction(sport: string, period: number, clock: string): number {
  const r = REGULATION[sport];
  if (!r || r.minutes === 0 || period < 1) return 0;
  if (period > r.periods) return 1;
  const played = (period - 1) * r.minutes + (r.minutes - clockMinutes(clock));
  return Math.max(0, Math.min(1, played / (r.periods * r.minutes)));
}

export type PropLive = { tone: "hit" | "miss" | "on" | "off" | "wait"; text: string };

/** What to say about a prop while its game is on: the number so far against the line, and whether it has cleared it. */
export function propLive(side: "over" | "under", line: number, actual: number | null, status: GameStatus, unit: string): PropLive | null {
  if (status.state === "pre") return null;
  const need = side === "over" ? `${Math.floor(line) + 1}+` : `under ${line}`;
  if (actual == null) return status.state === "post" ? { tone: "miss", text: `FINAL · no stats recorded (did not play)` } : { tone: "wait", text: `LIVE ${status.detail} · has not played yet` };
  const cleared = side === "over" ? actual > line : actual < line;
  if (status.state === "post") return { tone: cleared ? "hit" : "miss", text: `FINAL · ${actual} ${unit} (needs ${need}) · ${cleared ? "HIT" : "MISS"}` };
  if (side === "over" && actual > line) return { tone: "hit", text: `LIVE ${status.detail} · ${actual} ${unit} (needs ${need}) · HIT` };
  if (side === "under" && actual > line) return { tone: "miss", text: `LIVE ${status.detail} · ${actual} ${unit} (needs ${need}) · MISS` };
  const pace = status.frac >= 0.1 ? actual / status.frac : null;
  const projected = pace == null ? "" : ` · on pace for ${pace.toFixed(pace < 10 ? 1 : 0)}`;
  const onPace = pace == null ? true : side === "over" ? pace > line : pace < line;
  return { tone: onPace ? "on" : "off", text: `LIVE ${status.detail} · ${actual} ${unit} (needs ${need})${projected}` };
}

/** Whole-game score from one team's point of view. */
export interface Score { team: number; opp: number }

export type TrendLive = { tone: "hit" | "miss" | "on" | "off"; text: string };

/** What to say about a team trend while its game is on or finished. Totals pace needs the clock, so it is only shown when known. */
export function trendLive(t: Pick<TeamTrend, "market" | "side" | "line" | "sport">, score: Score, status: GameStatus): TrendLive | null {
  if (status.state === "pre") return null;
  const done = status.state === "post";
  const lead = score.team - score.opp;
  const tag = done ? "FINAL" : `LIVE ${status.detail}`;
  const result = (ok: boolean, label: string): TrendLive => ({ tone: done ? (ok ? "hit" : "miss") : ok ? "on" : "off", text: `${tag} · ${label}${done ? (ok ? " · HIT" : " · MISS") : ""}` });
  switch (t.market) {
    case "MONEY_LINE": return result(lead > 0, `${score.team}-${score.opp}`);
    case "SPREAD": {
      const margin = lead + t.line;
      return result(margin > 0, `${score.team}-${score.opp} · ${margin > 0 ? `covering by ${+margin.toFixed(1)}` : margin === 0 ? "pushing" : `${+(-margin).toFixed(1)} short of covering`}`);
    }
    case "TEAM_TOTAL": {
      const ok = t.side === "over" ? score.team > t.line : score.team < t.line;
      const pace = !done && status.frac >= 0.1 ? ` · pace ${Math.round(score.team / status.frac)}` : "";
      if (!done && t.side === "over" && score.team > t.line) return { tone: "hit", text: `${tag} · ${score.team} points (over ${t.line}) · HIT` };
      if (!done && t.side === "under" && score.team > t.line) return { tone: "miss", text: `${tag} · ${score.team} points (under ${t.line}) · MISS` };
      return result(ok, `${score.team} points (${t.side} ${t.line})${pace}`);
    }
    case "GAME_TOTAL": {
      const sum = score.team + score.opp;
      const ok = t.side === "over" ? sum > t.line : sum < t.line;
      const pace = !done && status.frac >= 0.1 ? ` · pace ${Math.round(sum / status.frac)}` : "";
      if (!done && t.side === "over" && sum > t.line) return { tone: "hit", text: `${tag} · ${sum} total (over ${t.line}) · HIT` };
      if (!done && t.side === "under" && sum > t.line) return { tone: "miss", text: `${tag} · ${sum} total (under ${t.line}) · MISS` };
      return result(ok, `${sum} total (${t.side} ${t.line})${pace}`);
    }
  }
}

/** What to say about a game on the Lines tab: the score, who is covering and where the total is heading. */
export function gameLive(
  g: { fav: string; dog: string; favHome: boolean; spread: number; total: number; ml?: number },
  game: { state: GameState; homeScore: number | null; awayScore: number | null; detail?: string },
  frac: number,
): PropLive | null {
  if (game.state === "pre" || game.homeScore == null || game.awayScore == null) return null;
  const fav = g.favHome ? game.homeScore : game.awayScore;
  const dog = g.favHome ? game.awayScore : game.homeScore;
  const done = game.state === "post";
  const sum = fav + dog;
  const tag = done ? "FINAL" : `LIVE ${game.detail ?? ""}`.trim();
  const score = `${g.fav} ${fav} - ${g.dog} ${dog}`;
  const total = sum > g.total ? `total ${sum} is over ${g.total}` : !done && frac >= 0.1 ? `total ${sum}, pace ${Math.round(sum / frac)} vs ${g.total}` : `total ${sum} vs ${g.total}`;
  if (g.ml != null) return { tone: done ? "hit" : "on", text: `${tag} · ${score} · ${total}` };
  const margin = fav - dog - g.spread;
  const side = margin > 0 ? `${g.fav} covering by ${+margin.toFixed(1)}` : margin < 0 ? `${g.dog} covering by ${+(-margin).toFixed(1)}` : "spread is a push";
  return { tone: done ? "hit" : "on", text: `${tag} · ${score} · ${side} · ${total}` };
}
