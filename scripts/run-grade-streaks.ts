import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { loadNbaBox, loadNflBox } from "../src/data/espn";
import { loadBoxscore, loadClubSchedule, loadSchedule } from "../src/data/nhl";
import { gradePending } from "../src/engine/daily";
import type { DayFile, DayGrades } from "../src/engine/types";

const DATA = "public/data";
const dry = process.argv.includes("--dry-run");
const read = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const files = existsSync(`${DATA}/streaks`) ? readdirSync(`${DATA}/streaks`).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : [];
const days = files.map((f) => read<DayFile>(`${DATA}/streaks/${f}`));
const existing = new Map<string, DayGrades>();
for (const d of days) {
  const path = `${DATA}/streak-grades/${d.date}.json`;
  if (existsSync(path)) existing.set(d.date, read<DayGrades>(path));
}
const { updated, log } = await gradePending({ loadSchedule, loadClubSchedule, loadBoxscore, loadNbaBox, loadNflBox }, days, existing, new Date());
for (const l of log) console.log(l);
if (log.length === 0) console.log("Nothing to grade yet.");
if (dry) process.exit(0);
mkdirSync(`${DATA}/streak-grades`, { recursive: true });
for (const [date, g] of updated) writeFileSync(`${DATA}/streak-grades/${date}.json`, JSON.stringify(g, null, 2) + "\n");
