// Research only: fits a regression of (final total - line) on team scoring form, rest and the line, trains on older seasons and tests on the newest full one. Run: npx tsx scripts/research-totals.ts
import { readFileSync, existsSync } from "node:fs";
import { LEAGUES } from "../src/data/leagues";
import { fromRow, strength, type LineGame } from "../src/engine/lines";

const N = 10, MINPRIOR = 5;
type Rec = { pf: number; pa: number; line: number; tot: number; t: number };
const seasonOf = (g: LineGame, mlb: boolean) => { const d = new Date(g.start); const y = d.getUTCFullYear(); return mlb ? y : d.getUTCMonth() + 1 >= 7 ? y : y - 1; };
const FEATS = ["expDiff", "overTend", "btb", "lineVsAvg", "strength", "recentTotalVsLine"];

function build(games: LineGame[], mlb: boolean) {
  const hist = new Map<string, Rec[]>();
  const seasonTot = new Map<number, { s: number; n: number }>();
  const out: { x: number[]; y: number; g: LineGame; season: number }[] = [];
  for (const g of [...games].sort((a, b) => a.start.localeCompare(b.start))) {
    const season = seasonOf(g, mlb);
    const k = (t: string) => `${season}|${t}`;
    const a = hist.get(k(g.fav)) ?? [], b = hist.get(k(g.dog)) ?? [];
    const st = seasonTot.get(season) ?? { s: 0, n: 0 };
    const t = new Date(g.start).getTime();
    if (a.length >= MINPRIOR && b.length >= MINPRIOR && st.n > 30) {
      const la = a.slice(-N), lb = b.slice(-N);
      const m = (r: Rec[], f: (x: Rec) => number) => r.reduce((s, x) => s + f(x), 0) / r.length;
      // expected points for each side: own scoring blended with the opponent's points allowed
      const expFav = (m(la, (x) => x.pf) + m(lb, (x) => x.pa)) / 2, expDog = (m(lb, (x) => x.pf) + m(la, (x) => x.pa)) / 2;
      const days = (r: Rec[]) => Math.min(8, (t - r[r.length - 1]!.t) / 86_400_000);
      const btb = (days(a) < 1.5 ? 1 : 0) + (days(b) < 1.5 ? 1 : 0);
      const x = [
        expFav + expDog - g.total,
        (m(la, (r) => r.tot - r.line) + m(lb, (r) => r.tot - r.line)) / 2,
        btb,
        g.total - st.s / st.n,
        strength(g),
        (m(la, (r) => r.tot) + m(lb, (r) => r.tot)) / 2 - g.total,
      ];
      out.push({ x, y: g.favScore! + g.dogScore! - g.total, g, season });
    }
    const r1: Rec = { pf: g.favScore!, pa: g.dogScore!, line: g.total, tot: g.favScore! + g.dogScore!, t };
    const r2: Rec = { pf: g.dogScore!, pa: g.favScore!, line: g.total, tot: r1.tot, t };
    hist.set(k(g.fav), [...a, r1]); hist.set(k(g.dog), [...b, r2]);
    seasonTot.set(season, { s: st.s + g.total, n: st.n + 1 });
  }
  return out;
}

