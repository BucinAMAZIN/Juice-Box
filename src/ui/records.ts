import { clear, h } from "./dom";
import { cushionOf } from "./filters";
import { pct } from "./format";
import type { PicksSource } from "./picks";
import { loadHistory, type DayResult } from "./results";
import { MARKET_LABEL, SPORT, streakSource } from "./streaks";

export interface Tally {
  wins: number;
  losses: number;
  pushes: number;
  /** Units won or lost betting 1 unit on each at the saved Hard Rock price. */
  units: number;
}
const empty = (): Tally => ({ wins: 0, losses: 0, pushes: 0, units: 0 });

export interface Records {
  overall: Tally;
  bySport: Map<string, Tally>;
  byStreak: Map<string, Tally>;
  byPrice: Map<string, Tally>;
  byMarket: Map<string, Tally>;
  byH2h: Map<string, Tally>;
  bySplit: Map<string, Tally>;
  byCushion: Map<string, Tally>;
  byLine: Map<string, Tally>;
}

export const streakBucket = (n: number): string => (n >= 10 ? "10+ straight" : n >= 7 ? "7 to 9 straight" : "5 to 6 straight");
export const priceBucket = (p: number): string => (p <= -300 ? "-300 or shorter" : p <= -200 ? "-299 to -200" : p <= -150 ? "-199 to -150" : "-149 or longer");

export const rateBucket = (r?: { games: number; hits: number }): string => {
  if (!r || r.games === 0) return "No record";
  const x = r.hits / r.games;
  return x >= 1 ? "100%" : x >= 0.75 ? "75% to 99%" : "Under 75%";
};
export const cushionBucket = (c: number | null): string => (c == null ? "No average" : c >= 0.25 ? "+25% or more" : c >= 0.1 ? "+10% to +25%" : "Under +10%");

/** Tally every graded streak prop overall and by sport, streak length, price and market. */
export function summarizeRecords(history: DayResult[]): Records {
  const r: Records = { overall: empty(), bySport: new Map(), byStreak: new Map(), byPrice: new Map(), byMarket: new Map(), byH2h: new Map(), bySplit: new Map(), byCushion: new Map(), byLine: new Map() };
  const add = (m: Map<string, Tally>, k: string, outcome: string, units: number) => {
    const t = m.get(k) ?? empty();
    bump(t, outcome, units);
    m.set(k, t);
  };
  for (const { day, grades } of history) {
    const byId = new Map((grades?.grades ?? []).map((g) => [g.pickId, g]));
    for (const p of day.picks) {
      const g = byId.get(p.id);
      if (!g) continue;
      bump(r.overall, g.outcome, g.profitAtLimit);
      add(r.bySport, p.sport, g.outcome, g.profitAtLimit);
      add(r.byStreak, streakBucket(p.streak ?? 0), g.outcome, g.profitAtLimit);
      add(r.byPrice, priceBucket(p.price ?? p.limitOdds), g.outcome, g.profitAtLimit);
      add(r.byMarket, p.market, g.outcome, g.profitAtLimit);
      add(r.byH2h, rateBucket(p.h2h), g.outcome, g.profitAtLimit);
      add(r.bySplit, rateBucket(p.split), g.outcome, g.profitAtLimit);
      add(r.byCushion, cushionBucket(cushionOf(p)), g.outcome, g.profitAtLimit);
      add(r.byLine, p.alt ? "Alternate line" : "Main line", g.outcome, g.profitAtLimit);
    }
  }
  return r;
}

function bump(t: Tally, outcome: string, units: number): void {
  if (outcome === "win") t.wins++;
  else if (outcome === "loss") t.losses++;
  else t.pushes++;
  t.units += units;
}

const u = (x: number): string => `${x >= 0 ? "+" : ""}${x.toFixed(2)}u`;
const hit = (t: Tally): string => (t.wins + t.losses > 0 ? pct(t.wins / (t.wins + t.losses), 0) : "–");

function table(title: string, rows: Map<string, Tally>, name: (k: string) => string): HTMLElement {
  const entries = [...rows.entries()].sort((a, b) => b[1].wins + b[1].losses - (a[1].wins + a[1].losses));
  return h(
    "div",
    { class: "card" },
    h("h2", {}, title),
    h(
      "table",
      {},
      h("thead", {}, h("tr", {}, h("th", {}, ""), h("th", {}, "W-L"), h("th", {}, "Hit"), h("th", {}, "Units"))),
      h("tbody", {}, ...entries.map(([k, t]) => h("tr", {}, h("td", {}, name(k)), h("td", {}, `${t.wins}-${t.losses}`), h("td", {}, hit(t)), h("td", {}, u(t.units))))),
    ),
  );
}

export async function renderRecords(root: HTMLElement, _ledger?: unknown, source: PicksSource = streakSource): Promise<void> {
  clear(root);
  root.append(h("h2", {}, "Records"));
  const r = summarizeRecords(await loadHistory(source));
  const o = r.overall;
  if (o.wins + o.losses + o.pushes === 0) {
    root.append(h("p", { class: "empty" }, "Nothing graded yet. Records appear after the first overnight grading."));
    return;
  }
  const n = o.wins + o.losses + o.pushes;
  root.append(
    h(
      "div",
      { class: "card" },
      h("h2", {}, "Overall"),
      h(
        "div",
        { class: "stats" },
        h("div", { class: "stat" }, h("div", { class: "value" }, `${o.wins}-${o.losses}${o.pushes ? `-${o.pushes}` : ""}`), h("div", { class: "label" }, "Record")),
        h("div", { class: "stat" }, h("div", { class: "value" }, hit(o)), h("div", { class: "label" }, "Hit rate")),
        h("div", { class: "stat" }, h("div", { class: "value" }, u(o.units)), h("div", { class: "label" }, "Units"), h("div", { class: "hint" }, "1 unit on each, at the Hard Rock price")),
      ),
      n < 200 ? h("p", { class: "caution" }, `Only ${n} graded props. A hot or cold stretch this small is mostly luck.`) : null,
    ),
    table("By sport", r.bySport, (k) => SPORT[k] ?? k),
    table("By streak length", r.byStreak, (k) => k),
    table("By price", r.byPrice, (k) => k),
    table("By market", r.byMarket, (k) => MARKET_LABEL[k] ?? k),
    table("By head to head", r.byH2h, (k) => k),
    table("By home/away split", r.bySplit, (k) => k),
    table("By cushion over the line", r.byCushion, (k) => k),
    table("By line type", r.byLine, (k) => k),
  );
}
