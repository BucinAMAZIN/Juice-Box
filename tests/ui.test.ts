// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { Ledger, type KeyValueStore } from "../src/data/ledger";
import { renderResults } from "../src/ui/results";
import { renderStats } from "../src/ui/stats";
import { renderToday } from "../src/ui/today";

function memoryStore(): KeyValueStore {
  let v: string | null = null;
  return { getItem: () => v, setItem: (_k, x) => void (v = x) };
}

function setValue(root: HTMLElement, name: string, value: string): void {
  const el = root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
  if (!el) throw new Error(`No field ${name}`);
  el.value = value;
}

function fillForm(root: HTMLElement, over: Record<string, string> = {}): void {
  const values: Record<string, string> = {
    player: "Alex DeBrincat",
    team: "det",
    opponent: "van",
    start: "2099-01-01T19:00",
    market: "sog",
    line: "3.5",
    over: "+100",
    under: "-120",
    mean: "5",
    ...over,
  };
  for (const [k, v] of Object.entries(values)) setValue(root, k, v);
}

function submit(root: HTMLElement): void {
  root.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
}

let root: HTMLElement;
let ledger: Ledger;

beforeEach(() => {
  root = document.createElement("div");
  document.body.replaceChildren(root);
  ledger = new Ledger(memoryStore());
});

describe("Today screen", () => {
  it("prices both sides and flags a clear edge", () => {
    renderToday(root, ledger);
    fillForm(root);
    submit(root);
    expect(root.querySelector(".verdict.good")?.textContent).toContain("over 3.5");
    expect(root.querySelectorAll(".side")).toHaveLength(2);
    expect(root.textContent).toContain("Book, no vig");
  });

  it("says no play when the price is fair", () => {
    renderToday(root, ledger);
    // Counts are right-skewed, so the median sits below the mean. A 3.5 line is fair at a mean near 3.8.
    fillForm(root, { mean: "3.8", over: "-110", under: "-110" });
    submit(root);
    expect(root.querySelector(".verdict.good")).toBeNull();
    expect(root.querySelector(".verdict")?.textContent).toContain("No play");
  });

  it("rejects bad input instead of pricing it", () => {
    renderToday(root, ledger);
    fillForm(root, { over: "", under: "" });
    submit(root);
    expect(root.querySelector(".error")?.textContent).toContain("at least one side");

    fillForm(root, { over: "50", under: "" });
    submit(root);
    expect(root.querySelector(".error")?.textContent).toContain("Odds look wrong");
    expect(root.querySelectorAll(".side")).toHaveLength(0);
  });

  it("leans under when the projection sits below a skew-adjusted fair line", () => {
    renderToday(root, ledger);
    fillForm(root, { mean: "3.45", over: "-110", under: "-110" });
    submit(root);
    expect(root.querySelector(".verdict.good")?.textContent).toContain("under 3.5");
  });

  it("accepts plus-money odds written with a leading +", () => {
    renderToday(root, ledger);
    fillForm(root, { over: "+135", under: "-165" });
    submit(root);
    expect(root.querySelector(".error")).toBeNull();
    expect(root.querySelectorAll(".side")).toHaveLength(2);
    expect(root.textContent).toContain("+135");
  });

  it("warns when only one side is priced", () => {
    renderToday(root, ledger);
    fillForm(root, { under: "" });
    submit(root);
    expect(root.textContent).toContain("One side only");
  });

  it("logs a pick to the ledger with normalized team codes", () => {
    renderToday(root, ledger);
    fillForm(root);
    submit(root);
    const log = root.querySelector<HTMLButtonElement>(".side.flagged button")!;
    log.click();
    expect(ledger.picks).toHaveLength(1);
    expect(ledger.picks[0]).toMatchObject({ team: "DET", opponent: "VAN", side: "over", line: 3.5, odds: 100 });
    expect(log.disabled).toBe(true);
  });

  it("refuses to log a game that already started", () => {
    renderToday(root, ledger);
    fillForm(root, { start: "2000-01-01T19:00" });
    submit(root);
    root.querySelector<HTMLButtonElement>(".side.flagged button")!.click();
    expect(ledger.picks).toHaveLength(0);
    expect(root.querySelector(".status.error")?.textContent).toMatch(/already started/);
  });

  it("builds the projected count from rates and minutes", () => {
    renderToday(root, ledger);
    for (const [k, v] of Object.entries({ evRate: "9", evToi: "15", ppRate: "12", ppToi: "3", pkRate: "1", pkToi: "1" })) setValue(root, k, v);
    root.querySelector<HTMLButtonElement>("details button")!.click();
    expect(root.querySelector<HTMLInputElement>('[name="mean"]')!.value).toBe("2.87");
  });

  it("never renders user text as HTML", () => {
    renderToday(root, ledger);
    fillForm(root, { player: '<img src=x onerror="window.pwned=1">' });
    submit(root);
    root.querySelector<HTMLButtonElement>(".side.flagged button")!.click();
    renderResults(root, ledger);
    expect(root.querySelector("img")).toBeNull();
    expect(root.textContent).toContain("<img src=x");
  });
});

describe("Results and Stats screens", () => {
  it("grades by hand and updates the record", () => {
    renderToday(root, ledger);
    fillForm(root);
    submit(root);
    root.querySelector<HTMLButtonElement>(".side.flagged button")!.click();

    renderResults(root, ledger);
    expect(root.querySelector(".pick.open")).not.toBeNull();
    root.querySelector<HTMLInputElement>('input[aria-label="Actual total"]')!.value = "5";
    root.querySelector<HTMLInputElement>('input[aria-label="Closing odds"]')!.value = "-120";
    root.querySelector<HTMLButtonElement>(".gradebar button")!.click();
    expect(root.querySelector(".pick.win")).not.toBeNull();

    renderStats(root, ledger);
    expect(root.textContent).toContain("1-0");
    expect(root.textContent).toContain("+1.00u");
    expect(root.textContent).toContain("Only 1 graded picks");
  });

  it("shows empty states", () => {
    renderResults(root, ledger);
    expect(root.textContent).toContain("No picks logged yet");
    renderStats(root, ledger);
    expect(root.textContent).toContain("Nothing graded yet");
  });
});
