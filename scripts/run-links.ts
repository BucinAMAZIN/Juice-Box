/** Refresh Hard Rock prices and bet links for recent picks. Usage: npm run links */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { loadOffers, type LmSport } from "../src/data/linemate";
import { buildLinks } from "../src/engine/links";
import { NBA_MARKETS_LM } from "../src/engine/nbaRun";
import { NFL_MARKETS_LM } from "../src/engine/nflDaily";
import type { DayFile } from "../src/engine/types";

const DATA = "public/data";
const now = new Date();
const dir = `${DATA}/picks`;
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort().slice(-2) : [];
const days = files.map((f) => JSON.parse(readFileSync(`${dir}/${f}`, "utf8")) as DayFile);

const MARKETS: Record<string, string[]> = {
  nba: NBA_MARKETS_LM,
  nfl: NFL_MARKETS_LM,
  nhl: ["SHOTS_ON_GOAL", "POINTS", "ASSISTS", "ANYTIME_GOAL_SCORER"],
};
const sports = [...new Set(days.flatMap((d) => d.picks.map((p) => p.sport)))].filter((s): s is LmSport => s in MARKETS);
const offers = [];
for (const sport of sports) {
  try {
    offers.push(...(await loadOffers(sport, MARKETS[sport]!)));
  } catch (err) {
    console.log(`Could not read Linemate ${sport}: ${(err as Error).message}`);
  }
}
mkdirSync(`${DATA}/links`, { recursive: true });
for (const day of days) {
  const links = buildLinks(day, offers, now);
  const n = Object.keys(links.picks).length;
  console.log(`${day.date}: Hard Rock links for ${n} of ${day.picks.length} picks`);
  writeFileSync(`${DATA}/links/${day.date}.json`, JSON.stringify(links, null, 2) + "\n");
}
