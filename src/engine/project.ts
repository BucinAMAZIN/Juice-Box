import { distributionFor, shrinkRate } from "../core/model";
import type { Sport } from "../core/potd";
import type { CountDist } from "../core/dist";
import type { Histories, PlayerHistory } from "./history";
import type { NhlMarket, PickMarket } from "./types";

/**
 * League-average rates per 60 minutes, all situations. Derived from typical NHL totals (about 30
 * shots and 7.5 points per team game spread over forward and defense minutes). These are starting
 * assumptions to be checked against logged results, not measured constants.
 */
export const PRIOR_PER_60: Record<"F" | "D", Record<NhlMarket, number>> = {
  F: { sog: 6.7, points: 1.75, goals: 0.77, assists: 0.98 },
  D: { sog: 4.8, points: 1.05, goals: 0.21, assists: 0.84 },
};

/** Minutes of evidence the prior is worth. Scoring stats are noisier than shots, so they lean on the prior more. */
export const PRIOR_WEIGHT_MIN: Record<NhlMarket, number> = { sog: 150, points: 600, goals: 800, assists: 600 };

export const MARKETS: NhlMarket[] = ["sog", "points", "goals", "assists"];

function statOf(g: { sog: number; points: number; goals: number; assists: number }, market: NhlMarket): number {
  return g[market];
}

export const RECENCY = 0.9;
export const MIN_GAMES = 6;
export const MIN_AVG_TOI = 11;

export interface Projection {
  key: string;
  /** Defaults to "nhl" when absent. */
  sport?: Sport;
  player: string;
  team: string;
  opponent: string;
  gameId: number;
  gameStart: string;
  market: PickMarket;
  mean: number;
  dist: CountDist;
  games: number;
  avgToi: number;
}

function positionGroup(position: string): "F" | "D" {
  return position === "D" ? "D" : "F";
}

function weighted(values: number[]): number[] {
  return values.map((_, i) => RECENCY ** i);
}

/** Opponent shot-suppression factor, halved toward 1 and clamped so one team cannot swing a projection far. */
export function opponentShotFactor(h: Histories, opponent: string): number {
  const allowed = h.shotsAllowed.get(opponent);
  if (!allowed || h.leagueShotsPerGame <= 0) return 1;
  const ratio = allowed / h.leagueShotsPerGame;
  return Math.min(1.12, Math.max(0.88, 1 + 0.4 * (ratio - 1)));
}

/** True when the player appeared in each of his team's last `n` games, a rough guard against scratches and injuries. */
export function playedRecently(h: Histories, player: PlayerHistory, n = 3): boolean {
  const recent = (h.teamGames.get(player.team) ?? []).slice(0, n);
  if (recent.length < n) return false;
  const played = new Set(player.games.map((g) => g.gameId));
  return recent.every((id) => played.has(id));
}

export interface Matchup {
  team: string;
  opponent: string;
  gameId: number;
  gameStart: string;
}

export function projectPlayer(h: Histories, player: PlayerHistory, matchup: Matchup): Projection[] {
  const games = player.games.slice(0, 10).filter((g) => g.toi > 0);
  if (games.length < MIN_GAMES || !playedRecently(h, player)) return [];

  const w = weighted(games.map((g) => g.toi));
  const wSum = w.reduce((a, b) => a + b, 0);
  const avgToi = games.reduce((a, g, i) => a + g.toi * w[i]!, 0) / wSum;
  if (avgToi < MIN_AVG_TOI) return [];

  const exposure = games.reduce((a, g) => a + g.toi, 0);
  const group = positionGroup(player.position);
  const out: Projection[] = [];

  for (const market of MARKETS) {
    const total = games.reduce((a, g, i) => a + statOf(g, market) * w[i]!, 0);
    const minutes = games.reduce((a, g, i) => a + g.toi * w[i]!, 0);
    const observed = minutes > 0 ? (total / minutes) * 60 : 0;
    const rate = shrinkRate(observed, exposure, PRIOR_PER_60[group][market], PRIOR_WEIGHT_MIN[market]);
    const factor = market === "sog" ? opponentShotFactor(h, matchup.opponent) : 1;
    const mean = (rate / 60) * avgToi * factor;
    out.push({
      key: player.key,
      player: player.name,
      team: matchup.team,
      opponent: matchup.opponent,
      gameId: matchup.gameId,
      gameStart: matchup.gameStart,
      market,
      mean,
      dist: distributionFor(market, mean),
      games: games.length,
      avgToi,
    });
  }
  return out;
}
