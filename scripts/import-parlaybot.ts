/**
 * Turn the ParlayBOT desk feed (parlay/data.json) into a small table of how its graded, priced
 * single-prop plays did against the price. Usage:
 *   npx tsx scripts/import-parlaybot.ts <path-to-data.json>
 * Writes src/engine/priors/parlaybot.json. Re-run it to refresh the table.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { buildPriors, type FeedRow } from "../src/engine/priors";

const path = process.argv[2];
if (!path) throw new Error("Pass the path to ParlayBOT's parlay/data.json");
const feed = JSON.parse(readFileSync(path, "utf8")) as { results_v2?: { rows?: FeedRow[] } };
const rows = feed.results_v2?.rows ?? [];
const priors = buildPriors(rows);
writeFileSync("src/engine/priors/parlaybot.json", JSON.stringify(priors, null, 2) + "\n");
console.log(`Read ${rows.length} rows, ${priors.sample} graded priced singles (${priors.from} to ${priors.to})`);
for (const s of priors.segments) {
  console.log(`  ${s.key.padEnd(28)} n=${String(s.n).padStart(4)} hit ${(s.hit * 100).toFixed(1)}% vs price ${(s.implied * 100).toFixed(1)}%  haircut ${(s.haircut * 100).toFixed(1)} pts`);
}
