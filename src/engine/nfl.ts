import { atLeast } from "../core/ladder";
import type { CountDist } from "../core/dist";
import type { NflAvg, NflBox, NflLine } from "../data/espn";
import { boxNameKey, indexOffers, type Offer } from "../data/linemate";
import { nameKey } from "../data/nhl";
import type { Projection } from "./project";
import { LM_NAMES } from "./pricing";
import type { Candidate } from "./select";
import type { NflMarket } from "./types";

export const NFL_MARKETS: NflMarket[] = ["passYds", "rushYds", "recYds", "receptions", "rushRecYds"];
export const LEADER_COUNT = 12;
export const MIN_SEASON_GAMES = 6;
export const MIN_RECENT_GAMES = 4;
export const RECENCY = 0.85;
/** Games of season-long evidence blended against recent form. */
export const SEASON_WEIGHT = 4;
/** Game-to-game spread as a share of the mean. Receivers and runners are boom or bust; passers are steadier. */
export const NFL_CV: Record<NflMarket, number> = { passYds: 0.3, rushYds: 0.7, recYds: 0.75, receptions: 0.45, rushRecYds: 0.6 };

export function statOf(l: { passYds: number; rushYds: number; recYds: number; receptions: number }, m: NflMarket): number {
  switch (m) {
    case "passYds": return l.passYds;
    case "rushYds": return l.rushYds;
    case "recYds": return l.recYds;
    case "receptions": return l.receptions;
    case "rushRecYds": return l.rushYds + l.recYds;
  }
}

/** Negative binomial with the given mean and coefficient of variation. */
export function distFor(mean: number, cv: number): CountDist {
  const variance = Math.max((cv * mean) ** 2, mean * 1.2);
  return { kind: "negbin", mean, size: (mean * mean) / (variance - mean) };
}

export interface NflGameLine extends NflLine {
  gameId: number;
  date: string;
}

export interface NflPlayer {
  id: string;
  name: string;
  team: string;
  /** Newest game first. */
  games: NflGameLine[];
}

export interface NflHistories {
  players: Map<string, NflPlayer>;
  /** Team -> game ids, newest first. */
  teamGames: Map<string, number[]>;
}

export function buildNflHistories(items: Array<{ date: string; box: NflBox }>): NflHistories {
  const sorted = [...items].sort((a, b) => b.date.localeCompare(a.date));
  const players = new Map<string, NflPlayer>();
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

export type NflLeaders = Record<NflMarket, Set<string>>;

export function nflLeaders(avgs: NflAvg[], count = LEADER_COUNT, minGames = MIN_SEASON_GAMES): NflLeaders {
  const pool = avgs.filter((a) => a.games >= minGames);
  const out = {} as NflLeaders;
  for (const m of NFL_MARKETS) {
    out[m] = new Set([...pool].sort((a, b) => statOf(b, m) - statOf(a, m)).slice(0, count).map((a) => nameKey(a.name)));
  }
  return out;
}

/** True when the player appeared in each of his team's last two games, a rough guard against injuries. */
function playedRecently(h: NflHistories, p: NflPlayer, n = 2): boolean {
  const recent = (h.teamGames.get(p.team) ?? []).slice(0, n);
  if (recent.length < n) return false;
  const played = new Set(p.games.map((g) => g.gameId));
  return recent.every((id) => played.has(id));
}

export interface NflMatchup {
  team: string;
  opponent: string;
  gameId: number;
  gameStart: string;
}

export function projectNfl(h: NflHistories, player: NflPlayer, season: NflAvg, matchup: NflMatchup, markets: NflMarket[]): Projection[] {
  const games = player.games.slice(0, 6);
  if (games.length < MIN_RECENT_GAMES || !playedRecently(h, player)) return [];
  const w = games.map((_, i) => RECENCY ** i);
  const wSum = w.reduce((a, b) => a + b, 0);
  const out: Projection[] = [];
  for (const market of markets) {
    const recent = games.reduce((a, g, i) => a + statOf(g, market) * w[i]!, 0) / wSum;
    const mean = (recent * games.length + statOf(season, market) * SEASON_WEIGHT) / (games.length + SEASON_WEIGHT);
    if (mean <= 0) continue;
    out.push({
      key: player.id,
      sport: "nfl",
      player: player.name,
      team: matchup.team,
      opponent: matchup.opponent,
      gameId: matchup.gameId,
      gameStart: matchup.gameStart,
      market,
      mean,
      dist: distFor(mean, NFL_CV[market]),
      games: games.length,
      avgToi: 0,
    });
  }
  return out;
}

/** Every Hard Rock rung for a projected leader becomes a candidate with its real price. */
export function nflCandidates(projections: Projection[], offers: Offer[], minProb = 0.4, maxProb = 0.92): Candidate[] {
  const index = indexOffers(offers);
  const out: Candidate[] = [];
  for (const p of projections) {
    const key = boxNameKey(p.player);
    for (const name of LM_NAMES[p.market]) {
      const offer = index.find("nfl", key, p.team, name);
      if (!offer) continue;
      for (const rung of offer.hr) {
        if (Math.abs((rung.value % 1) - 0.5) > 1e-9) continue;
        const threshold = rung.value + 0.5;
        const prob = atLeast(p.dist, threshold);
        if (prob < minProb || prob > maxProb) continue;
        out.push({ projection: p, threshold, line: rung.value, prob, price: { american: rung.american, book: "Hard Rock" } });
      }
      break;
    }
  }
  return out;
}
