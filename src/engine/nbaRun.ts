import { generateNbaDay, NBA_MODEL_VERSION, type NbaFetchers } from "./nbaDaily";
import { selectDay } from "./select";
import { easternDate } from "../data/autograde";
import type { DayFile } from "./types";

/** Linemate market names to request for NBA. */
export const NBA_MARKETS_LM = [
  "POINTS",
  "REBOUNDS",
  "ASSISTS",
  "THREE_POINTS_MADE",
  "POINTS_PLUS_REBOUNDS",
  "POINTS_PLUS_ASSISTS",
  "ASSISTS_PLUS_REBOUNDS",
  "POINTS_PLUS_ASSISTS_PLUS_REBOUNDS",
];

/** Run the NBA day, and turn an unexpected failure into a note so the other sports still go out. */
export async function generateNbaDayOrNote(f: NbaFetchers, now: Date, opts: { date?: string } = {}): Promise<{ day: DayFile; log: string[] }> {
  try {
    return await generateNbaDay(f, now, opts);
  } catch (err) {
    const date = opts.date ?? easternDate(now.toISOString());
    const day = selectDay(date, [], now, undefined, { priced: true, idPrefix: "nba-", modelVersion: NBA_MODEL_VERSION });
    day.notes = [`NBA: could not run (${(err as Error).message}), so no NBA picks were made.`];
    return { day, log: [`NBA run failed: ${(err as Error).message}`] };
  }
}
