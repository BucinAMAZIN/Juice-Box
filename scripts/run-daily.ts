import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { loadBoxscore, loadClubSchedule, loadSchedule } from "../src/data/nhl";
import { generateDay } from "../src/engine/daily";
import { shortOdds } from "../src/engine/select";

const DATA = "public/data";
const dry = process.argv.includes("--dry-run");

const now = new Date();
const { day, log } = await generateDay({ loadSchedule, loadClubSchedule, loadBoxscore }, now);
for (const line of log) console.log(line);

console.log(`\nPicks for ${day.date} (${day.modelVersion}):`);
for (const p of day.picks) {
  console.log(
    `  [${p.kind}] ${p.player} (${p.team} vs ${p.opponent}) ${p.line + 0.5}+ ${p.market === "sog" ? "SOG" : "pts"}  model ${(p.modelProb * 100).toFixed(1)}%  take at ${shortOdds(p.limitOdds)} or better`,
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
  console.log(`\n${file} already exists. Picks are frozen once written, so it was not overwritten.`);
} else {
  writeFileSync(file, JSON.stringify(day, null, 2) + "\n");
  console.log(`\nWrote ${file}`);
}

const dates = readdirSync(`${DATA}/picks`)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(".json", ""))
  .sort();
writeFileSync(`${DATA}/index.json`, JSON.stringify({ dates, updatedAt: now.toISOString() }, null, 2) + "\n");
