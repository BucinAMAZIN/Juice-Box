import { clear, h } from "./dom";
import { pct } from "./format";

interface Bucket {
  picks: number;
  wins: number;
  losses: number;
  pushes: number;
  hitRate: number;
  avgModelProb: number;
  profitAtLimit: number;
}
export interface Report {
  generatedAt: string;
  totalPicks: number;
  graded: number;
  overall: Bucket;
  byMarket: Record<string, Bucket>;
  byKind: Record<string, Bucket>;
  brier: number;
  logLoss: number;
  calibration: Array<{ n: number; predicted: number; actual: number }>;
  findings: string[];
}

const base = (): string => (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
export type ReportSource = () => Promise<Report | null>;
export const liveReport: ReportSource = async () => {
  const res = await fetch(`${base()}data/report.json`, { cache: "no-store" });
  return res.ok ? ((await res.json()) as Report) : null;
};

const KIND: Record<string, string> = { potd: "Play of the day", lean: "Other picks", alt: "Alt lines", ticket: "Ticket legs" };
const u = (x: number): string => `${x >= 0 ? "+" : ""}${x.toFixed(2)}u`;

function stat(label: string, value: string, hint?: string): HTMLElement {
  return h("div", { class: "stat" }, h("div", { class: "value" }, value), h("div", { class: "label" }, label), hint ? h("div", { class: "hint" }, hint) : null);
}

function table(title: string, rows: Record<string, Bucket>, name: (k: string) => string): HTMLElement {
  const entries = Object.entries(rows).sort((a, b) => b[1].picks - a[1].picks);
  return h(
    "div",
    { class: "card" },
    h("h2", {}, title),
    h(
      "table",
      {},
      h("thead", {}, h("tr", {}, h("th", {}, ""), h("th", {}, "W-L"), h("th", {}, "Hit"), h("th", {}, "Expected"), h("th", {}, "Units"))),
      h("tbody", {}, ...entries.map(([k, b]) => h("tr", {}, h("td", {}, name(k)), h("td", {}, `${b.wins}-${b.losses}`), h("td", {}, pct(b.hitRate, 0)), h("td", {}, pct(b.avgModelProb, 0)), h("td", {}, u(b.profitAtLimit))))),
    ),
  );
}

export async function renderStats(root: HTMLElement, _ledger?: unknown, source: ReportSource = liveReport): Promise<void> {
  clear(root);
  root.append(h("h2", {}, "Stats"));
  const r = await source().catch(() => null);
  if (!r || r.graded === 0) {
    root.append(h("p", { class: "empty" }, "Nothing graded yet. Stats appear after the first overnight grading."));
    return;
  }
  const o = r.overall;
  root.append(
    h(
      "div",
      { class: "card" },
      h("h2", {}, "Record"),
      h("div", { class: "stats" }, stat("Record", `${o.wins}-${o.losses}${o.pushes ? `-${o.pushes}` : ""}`), stat("Hit rate", pct(o.hitRate, 0), `model expected ${pct(o.avgModelProb, 0)}`), stat("Units at limit price", u(o.profitAtLimit), "1 unit per pick"), stat("Brier score", r.brier.toFixed(3), "0.250 = coin flip")),
      r.graded < 200 ? h("p", { class: "caution" }, `Only ${r.graded} graded picks. Under a few hundred, a hot or cold streak is mostly luck.`) : null,
    ),
    table("By type", r.byKind, (k) => KIND[k] ?? k),
    table("By market", r.byMarket, (k) => k),
    h(
      "div",
      { class: "card" },
      h("h2", {}, "Calibration"),
      h("p", { class: "muted" }, "Do our 60% picks win about 60% of the time?"),
      h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "Predicted"), h("th", {}, "Actual"), h("th", {}, "Picks"))), h("tbody", {}, ...r.calibration.map((b) => h("tr", {}, h("td", {}, pct(b.predicted, 0)), h("td", {}, pct(b.actual, 0)), h("td", {}, b.n))))),
    ),
    ...(r.findings.length ? [h("div", { class: "card" }, h("h2", {}, "What the numbers say"), ...r.findings.map((f) => h("p", { class: "muted" }, f)))] : []),
  );
}
