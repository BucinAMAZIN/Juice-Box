// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { Ledger, type KeyValueStore } from "../src/data/ledger";
import { renderResults } from "../src/ui/results";
import { renderRecords, summarizeRecords } from "../src/ui/records";
import { renderStreaks } from "../src/ui/streaks";
import { renderToday } from "../src/ui/today";
import { pickPrice, pickTitle, renderPicks, type PicksSource } from "../src/ui/picks";

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
    expect(root.querySelector("img")).toBeNull();
  });
});

import type { DayFile } from "../src/engine/types";

describe("Streaks, Results and Records screens", () => {
  const mk = (id: string, streak: number, price: number, sport: "nba" | "nfl" = "nba") => ({ id, createdAt: "", gameStart: "2099-01-01T00:00:00Z", gameId: 1, sport, kind: "streak" as const, player: `P ${id}`, team: "LAL", teamName: "Lakers", opponent: "DEN", market: "points" as const, line: 18.5, side: "over" as const, modelProb: 0.8, limitOdds: price, mean: 18.5, price, book: "Hard Rock", streak, sid: `${100 + streak}`, url: `https://share.hardrock.bet/Pt0T/bet?deep_link_value=hardrock://betslip/${100 + streak}`, note: "" });
  const source = (graded: boolean): PicksSource => ({
    loadIndex: async () => ({ dates: ["2026-11-20", "2026-11-21"] }),
    loadDay: async (d) => ({ date: d, generatedAt: "", modelVersion: "x", tickets: [], notes: [], picks: [mk(`${d}-a`, 12, -300), mk(`${d}-b`, 6, -150, "nfl")] }),
    loadGrades: async (d) => (graded && d === "2026-11-20" ? { date: d, gradedAt: "", grades: [{ pickId: `${d}-a`, actual: 22, outcome: "win", profitAtLimit: 0.33 }, { pickId: `${d}-b`, actual: 10, outcome: "loss", profitAtLimit: -1 }] } : null),
  });
  it("lists streaks longest first and builds one Hard Rock ticket from the ticked ones", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    await renderStreaks(root, undefined, source(false), undefined, () => "2026-11-21");
    const rows = [...root.querySelectorAll(".streak strong")].map((e) => e.textContent);
    expect(rows[0]).toBe("P 2026-11-21-a 19+ Points");
    const boxes = [...root.querySelectorAll<HTMLInputElement>(".s-pick input")];
    boxes[0]!.click();
    boxes[1]!.click();
    const send = root.querySelector(".slipbar a.hr") as HTMLAnchorElement;
    expect(send.textContent).toBe("Send 2-leg ticket to Hard Rock");
    expect(send.href).toBe("https://share.hardrock.bet/Pt0T/bet?deep_link_value=hardrock://betslip/112,106");
  });
  it("sorts the streak list by prop category", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const src: PicksSource = {
      loadIndex: async () => ({ dates: ["2026-11-21"] }),
      loadDay: async (d) => ({ date: d, generatedAt: "", modelVersion: "x", tickets: [], notes: [], picks: [mk("p1", 9, -200), { ...mk("r1", 7, -200), market: "rebounds" as const }, { ...mk("r2", 6, -200), market: "rebounds" as const }] }),
      loadGrades: async () => null,
    };
    await renderStreaks(root, undefined, src, undefined, () => "2026-11-21");
    const cats = [...root.querySelectorAll<HTMLButtonElement>(".cats .chip")].map((b) => b.textContent);
    expect(cats).toEqual(["All 3", "Rebounds 2", "Points 1"]);
    root.querySelector<HTMLButtonElement>('.cats [data-cat="rebounds"]')!.click();
    expect([...root.querySelectorAll(".streak strong")].map((e) => e.textContent)).toEqual(["P r1 19+ Rebounds", "P r2 19+ Rebounds"]);
    root.querySelector<HTMLButtonElement>('.cats [data-cat="all"]')!.click();
    expect(root.querySelectorAll(".streak").length).toBe(3);
  });
  it("shows only today's list on Streaks, and says so when it isn't posted yet", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    await renderStreaks(root, undefined, source(false), undefined, () => "2026-11-22");
    expect(root.querySelector("select")).toBeNull();
    expect(root.textContent).toContain("Today · Sun, Nov 22");
    expect(root.textContent).toContain("Today's streaks aren't posted yet");
    expect(root.querySelectorAll(".streak").length).toBe(0);
    expect(root.querySelector<HTMLAnchorElement>('a[href="#results"]')).not.toBeNull();
  });
  it("picks a day on Results", async () => {
    const root = document.createElement("div");
    await renderResults(root, undefined, source(true));
    const select = root.querySelector<HTMLSelectElement>("select")!;
    expect([...select.options].map((o) => o.value)).toEqual(["all", "2026-11-21", "2026-11-20"]);
    const visible = () => [...root.querySelectorAll<HTMLElement>("section.day")].filter((s) => !s.hidden).map((s) => s.dataset.date);
    expect(visible()).toEqual(["2026-11-21", "2026-11-20"]);
    select.value = "2026-11-20";
    select.dispatchEvent(new Event("change"));
    expect(visible()).toEqual(["2026-11-20"]);
    expect(root.textContent).toContain("Record: 1-1");
  });
  it("lists graded props by day with a running record", async () => {
    const root = document.createElement("div");
    await renderResults(root, undefined, source(true));
    expect(root.textContent).toContain("Record: 1-1");
    expect(root.textContent).toContain("2026-11-20 · 1-1");
    expect(root.textContent).toContain("2026-11-21 · not graded yet");
    expect(root.textContent).toContain("Won (22)");
  });
  it("tallies records by sport, streak length and price", async () => {
    const { loadHistory } = await import("../src/ui/results");
    const r = summarizeRecords(await loadHistory(source(true)));
    expect(r.overall).toMatchObject({ wins: 1, losses: 1 });
    expect(r.overall.units).toBeCloseTo(-0.67);
    expect(r.byStreak.get("10+ straight")).toMatchObject({ wins: 1, losses: 0 });
    expect(r.byStreak.get("5 to 6 straight")).toMatchObject({ wins: 0, losses: 1 });
    expect(r.byPrice.get("-300 or shorter")).toMatchObject({ wins: 1 });
    const root = document.createElement("div");
    await renderRecords(root, undefined, source(true));
    expect(root.textContent).toContain("By sport");
  });
  it("shows empty states", async () => {
    const root = document.createElement("div");
    await renderResults(root, undefined, { ...source(false), loadIndex: async () => ({ dates: [] }) });
    expect(root.textContent).toContain("Nothing saved yet");
    await renderRecords(root, undefined, source(false));
    expect(root.textContent).toContain("Nothing graded yet");
  });
});

