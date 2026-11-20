import { gradePick, isEligible } from "../core/grade";
import { formatAmerican } from "../core/odds";
import type { Grade, Pick } from "../core/types";
import { autoGrade } from "../data/autograde";
import type { Ledger } from "../data/ledger";
import { clear, h } from "./dom";
import { localTime, units } from "./format";

function pickRow(pick: Pick, grade: Grade | undefined, ledger: Ledger, refresh: () => void): HTMLElement {
  const title = `${pick.player} ${pick.side} ${pick.line} ${pick.market.toUpperCase()} (${formatAmerican(pick.odds)})`;
  const meta = `${pick.team} vs ${pick.opponent} · ${localTime(pick.gameStart)}`;
  const late = !isEligible(pick);

  if (grade) {
    return h(
      "li",
      { class: `pick ${grade.outcome}` },
      h("div", { class: "top" }, h("strong", {}, title), h("span", { class: "badge" }, grade.outcome.toUpperCase())),
      h("div", { class: "muted" }, meta),
      h("div", {}, `Actual ${grade.actual} · ${units(grade.profit)}`, grade.closeOdds != null ? ` · closed ${formatAmerican(grade.closeOdds)}` : ""),
    );
  }

  const actual = h("input", { type: "number", step: "1", min: "0", inputMode: "numeric", placeholder: "Actual", "aria-label": "Actual total" });
  // Text, not number: a number input rejects American odds written with a leading "+".
  const close = h("input", { type: "text", autocomplete: "off", spellcheck: false, placeholder: "Close (-120)", "aria-label": "Closing odds" });
  const note = h("span", { class: "status" });
  const save = h("button", { type: "button", class: "ghost" }, "Grade");
  save.addEventListener("click", () => {
    try {
      if (actual.value === "") throw new Error("Enter the final total.");
      if (close.value.trim() !== "") {
        const odds = Number(close.value.trim());
        if (!Number.isInteger(odds) || Math.abs(odds) < 100) throw new Error("Closing odds look wrong. Use American odds like -120 or +105.");
        ledger.recordClose(pick.id, odds);
      }
      ledger.addGrade(gradePick(pick, Number(actual.value), ledger.closeFor(pick.id)));
      refresh();
    } catch (err) {
      note.textContent = err instanceof Error ? err.message : "Could not grade.";
      note.className = "status error";
    }
  });

  return h(
    "li",
    { class: "pick open" },
    h("div", { class: "top" }, h("strong", {}, title), h("span", { class: "badge" }, "OPEN")),
    h("div", { class: "muted" }, meta),
    late ? h("div", { class: "error" }, "Logged after puck drop. Excluded from the record.") : null,
    h("div", { class: "gradebar" }, actual, close, save),
    note,
  );
}

export function renderResults(root: HTMLElement, ledger: Ledger): void {
  clear(root);
  const refresh = () => renderResults(root, ledger);
  const byPick = new Map(ledger.grades.map((g) => [g.pickId, g]));
  const picks = [...ledger.picks].sort((a, b) => Date.parse(b.gameStart) - Date.parse(a.gameStart));

  const status = h("p", { class: "muted", "aria-live": "polite" });
  const auto = h("button", { type: "button" }, "Grade from NHL boxscores");
  auto.addEventListener("click", async () => {
    auto.disabled = true;
    status.textContent = "Checking final boxscores…";
    try {
      const r = await autoGrade(ledger);
      refresh();
      const msg = h("p", { class: "muted" }, `Graded ${r.graded}. ${r.skipped.length} left open.`);
      root.prepend(msg);
    } catch {
      status.textContent = "Could not reach the NHL API. Grade by hand below.";
      auto.disabled = false;
    }
  });

  root.append(
    h("div", { class: "card" }, h("h2", {}, "Results"), h("p", { class: "muted" }, "Picks are frozen when logged. Grades are write-once."), picks.some((p) => !byPick.has(p.id)) ? auto : null, status),
    picks.length
      ? h("ul", { class: "picks" }, ...picks.map((p) => pickRow(p, byPick.get(p.id), ledger, refresh)))
      : h("p", { class: "muted" }, "No picks logged yet. Price a prop on the Today tab and log it."),
  );
}
