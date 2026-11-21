import { nameKey, type Boxscore } from "../data/nhl";

export interface GameLine {
  gameId: number;
  date: string;
  sog: number;
  points: number;
  goals: number;
  assists: number;
  toi: number;
}

export interface PlayerHistory {
  key: string;
  name: string;
  team: string;
  position: string;
  /** Newest game first. */
  games: GameLine[];
}

export interface DatedBox {
  date: string;
  box: Boxscore;
}

export interface Histories {
  players: Map<string, PlayerHistory>;
  /** Team -> game ids, newest first. */
  teamGames: Map<string, number[]>;
  /** Team -> shots allowed per game. */
  shotsAllowed: Map<string, number>;
  leagueShotsPerGame: number;
}

/** Turn recent box scores into per-player game logs and team shot-suppression numbers. */
export function buildHistories(items: DatedBox[]): Histories {
  const sorted = [...items].sort((a, b) => b.date.localeCompare(a.date));
  const players = new Map<string, PlayerHistory>();
  const teamGames = new Map<string, number[]>();
  const allowedTotal = new Map<string, number>();
  const allowedGames = new Map<string, number>();

  for (const { date, box } of sorted) {
    const teamsHere = new Set<string>();
    const shotsBy = new Map<string, number>();
    for (const p of box.players) {
      teamsHere.add(p.team);
      shotsBy.set(p.team, (shotsBy.get(p.team) ?? 0) + p.sog);
      const key = p.playerId ? String(p.playerId) : nameKey(p.name);
      let h = players.get(key);
      if (!h) {
        h = { key, name: p.name, team: p.team, position: p.position, games: [] };
        players.set(key, h);
      }
      h.games.push({ gameId: box.gameId, date, sog: p.sog, points: p.points, goals: p.goals, assists: p.assists, toi: p.toiMinutes });
    }
    for (const team of teamsHere) {
      const list = teamGames.get(team) ?? [];
      list.push(box.gameId);
      teamGames.set(team, list);
      // Shots this team's opponent took against it.
      const opp = box.players.find((p) => p.team === team)?.opponent;
      if (opp) {
        allowedTotal.set(team, (allowedTotal.get(team) ?? 0) + (shotsBy.get(opp) ?? 0));
        allowedGames.set(team, (allowedGames.get(team) ?? 0) + 1);
      }
    }
  }

  const shotsAllowed = new Map<string, number>();
  let total = 0;
  let games = 0;
  for (const [team, sum] of allowedTotal) {
    const n = allowedGames.get(team) ?? 0;
    if (n > 0) shotsAllowed.set(team, sum / n);
    total += sum;
    games += n;
  }
  return { players, teamGames, shotsAllowed, leagueShotsPerGame: games > 0 ? total / games : 0 };
}