describe("Picks screen", () => {
  const day: DayFile = {
    date: "2026-11-21", generatedAt: "", modelVersion: "x", tickets: [], notes: ["NHL: Linemate has no NHL data yet, so no picks were made."],
    picks: [{ id: "a", createdAt: "", gameStart: "", gameId: 1, sport: "nba", kind: "potd", player: "Luka Doncic", team: "LAL", opponent: "DEN", market: "threes", line: 4.5, side: "over", modelProb: 0.53, limitOdds: -110, mean: 4.6, price: 110, book: "draftkings", edge: 0.056, note: "" }],
  };
  const source: PicksSource = {
    loadIndex: async () => ({ dates: ["2026-11-21"] }),
    loadDay: async () => day,
    loadGrades: async () => ({ date: "2026-11-21", gradedAt: "", grades: [{ pickId: "a", actual: 5, outcome: "win", profitAtLimit: 1.1 }] }),
  };
  it("shows the play of the day with its real price, result and why other sports are empty", async () => {
    const view = document.createElement("div");
    await renderPicks(view, undefined, source);
    expect(view.textContent).toContain("Play of the day");
    expect(view.textContent).toContain("Luka Doncic · 5+ threes made");
    expect(view.textContent).toContain("Take it at +110 on draftkings or better");
    expect(view.textContent).toContain("Won (5)");
    expect(view.textContent).toContain("Why some sports have no picks");
    expect(pickTitle(day.picks[0]!)).toBe("Luka Doncic · 5+ threes made");
    expect(pickPrice({ ...day.picks[0]!, price: undefined })).toBe("Take it at -110 or better");
  });
  it("explains itself when there are no picks yet", async () => {
    const view = document.createElement("div");
    await renderPicks(view, undefined, { ...source, loadIndex: async () => ({ dates: [] }) });
    expect(view.textContent).toContain("No picks have been made yet");
  });
});

