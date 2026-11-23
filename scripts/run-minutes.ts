import { mkdirSync, writeFileSync } from "node:fs";
import { loadNbaMinutes } from "../src/data/espn";

const date = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const mins = await loadNbaMinutes(date);
console.log(`NBA minutes: ${mins.size} players`, [...mins.entries()].slice(0, 5));
if (mins.size < 50) throw new Error("Too few players; keeping the old file");
if (process.argv.includes("--dry-run")) process.exit(0);
mkdirSync("public/data", { recursive: true });
writeFileSync("public/data/nba-minutes.json", JSON.stringify({ date, minutes: Object.fromEntries(mins) }) + "\n");
