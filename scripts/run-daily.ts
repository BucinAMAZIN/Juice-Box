import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { loadOffers } from "../src/data/linemate";
import { loadBoxscore, loadClubSchedule, loadLeaders, loadSchedule } from "../src/data/nhl";
import { loadNbaBox, loadNbaScoreboard, loadNbaSeasonAverages } from "../src/data/espn";
import { generateDay } from "../src/engine/daily";
import type { DayFile } from "../src/engine/types";
import { appendNew, mergeDays } from "../src/engine/merge";
import { NBA_MARKETS_LM, generateNbaDayOrNote } from "../src/engine/nbaRun";
import { shortOdds } from "../src/engine/select";

const DATA = "public/data";
const dry = process.argv.includes("--dry-run");

// --date=YYYY-MM-DD previews another day's slate. It is dry-run only, so a wrong date can never be written.
const dateArg = process.argv.find((a) => a.startsWith("--date="))?.slice("--date=".length);
if (dateArg && !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) throw new Error(`Bad --date: ${dateArg}`);
if (dateArg && !dry) throw new Error("--date only works with --dry-run.");

const now = new Date();
const opts = dateArg ? { date: dateArg } : {};
const { day: nhlDay, log: nhlLog } = await generateDay({ loadSchedule, loadClubSchedule, loadBoxscore, loadLeaders, loadOffers: () => loadOffers("nhl", ["SHOTS_ON_GOAL", "POINTS", "ASSISTS", "ANYTIME_GOAL_SCORER"]) }, now, opts);
const { day: nbaDay, log: nbaLog } = await generateNbaDayOrNote(
  { loadScoreboard: loadNbaScoreboard, loadBox: loadNbaBox, loadAverages: loadNbaSeasonAverages, loadOffers: () => loadOffers("nba", NBA_MARKETS_LM) },
  now,
  opts,
);
const log = [...nhlLog, ...nbaLog];
const label = (tag: string, notes: string[]) => notes.map((n) => (n.startsWith(`${tag}:`) ? n : `${tag}: ${n}`));
nhlDay.notes = label("NHL", nhlDay.notes);
nbaDay.notes = label("NBA", nbaDay.notes);
const day = mergeDays([nhlDay, nbaDay]);
for (const line of log) console.log(line);

console.log(`\nPicks for ${day.date} (${day.modelVersion}):`);
for (const p of day.picks) {
  console.log(
    `  [${p.kind}] ${p.player} [${p.sport}] (${p.team} vs ${p.opponent}) ${p.line + 0.5}+ ${p.market}  model ${(p.modelProb * 100).toFixed(1)}%  ${p.price != null ? `Linemate ${shortOdds(p.price)} (${p.book}) edge ${(p.edge! * 100).toFixed(1)}%` : `take at ${shortOdds(p.limitOdds)} or better`}`,
  );
}
for (const t of day.tickets) console.log(`  [ticket ${t.id}] joint ${(t.jointProb * 100).toFixed(1)}%  legs ${t.legIds.join(" + ")}  needs +${t.minAmerican} or better`);
for (const n of day.notes) console.log(`  note: ${n}`);

if (dry) {
  console.log("\nDry run: nothing written.");
  process.exit(0);
}

mkdirSync(`${DATA}/picks`, { recursive: true });
const file = `${DATA}/picks/${day.date}.json`;
if (existsSync(file)) {
  const saved = JSON.parse(readFileSync(file, "utf8")) as DayFile;
  const { day: grown, added } = appendNew(saved, day);
  if (added > 0) {
    writeFileSync(file, JSON.stringify(grown, null, 2) + "\n");
    console.log(`\n${file} already existed. Saved picks were left alone and ${added} new pick(s) were added.`);
  } else {
    console.log(`\n${file} already exists and there is nothing new to add.`);
  }
} else {
  writeFileSync(file, JSON.stringify(day, null, 2) + "\n");
  console.log(`\nWrote ${file}`);
}

const dates = readdirSync(`${DATA}/picks`)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(".json", ""))
  .sort();
writeFileSync(`${DATA}/index.json`, JSON.stringify({ dates, updatedAt: now.toISOString() }, null, 2) + "\n");
