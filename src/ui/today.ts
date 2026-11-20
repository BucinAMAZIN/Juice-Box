import { evaluateProp, flagBest, type SideEval } from "../core/evaluate";
import { distributionFor, expectedCount } from "../core/model";
import { formatAmerican } from "../core/odds";
import type { Market } from "../core/types";
import type { Ledger } from "../data/ledger";
import { clear, h } from "./dom";
import { pct, signedPct } from "./format";

const MARKETS: Array<[Market, string]> = [
  ["sog", "Shots on goal"],
  ["points", "Points"],
  ["goals", "Goals"],
  ["assists", "Assists"],
];

function field(label: string, input: HTMLElement, hint?: string): HTMLElement {
  return h("label", { class: "field" }, h("span", { class: "label" }, label), input, hint ? h("span", { class: "hint" }, hint) : null);
}

function numberInput(name: string, placeholder: string, step = "any"): HTMLInputElement {
  return h("input", { name, type: "number", step, inputMode: "decimal", placeholder });
}

/**
 * American odds need a leading + or -. An <input type="number"> rejects "+110" and reads it back as
 * empty, so odds use a text field and are validated on submit.
 */
function oddsInput(name: string, placeholder: string): HTMLInputElement {
  return h("input", { name, type: "text", autocomplete: "off", autocapitalize: "off", spellcheck: false, placeholder, "aria-label": name });
}

export function renderToday(root: HTMLElement, ledger: Ledger): void {
  clear(root);

  const player = h("input", { name: "player", placeholder: "Alex DeBrincat", autocomplete: "off", required: true });
  const team = h("input", { name: "team", placeholder: "DET", maxLength: 4, required: true });
  const opponent = h("input", { name: "opponent", placeholder: "VAN", maxLength: 4, required: true });
  const start = h("input", { name: "start", type: "datetime-local", required: true });
  const market = h("select", { name: "market" }, ...MARKETS.map(([v, l]) => h("option", { value: v }, l)));
  const line = numberInput("line", "3.5", "0.5");
  const over = oddsInput("over", "-130");
  const under = oddsInput("under", "+110");
  const mean = numberInput("mean", "3.6");

  const ev = { rate: numberInput("evRate", "9"), toi: numberInput("evToi", "15") };
  const pp = { rate: numberInput("ppRate", "12"), toi: numberInput("ppToi", "3") };
  const pk = { rate: numberInput("pkRate", "1"), toi: numberInput("pkToi", "1") };
  const derive = h("button", { type: "button", class: "ghost" }, "Use rate × ice time");
  derive.addEventListener("click", () => {
    const n = (i: HTMLInputElement) => (i.value === "" ? 0 : Number(i.value));
    mean.value = expectedCount(
      { ev: n(ev.rate), pp: n(pp.rate), pk: n(pk.rate) },
      { ev: n(ev.toi), pp: n(pp.toi), pk: n(pk.toi) },
    ).toFixed(2);
  });

  const out = h("div", { class: "results", "aria-live": "polite" });
  const form = h(
    "form",
    { class: "card" },
    h("h2", {}, "Price a prop"),
    h("p", { class: "muted" }, "Enter the book's price and your projected count. Juice Box removes the vig and compares."),
    field("Player", player),
    h("div", { class: "row" }, field("Team", team), field("Opponent", opponent)),
    field("Puck drop", start),
    h("div", { class: "row" }, field("Market", market), field("Line", line)),
    h("div", { class: "row" }, field("Over odds", over), field("Under odds", under, "Leave one blank if only one side is posted")),
    field("Projected count", mean, "Your expected shots or points for this game"),
    h(
      "details",
      {},
      h("summary", {}, "Build the projection from rates"),
      h("p", { class: "hint" }, "Per-60 rate and projected minutes in each game state."),
      h("div", { class: "grid3" }, field("5v5 rate", ev.rate), field("PP rate", pp.rate), field("PK rate", pk.rate)),
      h("div", { class: "grid3" }, field("5v5 min", ev.toi), field("PP min", pp.toi), field("PK min", pk.toi)),
      derive,
    ),
    h("button", { type: "submit" }, "Price it"),
  );

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clear(out);
    const overOdds = over.value.trim() ? Number(over.value.trim()) : undefined;
    const underOdds = under.value.trim() ? Number(under.value.trim()) : undefined;
    const m = Number(mean.value);
    const l = Number(line.value);
    if (overOdds == null && underOdds == null) return void out.append(h("p", { class: "error" }, "Enter odds for at least one side."));
    if (!Number.isFinite(m) || m < 0 || !Number.isFinite(l)) return void out.append(h("p", { class: "error" }, "Enter a line and a projected count."));
    for (const o of [overOdds, underOdds]) {
      if (o != null && (!Number.isInteger(o) || Math.abs(o) < 100)) return void out.append(h("p", { class: "error" }, "Odds look wrong. Use American odds like -130 or +110."));
    }

    const mk = market.value as Market;
    const quote: { overOdds?: number; underOdds?: number } = {};
    if (overOdds != null) quote.overOdds = overOdds;
    if (underOdds != null) quote.underOdds = underOdds;
    const evals = evaluateProp(distributionFor(mk, m), l, quote);
    const best = flagBest(evals);

    out.append(
      h("div", { class: best ? "verdict good" : "verdict" }, best ? `Lean: ${best.side} ${l}` : "No play. The price does not clear the bar."),
      ...evals.map((e) => sideCard(e, e === best, l, () => log(e, mk, l))),
    );
    if (evals.some((e) => !e.devigged)) {
      out.append(h("p", { class: "hint" }, "One side only: the vig is still in the book's number, so the edge looks smaller than it would against a true no-vig price."));
    }
  });

  function log(e: SideEval, mk: Market, l: number): string | null {
    try {
      const startIso = new Date(start.value).toISOString();
      ledger.addPick({
        gameStart: startIso,
        player: player.value.trim(),
        team: team.value.trim().toUpperCase(),
        opponent: opponent.value.trim().toUpperCase(),
        market: mk,
        line: l,
        side: e.side,
        odds: e.odds,
        book: "manual",
        modelProb: e.modelProb,
        fairProb: e.devigged ? e.bookProb : null,
        units: 1,
      });
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Could not log the pick.";
    }
  }

  root.append(form, out);
}

function sideCard(e: SideEval, flagged: boolean, line: number, onLog: () => string | null): HTMLElement {
  const status = h("span", { class: "status" });
  const button = h("button", { type: "button", class: "ghost" }, "Log pick (1u)");
  button.addEventListener("click", () => {
    const err = onLog();
    status.textContent = err ?? "Logged.";
    status.className = err ? "status error" : "status ok";
    if (!err) button.disabled = true;
  });
  return h(
    "div",
    { class: flagged ? "side flagged" : "side" },
    h("h3", {}, `${e.side === "over" ? "Over" : "Under"} ${line} at ${formatAmerican(e.odds)}`),
    h(
      "dl",
      {},
      h("dt", {}, "Model"), h("dd", {}, pct(e.modelProb)),
      h("dt", {}, e.devigged ? "Book, no vig" : "Book, with vig"), h("dd", {}, pct(e.bookProb)),
      h("dt", {}, "Edge"), h("dd", {}, signedPct(e.edge)),
      h("dt", {}, "EV per unit"), h("dd", {}, signedPct(e.ev)),
      h("dt", {}, "Quarter Kelly"), h("dd", {}, e.stakeFraction > 0 ? `${(e.stakeFraction * 100).toFixed(2)}% of bankroll` : "No bet"),
    ),
    button,
    status,
  );
}