describe("Hard Rock links on the Picks screen", () => {
  it("shows an open button for open picks and a plain note when Hard Rock does not list the line", async () => {
    const day: DayFile = {
      date: "2026-11-21", generatedAt: "", modelVersion: "x", tickets: [], notes: [],
      picks: ["a", "b"].map((id) => ({ id, createdAt: "", gameStart: "", gameId: 1, sport: "nba" as const, kind: "lean" as const, player: `P ${id}`, team: "LAL", opponent: "DEN", market: "points" as const, line: 19.5, side: "over" as const, modelProb: 0.6, limitOdds: -150, mean: 20, note: "" })),
    };
    const source: PicksSource = {
      loadIndex: async () => ({ dates: ["2026-11-21"] }),
      loadDay: async () => day,
      loadGrades: async () => null,
      loadLinks: async () => ({ date: "2026-11-21", updatedAt: "", tickets: {}, picks: { a: { american: -300, url: "https://share.hardrock.bet/Pt0T/bet?deep_link_value=hardrock://betslip/1" } } }),
    };
    const view = document.createElement("div");
    await renderPicks(view, undefined, source);
    const link = view.querySelector("a.hr") as HTMLAnchorElement;
    expect(link.href).toContain("share.hardrock.bet");
    expect(link.textContent).toBe("Open in Hard Rock (-300)");
    expect(view.textContent).toContain("Not listed on Hard Rock right now");
  });
});

describe("Hard Rock slip builder", () => {
  it("builds one multi-leg ticket link from the picks you tick", async () => {
    const mk = (id: string) => ({ id, createdAt: "", gameStart: "", gameId: 1, sport: "nba" as const, kind: "lean" as const, player: `P ${id}`, team: "LAL", opponent: "DEN", market: "points" as const, line: 19.5, side: "over" as const, modelProb: 0.6, limitOdds: -150, mean: 20, note: "" });
    const day: DayFile = { date: "2026-11-21", generatedAt: "", modelVersion: "x", tickets: [], notes: [], picks: ["a", "b", "c"].map(mk) };
    const link = (sid: string) => ({ american: -120, url: `https://share.hardrock.bet/Pt0T/bet?deep_link_value=hardrock://betslip/${sid}` });
    const source: PicksSource = {
      loadIndex: async () => ({ dates: ["2026-11-21"] }),
      loadDay: async () => day,
      loadGrades: async () => null,
      loadLinks: async () => ({ date: "2026-11-21", updatedAt: "", tickets: {}, picks: { a: link("111"), b: link("222"), c: link("333") } }),
    };
    const view = document.createElement("div");
    document.body.append(view);
    await renderPicks(view, undefined, source);
    const boxes = [...view.querySelectorAll<HTMLInputElement>(".add input")];
    expect(boxes).toHaveLength(3);
    expect(view.querySelector(".slipbar")!.hasAttribute("hidden")).toBe(true);
    boxes[0]!.click();
    boxes[2]!.click();
    const send = view.querySelector(".slipbar a.hr") as HTMLAnchorElement;
    expect(send.textContent).toBe("Send 2-leg ticket to Hard Rock");
    expect(send.href).toBe("https://share.hardrock.bet/Pt0T/bet?deep_link_value=hardrock://betslip/111,333");
    boxes[0]!.click();
    expect((view.querySelector(".slipbar a.hr") as HTMLAnchorElement).textContent).toBe("Send to Hard Rock");
    boxes[2]!.click();
    expect(view.querySelector(".slipbar")!.hasAttribute("hidden")).toBe(true);
  });
});

describe("multi-sport tab and refresh", () => {
  it("shows every sport's picks together, matches the sport tabs, and reloads on a pull down", async () => {
    const mk = (id: string, sport: "nba" | "nhl") => ({ id, createdAt: "", gameStart: "", gameId: 1, sport, kind: "lean" as const, player: `P ${id}`, team: "A", opponent: "B", market: "points" as const, line: 1.5, side: "over" as const, modelProb: 0.6, limitOdds: -150, mean: 2, note: "" });
    const day: DayFile = { date: "2026-11-21", generatedAt: "", modelVersion: "x", tickets: [], notes: [], picks: [mk("a", "nba"), mk("b", "nhl")] };
    let loads = 0;
    const source: PicksSource = {
      loadIndex: async () => ({ dates: ["2026-11-21"] }),
      loadDay: async () => { loads++; return day; },
      loadGrades: async () => null,
    };
    const view = document.createElement("div");
    document.body.append(view);
    await renderPicks(view, undefined, source);
    const tabs = [...view.querySelectorAll<HTMLButtonElement>(".chip")];
    expect(tabs.map((b) => b.textContent)).toEqual(["Multi-sport", "NBA", "NHL"]);
    expect(view.textContent).toContain("P a");
    expect(view.textContent).toContain("P b");
    tabs[1]!.click();
    expect(view.textContent).toContain("P a");
    expect(view.textContent).not.toContain("P b");
    const ev = (type: string, y: number) => { const e = new Event(type) as Event & Record<string, unknown>; e.touches = [{ clientY: y }]; e.changedTouches = [{ clientY: y }]; window.dispatchEvent(e); };
    ev("touchstart", 10); ev("touchend", 200);
    await new Promise((r) => setTimeout(r, 10));
    expect(loads).toBe(2);
    expect(view.textContent).not.toContain("P b");
  });
});
