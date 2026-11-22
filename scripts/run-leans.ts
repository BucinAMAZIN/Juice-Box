import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { LEAGUES } from "../src/data/leagues";
import { freeze, type LoggedLean } from "../src/engine/leanlog";
import { leanFor } from "../src/engine/leans";
import { type LineGame, type LineRow, fromRow, withMoneyline } from "../src/engine/lines";

/** Logs a lean for every tracked game that has not started, once, so it can be graded honestly after the final. */
const dry = process.argv.includes("--dry-run");
const FILE = "public/data/lines/leans.json";
const read = <T>(p: string, fb: T): T => (existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : fb);
const logged = read<{ leans: Record<string, LoggedLean> }>(FILE, { leans: {} }).leans;
let added = 0;
for (const l of LEAGUES) {
  const hist = read<{ rows: LineRow[] }>(`public/data/lines/${l.id}/history.json`, { rows: [] }).rows.map(fromRow);
  const tracked = read<{ games: LineGame[] }>(`public/data/lines/${l.id}/tracked.json`, { games: [] }).games.map(withMoneyline);
  const seen = new Set(hist.map((g) => g.id));
  const all = [...hist, ...tracked.filter((g) => g.status === "post" && !seen.has(g.id))];
  const ml = all.some((g) => g.ml != null);
  for (const g of tracked.filter((x) => x.status === "pre" && !(x.id in logged))) {
    logged[g.id] = freeze(g, l.id, leanFor(g, all, l.id, ml));
    added++;
  }
}
console.log(`Leans: ${added} new logged, ${Object.keys(logged).length} total.`);
if (!dry) writeFileSync(FILE, JSON.stringify({ updatedAt: new Date().toISOString(), leans: logged }) + "\n");
