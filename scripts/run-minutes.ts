import { mkdirSync, writeFileSync } from "node:fs";
import { loadNbaMinutes, loadNbaSeasonAverages, loadNflSeasonAverages } from "../src/data/espn";
import { loadNhlToi } from "../src/data/nhl";

const date = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const nba = await loadNbaMinutes(date);
console.log(`NBA minutes: ${nba.size} players`, [...nba.entries()].slice(0, 3));
const nhl = await loadNhlToi(date).catch((e: unknown) => { console.log("NHL time on ice failed:", String(e)); return new Map<string, number>(); });
console.log(`NHL time on ice: ${nhl.size} skaters`, [...nhl.entries()].slice(0, 3));
// Season per-game averages for every prop stat, so a row can show what the player averages for that prop.
try {
  const r1 = (n: number): number => Math.round(n * 10) / 10;
  const nbaAvg = await loadNbaSeasonAverages(date, 6);
  const nflAvg = await loadNflSeasonAverages(date, 6);
  console.log(`Season averages: ${nbaAvg.length} NBA, ${nflAvg.length} NFL`);
  if (nbaAvg.length > 50 && nflAvg.length > 50 && !process.argv.includes("--dry-run")) {
    mkdirSync("public/data", { recursive: true });
    writeFileSync("public/data/season-avgs.json", JSON.stringify({
      date,
      nba: Object.fromEntries(nbaAvg.map((a) => [a.key, { points: r1(a.points), rebounds: r1(a.rebounds), assists: r1(a.assists), threes: r1(a.threes) }])),
      nfl: Object.fromEntries(nflAvg.map((a) => [a.key, { passYds: r1(a.passYds), rushYds: r1(a.rushYds), recYds: r1(a.recYds), receptions: r1(a.receptions) }])),
    }) + "\n");
  }
} catch (e) { console.log("Season averages failed:", String(e)); }
if (nba.size < 50) throw new Error("Too few NBA players; keeping the old file");
if (process.argv.includes("--dry-run")) process.exit(0);
mkdirSync("public/data", { recursive: true });
writeFileSync("public/data/nba-minutes.json", JSON.stringify({ date, minutes: Object.fromEntries(nba), nhl: Object.fromEntries(nhl) }) + "\n");
