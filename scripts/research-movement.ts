// Research only: does the move from the opening total to the close, or the price skew between over and under, say anything about the result? Run: npx tsx scripts/research-movement.ts
import { existsSync, readFileSync } from "node:fs";
import { LEAGUES } from "../src/data/leagues";
import { fromRow, rate, totalResult, type LineGame } from "../src/engine/lines";

const prob = (am: number): number => (am < 0 ? -am / (-am + 100) : 100 / (am + 100));
const seasonOf = (g: LineGame, mlb: boolean) => { const d = new Date(g.start); const y = d.getUTCFullYear(); return mlb ? y : d.getUTCMonth() + 1 >= 7 ? y : y - 1; };
const BE = 110 / 210;

interface Row { g: LineGame; move: number; skew: number; openSkew: number; season: number }
const f = (r: ReturnType<typeof rate>): string => (r.pct == null ? "–" : `${(r.pct * 100).toFixed(1)}% over (n=${r.n}, ${(r.lo! * 100).toFixed(0)}-${(r.hi! * 100).toFixed(0)})`);
const ov = (rows: Row[]) => rate(rows.filter((r) => totalResult(r.g) === "over").length, rows.filter((r) => totalResult(r.g) === "under").length);
const lean = (rows: Row[], side: "over" | "under") => { const o = ov(rows); return side === "over" ? o : rate(o.n - o.hits, o.hits); };

for (const l of LEAGUES) {
  const hp = `public/data/lines/${l.id}/history.json`, ep = `public/data/lines/${l.id}/extras.json`;
  if (!existsSync(hp) || !existsSync(ep)) continue;
  const extras: Record<string, Array<number | null>> = JSON.parse(readFileSync(ep, "utf8")).rows;
  const rows: Row[] = [];
  for (const r of JSON.parse(readFileSync(hp, "utf8")).rows) {
    const g = fromRow(r); const e = extras[g.id]; if (!e) continue;
    const [ot, oo, ou, co, cu] = e;
    if (ot == null || co == null || cu == null) continue;
    rows.push({ g, move: g.total - ot, skew: prob(co) - prob(cu), openSkew: oo != null && ou != null ? prob(oo) - prob(ou) : 0, season: seasonOf(g, l.id === "mlb") });
  }
  if (rows.length < 200) continue;
  const seasons = [...new Set(rows.map((r) => r.season))].sort();
  console.log(`\n=== ${l.label}: ${rows.length} games with an opening line and prices ===`);
  console.log("over rate all:", f(ov(rows)));
  const moved = rows.filter((r) => r.move !== 0);
  console.log(`line moved in ${(100 * moved.length / rows.length).toFixed(0)}% of games; avg |move| ${(moved.reduce((s, r) => s + Math.abs(r.move), 0) / Math.max(1, moved.length)).toFixed(2)}`);
  const bands: Array<[string, (r: Row) => boolean]> = [
    ["total moved up a lot (>= +2 pts equiv.)", (r) => r.move >= (l.id === "nhl" || l.id === "mlb" ? 0.5 : l.id === "nfl" || l.id === "ncaaf" ? 2 : 3)],
    ["total moved up a little", (r) => r.move > 0 && r.move < (l.id === "nhl" || l.id === "mlb" ? 0.5 : l.id === "nfl" || l.id === "ncaaf" ? 2 : 3)],
    ["no move", (r) => r.move === 0],
    ["total moved down a little", (r) => r.move < 0 && r.move > -(l.id === "nhl" || l.id === "mlb" ? 0.5 : l.id === "nfl" || l.id === "ncaaf" ? 2 : 3)],
    ["total moved down a lot", (r) => r.move <= -(l.id === "nhl" || l.id === "mlb" ? 0.5 : l.id === "nfl" || l.id === "ncaaf" ? 2 : 3)],
  ];
  for (const [name, t] of bands) console.log(`  ${name}: ${f(ov(rows.filter(t)))}`);
  const skews: Array<[string, (r: Row) => boolean]> = [
    ["close price leans over (over juiced)", (r) => r.skew > 0.01],
    ["close price even", (r) => Math.abs(r.skew) <= 0.01],
    ["close price leans under (under juiced)", (r) => r.skew < -0.01],
  ];
  for (const [name, t] of skews) console.log(`  ${name}: ${f(ov(rows.filter(t)))}`);
  // Season by season for the strongest-looking lean, so one lucky year doesn't pass for a pattern.
  const cands: Array<[string, (r: Row) => boolean, "over" | "under"]> = [
    ["moved up a lot -> under (fade)", bands[0]![1], "under"], ["moved up a lot -> over (follow)", bands[0]![1], "over"],
    ["moved down a lot -> over (fade)", bands[4]![1], "over"], ["moved down a lot -> under (follow)", bands[4]![1], "under"],
    ["over juiced -> under (fade)", skews[0]![1], "under"], ["over juiced -> over (follow)", skews[0]![1], "over"],
    ["under juiced -> over (fade)", skews[2]![1], "over"], ["under juiced -> under (follow)", skews[2]![1], "under"],
  ];
  for (const [name, t, side] of cands) {
    const sel = rows.filter(t); const all = lean(sel, side);
    if (all.n < 100) continue;
    const by = seasons.map((s) => { const x = lean(sel.filter((r) => r.season === s), side); return x.n ? `${s}:${(x.pct! * 100).toFixed(0)}%(${x.n})` : ""; }).filter(Boolean).join(" ");
    console.log(`  LEAN ${name}: ${(all.pct! * 100).toFixed(1)}% of ${all.n} (${(all.lo! * 100).toFixed(0)}-${(all.hi! * 100).toFixed(0)})${all.lo! > BE ? " CLEARS BREAK-EVEN" : all.pct! > BE ? " above break-even" : ""} | ${by}`);
  }
}
