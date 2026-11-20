import { calibrationBins, summarize } from "../core/grade";
import type { Ledger } from "../data/ledger";
import { clear, h } from "./dom";
import { pct, signedPct, units } from "./format";

function stat(label: string, value: string, hint?: string): HTMLElement {
  return h("div", { class: "stat" }, h("div", { class: "value" }, value), h("div", { class: "label" }, label), hint ? h("div", { class: "hint" }, hint) : null);
}

export function renderStats(root: HTMLElement, ledger: Ledger): void {
  clear(root);
  const s = summarize([...ledger.picks], [...ledger.grades]);
  const byId = new Map(ledger.picks.map((p) => [p.id, p]));
  const decided = ledger.grades.filter((g) => g.outcome !== "push" && byId.has(g.pickId));
  const bins = calibrationBins(
    decided.map((g) => byId.get(g.pickId)!.modelProb),
    decided.map((g) => g.outcome === "win"),
  );

  const small = s.picks < 200;
  const exportBtn = h("button", { type: "button", class: "ghost" }, "Download backup (JSON)");
  exportBtn.addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob([ledger.exportJson()], { type: "application/json" }));
    const a = h("a", { href: url, download: `juice-box-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    URL.revokeObjectURL(url);
  });

  root.append(
    h(
      "div",
      { class: "card" },
      h("h2", {}, "Record"),
      s.picks === 0
        ? h("p", { class: "muted" }, "Nothing graded yet.")
        : h(
            "div",
            { class: "stats" },
            stat("Record", `${s.wins}-${s.losses}${s.pushes ? `-${s.pushes}` : ""}`),
            stat("Profit", units(s.profit)),
            stat("ROI", signedPct(s.roi), `${s.unitsStaked.toFixed(0)}u staked`),
            stat("Closing line value", s.avgClv == null ? "–" : signedPct(s.avgClv), s.clvSample ? `${s.clvSample} picks with a close` : "Add closing odds when grading"),
            stat("Brier score", Number.isFinite(s.brier) ? s.brier.toFixed(3) : "–", "0.250 = coin flip"),
            stat("Log loss", Number.isFinite(s.logLoss) ? s.logLoss.toFixed(3) : "–", "0.693 = coin flip"),
          ),
      small && s.picks > 0
        ? h("p", { class: "caution" }, `Only ${s.picks} graded picks. Under a few hundred, a hot or cold streak is mostly luck. Judge the model on closing line value and calibration, not profit.`)
        : null,
    ),
    h(
      "div",
      { class: "card" },
      h("h2", {}, "Calibration"),
      h("p", { class: "muted" }, "Do your 60% picks win about 60% of the time?"),
      bins.length
        ? h(
            "table",
            {},
            h("thead", {}, h("tr", {}, h("th", {}, "Predicted"), h("th", {}, "Actual"), h("th", {}, "Picks"))),
            h("tbody", {}, ...bins.map((b) => h("tr", {}, h("td", {}, pct(b.predicted, 0)), h("td", {}, pct(b.actual, 0)), h("td", {}, b.n)))),
          )
        : h("p", { class: "muted" }, "Needs graded picks."),
    ),
    h("div", { class: "card" }, h("h2", {}, "Your data"), h("p", { class: "muted" }, "Everything is stored on this device only. Download a backup before clearing browser data."), exportBtn),
  );
}
