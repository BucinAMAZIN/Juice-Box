import { mkdirSync, writeFileSync } from "node:fs";
import { loadNbaMinutes } from "../src/data/espn";
import { loadNhlToi } from "../src/data/nhl";

const date = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const nba = await loadNbaMinutes(date);
console.log(`NBA minutes: ${nba.size} players`, [...nba.entries()].slice(0, 3));
const nhl = await loadNhlToi(date).catch((e: unknown) => { console.log("NHL time on ice failed:", String(e)); return new Map<string, number>(); });
console.log(`NHL time on ice: ${nhl.size} skaters`, [...nhl.entries()].slice(0, 3));
if (nba.size < 50) throw new Error("Too few NBA players; keeping the old file");
if (process.argv.includes("--dry-run")) process.exit(0);
mkdirSync("public/data", { recursive: true });
writeFileSync("public/data/nba-minutes.json", JSON.stringify({ date, minutes: Object.fromEntries(nba), nhl: Object.fromEntries(nhl) }) + "\n");
