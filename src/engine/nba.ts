import { atLeast } from "../core/ladder";
import type { Sport } from "../core/potd";
import type { NbaBox, NbaLine, SeasonAvg } from "../data/espn";
import { nameKey } from "../data/nhl";
import type { Projection } from "./project";
import type { Candidate } from "./select";
import type { NbaMarket } from "./types";
import { boxNameKey, indexOffers, type Offer } from "../data/linemate";
import { LM_NAMES } from "./pricing";

export const NBA_MARKETS: NbaMarket[] = ["points", "rebounds", "assists", "threes", "pr", "pa", "ra", "pra"];
export const LEADER_COUNT = 12;
export const MIN_SEASON_GAMES = 8;
export const MIN_RECENT_GAMES = 5;
export const RECENCY = 0.9;
/** Games of season-long evidence blended against the recent form. */
export const SEASON_WEIGHT = 8;
/** Negative-binomial sizes, set from typical NBA game-to-game spread. Larger means closer to Poisson. */
export const NBA_DISPERSION: Record<NbaMarket, number> = { points: 16, rebounds: 20, assists: 22, threes: 60, pr: 22, pa: 22, ra: 25, pra: 27 };

export function statOf(l: { points: number; rebounds: number; assists: number; threes: number }, m: NbaMarket): number {
  switch (m) {
    case "points": return l.points;
    case "rebounds": return l.rebounds;
    case "assists": return l.assists;
    case "threes": return l.threes;
    case "pr": return l.points + l.rebounds;
    case "pa": return l.points + l.assists;
    case "ra": return l.rebounds + l.assists;
    case "pra": return l.points + l.rebounds + l.assists;
  }
}

export interface NbaGameLine extends NbaLine {
  gameId: number;
  date: string;
}

export interface NbaPlayer {
  id: string;
  name: string;
  team: string;
  /** Newest game first. */
  games: NbaGameLine[];
}

export interface NbaHistories {
  players: Map<string, NbaPlayer>;
  /** Team -> game ids, newest first. */
  teamGames: Map<string, number[]>;
}

export function buildNbaHistories(items: Array<{ date: string; box: NbaBox }>): NbaHistories {
  const sorted = [...items].sort((a, b) => b.date.localeCompare(a.date));
  const players = new Map<string, NbaPlayer>();
  const teamGames = new Map<string, number[]>();
  for (const { date, box } of sorted) {
    const teams = new Set<string>();
    for (const p of box.players) {
      teams.add(p.team);
      const id = nameKey(p.name);
      let h = players.get(id);
      if (!h) {
        h = { id, name: p.name, team: p.team, games: [] };
        players.set(id, h);
      }
      h.games.push({ ...p, gameId: box.gameId, date });
    }
    for (const t of teams) teamGames.set(t, [...(teamGames.get(t) ?? []), box.gameId]);
  }
  return { players, teamGames };
}

export type Leaders = Record<NbaMarket, Set<string>>;

/** Top 12 per category among players with enough games. Combos rank by the sum of their averages. */
export function nbaLeaders(avgs: SeasonAvg[], count = LEADER_COUNT, minGames = MIN_SEASON_GAMES): Leaders {
  const pool = avgs.filter((a) => a.games >= minGames);
  const out = {} as Leaders;
  for (const m of NBA_MARKETS) {
    const ranked = [...pool].sort((a, b) => statOf(b, m) - statOf(a, m)).slice(0, count);
    out[m] = new Set(ranked.map((a) => nameKey(a.name)));
  }
  return out;
}

function playedRecently(h: NbaHistories, p: NbaPlayer, n = 3): boolean {
  const recent = (h.teamGames.get(p.team) ?? []).slice(0, n);
  if (recent.length < n) return false;
  const played = new Set(p.games.map((g) => g.gameId));
  return recent.every((id) => played.has(id));
}

export interface NbaMatchup {
  team: string;
  opponent: string;
  gameId: number;
  gameStart: string;
}

export function projectNba(h: NbaHistories, player: NbaPlayer, season: SeasonAvg, matchup: NbaMatchup, markets: NbaMarket[]): Projection[] {
  const games = player.games.slice(0, 10);
  if (games.length < MIN_RECENT_GAMES || !playedRecently(h, player)) return [];
  const w = games.map((_, i) => RECENCY ** i);
  const wSum = w.reduce((a, b) => a + b, 0);
  const avgMin = games.reduce((a, g, i) => a + g.minutes * w[i]!, 0) / wSum;
  const out: Projection[] = [];
  for (const market of markets) {
    const recent = games.reduce((a, g, i) => a + statOf(g, market) * w[i]!, 0) / wSum;
    const mean = (recent * games.length + statOf(season, market) * SEASON_WEIGHT) / (games.length + SEASON_WEIGHT);
    out.push({
      key: player.id,
      sport: "nba" as Sport,
      player: player.name,
      team: matchup.team,
      opponent: matchup.opponent,
      gameId: matchup.gameId,
      gameStart: matchup.gameStart,
      market,
      mean,
      dist: { kind: "negbin", mean, size: NBA_DISPERSION[market] },
      games: games.length,
      avgToi: avgMin,
    });
  }
  return out;
}

/** Every Linemate rung for a projected player and market becomes a candidate with its real price. */
export function nbaCandidates(projections: Projection[], offers: Offer[], minProb = 0.4, maxProb = 0.9): Candidate[] {
  const index = indexOffers(offers);
  const out: Candidate[] = [];
  for (const p of projections) {
    const key = boxNameKey(p.player);
    for (const name of LM_NAMES[p.market]) {
      const offer = index.find("nba", key, p.team, name);
      if (!offer) continue;
      for (const rung of offer.ladder) {
        if (Math.abs((rung.value % 1) - 0.5) > 1e-9) continue;
        const threshold = rung.value + 0.5;
        const prob = atLeast(p.dist, threshold);
        if (prob < minProb || prob > maxProb) continue;
        out.push({ projection: p, threshold, line: rung.value, prob, price: { american: rung.american, book: rung.book } });
      }
      break;
    }
  }
  return out;
}
