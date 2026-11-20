import { gradePick } from "../core/grade";
import type { Market, Pick } from "../core/types";
import type { Ledger } from "./ledger";
import { findPlayer, loadBoxscore, loadSchedule, type Boxscore, type PlayerLine, type ScheduledGame } from "./nhl";

export function statFor(player: PlayerLine, market: Market): number | null {
  switch (market) {
    case "sog":
      return player.sog;
    case "points":
      return player.points;
    case "goals":
      return player.goals;
    case "assists":
      return player.assists;
    default:
      return null;
  }
}

export function matchGame(games: ScheduledGame[], team: string, opponent: string): ScheduledGame | undefined {
  return games.find((g) => (g.away === team && g.home === opponent) || (g.home === team && g.away === opponent));
}

/** Calendar date in US Eastern, which is how the NHL schedule groups games. */
export function easternDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function previousDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export interface GradeDeps {
  loadSchedule: (date: string) => Promise<ScheduledGame[]>;
  loadBoxscore: (gameId: number) => Promise<Boxscore | null>;
}

export const liveDeps: GradeDeps = { loadSchedule, loadBoxscore };

export interface AutoGradeResult {
  graded: number;
  skipped: Array<{ pickId: string; player: string; reason: string }>;
}

/**
 * Grade every ungraded pick whose game is final and whose player we can find in the boxscore.
 * Anything it cannot settle is left alone and reported, never guessed.
 */
export async function autoGrade(ledger: Ledger, deps: GradeDeps = liveDeps, now = new Date()): Promise<AutoGradeResult> {
  const result: AutoGradeResult = { graded: 0, skipped: [] };
  const schedules = new Map<string, ScheduledGame[]>();
  const boxes = new Map<number, Boxscore | null>();

  const skip = (p: Pick, reason: string) => result.skipped.push({ pickId: p.id, player: p.player, reason });

  for (const pick of ledger.ungraded()) {
    if (Date.parse(pick.gameStart) > now.getTime()) {
      skip(pick, "Game has not started");
      continue;
    }
    try {
      const date = easternDate(pick.gameStart);
      let game: ScheduledGame | undefined;
      for (const d of [date, previousDay(date)]) {
        if (!schedules.has(d)) schedules.set(d, await deps.loadSchedule(d));
        game = matchGame(schedules.get(d)!, pick.team, pick.opponent);
        if (game) break;
      }
      if (!game) {
        skip(pick, "Game not found on the schedule");
        continue;
      }
      if (!boxes.has(game.id)) boxes.set(game.id, await deps.loadBoxscore(game.id));
      const box = boxes.get(game.id);
      if (!box || !box.final) {
        skip(pick, "Game is not final yet");
        continue;
      }
      const line = findPlayer(box, pick.player);
      if (!line) {
        skip(pick, "Player not found in boxscore (check the name)");
        continue;
      }
      const actual = statFor(line, pick.market);
      if (actual == null) {
        skip(pick, `Market ${pick.market} cannot be graded automatically`);
        continue;
      }
      ledger.addGrade(gradePick(pick, actual, ledger.closeFor(pick.id), now));
      result.graded++;
    } catch (err) {
      skip(pick, err instanceof Error ? err.message : "Lookup failed");
    }
  }
  return result;
}
