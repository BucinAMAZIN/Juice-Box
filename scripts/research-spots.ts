import { readFileSync } from "node:fs";
import { fromRow, totalResult, coverResult } from "../src/engine/lines";
const load = (id: string) => JSON.parse(readFileSync(`public/data/lines/${id}/history.json`, "utf8")).rows.map(fromRow);
const season = (s: string) => { const d = new Date(s); return String(d.getUTCFullYear() + (d.getUTCMonth() < 6 ? -1 : 0)); };
const test = (id: string, name: string, f: (g: any) => boolean, kind: "under" | "over" | "dog") => {
  const by: Record<string, [number, number]> = {}; let w = 0, n = 0;
  for (const g of load(id)) {
    if (!f(g)) continue;
    let won: boolean | null = null;
    if (kind === "dog") { const c = coverResult(g); won = c == null || c === "push" ? null : c === "miss"; }
    else { const t = totalResult(g); won = t == null || t === "push" ? null : t === kind; }
    if (won == null) continue;
    const b = (by[season(g.start)] ??= [0, 0]); b[0] += won ? 1 : 0; b[1]++; w += won ? 1 : 0; n++;
  }
  console.log(`${id} ${name}: ${w}-${n - w} ${(100 * w / n).toFixed(1)}% | ${Object.entries(by).map(([y, b]) => `${y}:${b[0]}-${b[1] - b[0]}`).join(" ")}`);
};
test("ncaaf", "spread 3.5-7, total 48-51 under", (g) => g.spread >= 3.5 && g.spread <= 7 && g.total >= 48 && g.total <= 51, "under");
test("ncaab", "dog 6-9.5, total 135.5-151.5 cover", (g) => g.spread >= 6 && g.spread <= 9.5 && g.total >= 135.5 && g.total <= 151.5, "dog");
test("ncaab", "dog 0-2.5, total 135.5-151.5 cover", (g) => g.spread >= 0 && g.spread <= 2.5 && g.total >= 135.5 && g.total <= 151.5, "dog");
test("nfl", "fav 7.5-14, total 49-52 under", (g) => g.spread >= 7.5 && g.spread <= 14 && g.total >= 49 && g.total <= 52, "under");
test("nba", "dog 14-19.5, total 203-210.5 cover", (g) => g.spread >= 14 && g.spread <= 19.5 && g.total >= 203 && g.total <= 210.5, "dog");
test("nba", "spread 0-2.5, total 235+ under", (g) => g.spread >= 0 && g.spread <= 2.5 && g.total >= 235, "under");
test("ncaaf", "fav 40+, total 51-58 over", (g) => g.spread >= 40 && g.total >= 51 && g.total <= 58, "over");
test("ncaaf", "spread 14.5-21, total 62+ under", (g) => g.spread >= 14.5 && g.spread <= 21 && g.total >= 62, "under");
test("ncaaf", "dog 3.5-7, total 62+ cover", (g) => g.spread >= 3.5 && g.spread <= 7 && g.total >= 62, "dog");
