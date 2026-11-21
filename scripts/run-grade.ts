import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { loadBoxscore, loadClubSchedule, loadSchedule } from "../src/data/nhl";
import { gradePending } from "../src/engine/daily";
import { buildReport } from "../src/engine/report";
import type { DayFile, DayGrades } from "../src/engine/types";

const DATA = "public/data";
const dry = process.argv.includes("--dry-run");
const now = new Date();

const read = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

const pickFiles = existsSync(`${DATA}/picks`) ? readdirSync(`${DATA}/picks`).filter((f) => f.endsWith(".json")).sort() : [];
const days = pickFiles.map((f) => read<DayFile>(`${DATA}/picks/${f}`));

const existing = new Map<string, DayGrades>();
for (const d of days) {
  const path = `${DATA}/grades/${d.date}.json`;
  if (existsSync(path)) existing.set(d.date, read<DayGrades>(path));
}

const { updated, log } = await gradePending({ loadSchedule, loadClubSchedule, loadBoxscore }, days, existing, now);
for (const line of log) console.log(line);
if (log.length === 0) console.log("Nothing to grade yet.");

const all = new Map([...existing, ...updated]);
const report = buildReport(days, [...all.values()], now);
console.log(`\nGraded ${report.graded} of ${report.totalPicks} picks.`);
for (const f of report.findings) console.log(`  ${f}`);

if (dry) {
  console.log("\nDry run: nothing written.");
  process.exit(0);
}

mkdirSync(`${DATA}/grades`, { recursive: true });
for (const [date, g] of updated) writeFileSync(`${DATA}/grades/${date}.json`, JSON.stringify(g, null, 2) + "\n");
writeFileSync(`${DATA}/report.json`, JSON.stringify(report, null, 2) + "\n");
console.log("Wrote grades and report.");
