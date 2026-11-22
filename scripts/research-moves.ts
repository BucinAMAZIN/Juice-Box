import { readFileSync } from "node:fs";
import { fromRow, totalResult } from "../src/engine/lines";
const win$ = (am: number) => (am < 0 ? 100 / -am : am / 100);
const run = (id: string, name: string, test: (move: number) => boolean, side: "over" | "under") => {
  const ex = JSON.parse(readFileSync(`public/data/lines/${id}/extras.json`, "utf8")).rows;
  let w = 0, l = 0, ret = 0; const by: Record<string, [number, number, number]> = {};
  for (const r of JSON.parse(readFileSync(`public/data/lines/${id}/history.json`, "utf8")).rows) {
    const g = fromRow(r), e = ex[g.id]; if (!e || e[0] == null || e[3] == null || e[4] == null) continue;
    if (!test(g.total - e[0])) continue; const t = totalResult(g); if (t == null || t === "push") continue;
    const price = side === "over" ? e[3] : e[4]; const won = t === side; const gain = won ? win$(price) : -1; ret += gain; won ? w++ : l++;
    const y = String(new Date(g.start).getUTCFullYear() + (new Date(g.start).getUTCMonth() < 6 ? -1 : 0)); const b = (by[y] ??= [0, 0, 0]); b[0] += won ? 1 : 0; b[1]++; b[2] += gain;
  }
  console.log(`${id.toUpperCase()} ${name}: ${w + l} bets, ${(100 * w / (w + l)).toFixed(1)}% win, ROI ${(100 * ret / (w + l)).toFixed(1)}% | ${Object.entries(by).map(([y, b]) => `${y}:${(100 * b[0] / b[1]).toFixed(0)}%/${(100 * b[2] / b[1]).toFixed(0)}%(${b[1]})`).join(" ")}`);
};
run("nfl", "total fell 2+ from open -> over", (m) => m <= -2, "over");
run("nfl", "total fell 1.5+ from open -> over", (m) => m <= -1.5, "over");
run("nfl", "total fell 3+ from open -> over", (m) => m <= -3, "over");
run("ncaab", "total fell 3+ from open -> under", (m) => m <= -3, "under");
run("ncaab", "total fell 2+ from open -> under", (m) => m <= -2, "under");
run("nba", "total fell 3+ from open -> under", (m) => m <= -3, "under");
run("ncaaf", "total rose 2+ from open -> over", (m) => m >= 2, "over");
