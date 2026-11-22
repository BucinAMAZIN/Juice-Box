// Research only: win rate and return when betting the side the book juiced (or the other side) at the actual closing price. Run: npx tsx scripts/research-skew.ts
import { existsSync, readFileSync } from "node:fs";
import { LEAGUES } from "../src/data/leagues";
import { fromRow, totalResult, type LineGame } from "../src/engine/lines";

const prob = (am: number): number => (am < 0 ? -am / (-am + 100) : 100 / (am + 100));
const win$ = (am: number): number => (am < 0 ? 100 / -am : am / 100);
const seasonOf = (g: LineGame, mlb: boolean) => { const d = new Date(g.start); const y = d.getUTCFullYear(); return mlb ? y : d.getUTCMonth() + 1 >= 7 ? y : y - 1; };
interface R { g: LineGame; over: number; under: number; skew: number; season: number }

for (const l of LEAGUES) {
  const hp = `public/data/lines/${l.id}/history.json`, ep = `public/data/lines/${l.id}/extras.json`;
  if (!existsSync(hp) || !existsSync(ep)) continue;
  const ex: Record<string, Array<number | null>> = JSON.parse(readFileSync(ep, "utf8")).rows;
  const rows: R[] = [];
  for (const r of JSON.parse(readFileSync(hp, "utf8")).rows) {
    const g = fromRow(r); const e = ex[g.id]; if (!e || e[3] == null || e[4] == null) continue;
    rows.push({ g, over: e[3], under: e[4], skew: prob(e[3]) - prob(e[4]), season: seasonOf(g, l.id === "mlb") });
  }
  const seasons = [...new Set(rows.map((r) => r.season))].sort();
  console.log(`\n=== ${l.label}: ${rows.length} games ===`);
  for (const th of [0.01, 0.02, 0.03]) {
    for (const [name, pick] of [["bet the juiced side", (r: R): "over" | "under" => (r.skew > 0 ? "over" : "under")], ["bet the cheap side", (r: R): "over" | "under" => (r.skew > 0 ? "under" : "over")]] as const) {
      const sel = rows.filter((r) => Math.abs(r.skew) >= th);
      let w = 0, lo = 0, ret = 0; const by = new Map<number, [number, number, number]>();
      for (const r of sel) {
        const t = totalResult(r.g); if (t === "push" || t == null) continue;
        const side = pick(r); const price = side === "over" ? r.over : r.under; const won = t === side;
        const gain = won ? win$(price) : -1; ret += gain; won ? w++ : lo++;
        const b = by.get(r.season) ?? [0, 0, 0]; b[0] += won ? 1 : 0; b[1] += 1; b[2] += gain; by.set(r.season, b);
      }
      const n = w + lo; if (n < 100) continue;
      console.log(`  skew>=${th} ${name}: ${n} bets, ${(100 * w / n).toFixed(1)}% win, ROI ${(100 * ret / n).toFixed(1)}% | ${seasons.map((s) => { const b = by.get(s); return b && b[1] >= 30 ? `${s}:${(100 * b[0] / b[1]).toFixed(0)}%/${(100 * b[2] / b[1]).toFixed(0)}%roi(${b[1]})` : ""; }).filter(Boolean).join(" ")}`);
    }
  }
}
