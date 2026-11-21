import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { easternDate } from "../src/data/autograde";
import { loadNbaScoreboard, loadNflWeek } from "../src/data/espn";
import { loadRowOffers } from "../src/data/linemate";
import { loadSchedule } from "../src/data/nhl";
import { STREAK_MARKETS_LM, appendStreaks, buildStreakPicks, type GameRef } from "../src/engine/streaks";
import type { DayFile, HandedPick } from "../src/engine/types";

const DATA = "public/data";
const dry = process.argv.includes("--dry-run");
const now = new Date();
const date = easternDate(now.toISOString());

const games: Record<"nba" | "nfl" | "nhl", () => Promise<GameRef[]>> = {
  nba: () => loadNbaScoreboard(date),
  nfl: async () => (await loadNflWeek()).games,
  nhl: () => loadSchedule(date),
};

const picks: HandedPick[] = [];
const notes: string[] = [];
for (const sport of ["nba", "nfl", "nhl"] as const) {
  try {
    const [offers, slate] = await Promise.all([loadRowOffers(sport, Object.keys(STREAK_MARKETS_LM[sport])), games[sport]()]);
    const { picks: p, log } = buildStreakPicks(sport, offers, slate, now, date);
    for (const l of log) console.log(l);
    picks.push(...p);
    if (p.length === 0) notes.push(`${sport.toUpperCase()}: no streaks of 5+ with a Hard Rock price today.`);
  } catch (err) {
    console.log(`${sport.toUpperCase()}: skipped (${err instanceof Error ? err.message : err})`);
    notes.push(`${sport.toUpperCase()}: Linemate or the schedule could not be read this run.`);
  }
}
for (const p of picks) console.log(`  ${p.sport} ${p.team} ${p.player} ${p.line + 0.5}+ ${p.market}  streak ${p.streak}  ${p.price}`);
if (dry) {
  console.log("Dry run: nothing written.");
  process.exit(0);
}
if (picks.length === 0) {
  console.log("Nothing to save.");
  process.exit(0);
}
mkdirSync(`${DATA}/streaks`, { recursive: true });
const file = `${DATA}/streaks/${date}.json`;
const saved = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as DayFile) : null;
const { day, added } = appendStreaks(saved, date, picks, notes, now);
if (added > 0 || !saved) writeFileSync(file, JSON.stringify(day, null, 2) + "\n");
console.log(`${file}: ${added} new streak(s) added.`);
const dates = readdirSync(`${DATA}/streaks`).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.replace(".json", "")).sort();
writeFileSync(`${DATA}/streaks/index.json`, JSON.stringify({ dates, updatedAt: now.toISOString() }, null, 2) + "\n");