function solve(A: number[][], b: number[]) {
  const n = b.length; const M = A.map((r, i) => [...r, b[i]!]);
  for (let i = 0; i < n; i++) { let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(M[r]![i]!) > Math.abs(M[p]![i]!)) p = r; [M[i], M[p]] = [M[p]!, M[i]!]; for (let r = 0; r < n; r++) if (r !== i) { const f = M[r]![i]! / M[i]![i]!; for (let c = i; c <= n; c++) M[r]![c]! -= f * M[i]![c]!; } }
  return M.map((r, i) => r[n]! / r[i]!);
}
function fit(rows: { x: number[]; y: number }[], lambda = 1) {
  const d = rows[0]!.x.length, mu = Array(d).fill(0), sd = Array(d).fill(0);
  for (const r of rows) r.x.forEach((v, i) => (mu[i] += v / rows.length));
  for (const r of rows) r.x.forEach((v, i) => (sd[i] += (v - mu[i]) ** 2 / rows.length));
  sd.forEach((v, i) => (sd[i] = Math.sqrt(v) || 1));
  const ym = rows.reduce((s, r) => s + r.y, 0) / rows.length;
  const Z = rows.map((r) => r.x.map((v, i) => (v - mu[i]) / sd[i]));
  const A = Array.from({ length: d }, (_, i) => Array.from({ length: d }, (_, j) => Z.reduce((s, z) => s + z[i]! * z[j]!, 0) + (i === j ? lambda * rows.length * 0.001 : 0)));
  const bv = Array.from({ length: d }, (_, i) => Z.reduce((s, z, k) => s + z[i]! * (rows[k]!.y - ym), 0));
  const w = solve(A, bv);
  return { w, mu, sd, ym, predict: (x: number[]) => ym + x.reduce((s, v, i) => s + (w[i]! * (v - mu[i]!)) / sd[i]!, 0) };
}
const corr = (a: number[], b: number[]) => { const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n; let sa = 0, sb = 0, sab = 0; for (let i = 0; i < n; i++) { sa += (a[i]! - ma) ** 2; sb += (b[i]! - mb) ** 2; sab += (a[i]! - ma) * (b[i]! - mb); } return sab / Math.sqrt(sa * sb); };

for (const l of LEAGUES) {
  const p = `public/data/lines/${l.id}/history.json`;
  if (!existsSync(p)) continue;
  const games: LineGame[] = JSON.parse(readFileSync(p, "utf8")).rows.map(fromRow);
  const rows = build(games, l.id === "mlb");
  const seasons = [...new Set(rows.map((r) => r.season))].sort();
  const counts = seasons.map((s) => rows.filter((r) => r.season === s).length);
  const test = seasons.filter((s, i) => counts[i]! > 0.6 * Math.max(...counts)).at(-1)!;
  const tr = rows.filter((r) => r.season < test), ho = rows.filter((r) => r.season === test);
  const m = fit(tr);
  const pred = ho.map((r) => m.predict(r.x));
  const rmseBase = Math.sqrt(ho.reduce((s, r) => s + r.y ** 2, 0) / ho.length), rmseModel = Math.sqrt(ho.reduce((s, r, i) => s + (r.y - pred[i]!) ** 2, 0) / ho.length);
  console.log(`\n=== ${l.label}: ${rows.length} usable games, train ${tr.length} (seasons < ${test}), hold-out ${ho.length} (${test}) ===`);
  console.log(`corr(pred, actual-line) on hold-out: ${corr(pred, ho.map((r) => r.y)).toFixed(3)}  rmse vs line ${rmseBase.toFixed(2)} -> model ${rmseModel.toFixed(2)}`);
  console.log("coefficients (per 1 sd):", FEATS.map((f, i) => `${f} ${m.w[i]!.toFixed(2)}`).join(", "), "| mean y", m.ym.toFixed(2));
  const sdPred = Math.sqrt(pred.reduce((s, v) => s + v * v, 0) / pred.length);
  for (const k of [0, 0.5, 1, 1.5]) {
    const t = k * sdPred; let w = 0, lo = 0, push = 0;
    ho.forEach((r, i) => { const pr = pred[i]!; if (Math.abs(pr) < t) return; const over = pr > 0; if (r.y === 0) push++; else if ((r.y > 0) === over) w++; else lo++; });
    const n = w + lo; console.log(`  |pred| >= ${t.toFixed(2)} (${k} sd): ${n} games, ${(100 * w / Math.max(1, n)).toFixed(1)}% right, ROI@-110 ${(100 * (w * 0.9091 - lo) / Math.max(1, n)).toFixed(1)}%`);
  }
}
