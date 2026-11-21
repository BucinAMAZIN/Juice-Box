import { gradeSide, profitUnits } from "../core/grade";
import { statFor } from "../data/autograde";
import { findPlayer, type Boxscore } from "../data/nhl";
import type { Market } from "../core/types";
import type { NbaBox } from "../data/espn";
import { boxNameKey } from "../data/linemate";
import type { NflBox } from "../data/espn";
import { statOf } from "./nba";
import { statOf as nflStat } from "./nfl";
import type { NbaMarket, NflMarket } from "./types";
import type { DayFile, DayGrades, GradedPick } from "./types";

export interface GradeOutcome {
  grades: GradedPick[];
  /** Picks left open, with the reason, so nothing is guessed. */
  open: Array<{ pickId: string; reason: string }>;
}

/** Grade every pick in a day file that has a final box score and a findable player. */
export function gradeDay(
  day: DayFile,
  boxes: Map<number, Boxscore | null>,
  already: Set<string> = new Set(),
  nbaBoxes: Map<number, NbaBox | null> = new Map(),
  nflBoxes: Map<number, NflBox | null> = new Map(),
): GradeOutcome {
  const out: GradeOutcome = { grades: [], open: [] };
  for (const pick of day.picks) {
    if (already.has(pick.id)) continue;
    if (pick.sport === "nfl") {
      const nfl = nflBoxes.get(pick.gameId);
      if (!nfl) out.open.push({ pickId: pick.id, reason: "No box score" });
      else if (!nfl.final) out.open.push({ pickId: pick.id, reason: "Game not final" });
      else {
        const key = boxNameKey(pick.player);
        const line = nfl.players.find((p) => p.key === key);
        // A player with no line in the box score had no stats in that category, which grades as zero.
        const actual = line ? nflStat(line, pick.market as NflMarket) : 0;
        const outcome = gradeSide(pick.side, pick.line, actual);
        out.grades.push({ pickId: pick.id, actual, outcome, profitAtLimit: profitUnits(outcome, pick.price ?? pick.limitOdds, 1) });
      }
      continue;
    }
    if (pick.sport === "nba") {
      const nba = nbaBoxes.get(pick.gameId);
      if (!nba) out.open.push({ pickId: pick.id, reason: "No box score" });
      else if (!nba.final) out.open.push({ pickId: pick.id, reason: "Game not final" });
      else {
        const key = boxNameKey(pick.player);
        const line = nba.players.find((p) => p.key === key);
        if (!line) out.open.push({ pickId: pick.id, reason: "Player not in box score (did not play or renamed)" });
        else {
          const actual = statOf(line, pick.market as NbaMarket);
          const outcome = gradeSide(pick.side, pick.line, actual);
          out.grades.push({ pickId: pick.id, actual, outcome, profitAtLimit: profitUnits(outcome, pick.price ?? pick.limitOdds, 1) });
        }
      }
      continue;
    }
    const box = boxes.get(pick.gameId);
    if (!box) {
      out.open.push({ pickId: pick.id, reason: "No box score" });
      continue;
    }
    if (!box.final) {
      out.open.push({ pickId: pick.id, reason: "Game not final" });
      continue;
    }
    const player = findPlayer(box, pick.player);
    if (!player) {
      out.open.push({ pickId: pick.id, reason: "Player not in box score (scratched or renamed)" });
      continue;
    }
    const actual = statFor(player, pick.market as Market);
    if (actual == null) {
      out.open.push({ pickId: pick.id, reason: "Market not gradable" });
      continue;
    }
    const outcome = gradeSide(pick.side, pick.line, actual);
    out.grades.push({ pickId: pick.id, actual, outcome, profitAtLimit: profitUnits(outcome, pick.limitOdds, 1) });
  }
  return out;
}

export function mergeGrades(existing: DayGrades | null, date: string, fresh: GradedPick[], now: Date): DayGrades {
  const byId = new Map((existing?.grades ?? []).map((g) => [g.pickId, g]));
  for (const g of fresh) if (!byId.has(g.pickId)) byId.set(g.pickId, g); // write-once
  return { date, gradedAt: now.toISOString(), grades: [...byId.values()] };
}
