// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseGame, parseLine, pickLine } from "../src/data/ncaa";
import { RATIO_BANDS, SPREAD_BANDS, isCoreCase, tally, toBlowout, type BlowoutGame } from "../src/engine/blowouts";

const event = (over: Record<string, unknown> = {}) => ({
  id: "1", date: "2026-11-21T17:00Z",
  status: { type: { state: "post", completed: true } },
  competitions: [{ competitors: [{ homeAway: "home", score: "55", team: { abbreviation: "AUB" } }, { homeAway: "away", score: "3", team: { abbreviation: "SAM" } }], odds: [{ details: "AUB -48.5", overUnder: 59.5 }] }],
  ...over,
});

describe("college football lines", () => {
  it("reads the favorite, the spread and the total", () => {
    expect(parseLine("AUB -48.5", 59.5)).toEqual({ fav: "AUB", spread: 48.5, total: 59.5 });
    expect(parseLine("EVEN", 50)).toBeNull();
    expect(parseLine("AUB -3", null)).toBeNull();
  });
  it("prefers ESPN BET's closing line and skips providers with no favorite", () => {
    const json = { items: [{ provider: { id: "41" }, details: "EVEN", overUnder: 40 }, { provider: { id: "2" }, details: "OSU -30", overUnder: 55 }, { provider: { id: "58" }, details: "OSU -32.5", overUnder: 46.5 }] };
    expect(pickLine(json)).toEqual({ fav: "OSU", spread: 32.5, total: 46.5 });
  });
  it("grades a finished game against the total, with the favorite on either side", () => {
    const g = parseGame(event())!;
    expect(g.state).toBe("post");
    const b = toBlowout(g, g.line!);
    expect(b).toMatchObject({ fav: "AUB", dog: "SAM", favScore: 55, dogScore: 3, points: 58, result: "under" });
    const away = parseGame(event({ competitions: [{ competitors: [{ homeAway: "home", score: "7", team: { abbreviation: "SAM" } }, { homeAway: "away", score: "60", team: { abbreviation: "AUB" } }], odds: [] }] }))!;
    expect(toBlowout(away, { fav: "AUB", spread: 40, total: 55 })).toMatchObject({ favScore: 60, dogScore: 7, points: 67, result: "over" });
  });
  it("leaves unplayed games ungraded", () => {
    const g = parseGame(event({ status: { type: { state: "pre", completed: false } } }))!;
    expect(toBlowout(g, g.line!).result).toBeUndefined();
  });
});

describe("blowout tallies", () => {
  const mk = (spread: number, total: number, result: "over" | "under" | "push"): BlowoutGame => ({ id: `${spread}${total}${result}`, start: "", date: "", fav: "A", dog: "B", spread, total, status: "post", result });
  it("counts over share of decided games and ignores pushes", () => {
    expect(tally([mk(40, 50, "over"), mk(41, 51, "over"), mk(42, 52, "under"), mk(43, 50, "push")])).toEqual({ n: 4, over: 2, under: 1, push: 1, overPct: 2 / 3 });
    expect(tally([]).overPct).toBeNull();
  });
  it("puts a 40-point favorite with a 50 to 52 total in the core case and the lowest ratio band", () => {
    expect(isCoreCase(mk(40, 51, "over"))).toBe(true);
    expect(isCoreCase(mk(40, 58, "over"))).toBe(false);
    expect(isCoreCase(mk(35, 51, "over"))).toBe(false);
    expect(RATIO_BANDS[0]![1](mk(40, 52, "over"))).toBe(true);
    expect(RATIO_BANDS[2]![1](mk(25, 55, "over"))).toBe(true);
    expect(SPREAD_BANDS[1]![1](mk(35, 55, "over"))).toBe(true);
  });
});

import { renderBlowoutPanel } from "../src/ui/blowouts";
import { renderStreaks } from "../src/ui/streaks";

describe("NCAA blowout tab", () => {
  const g = (id: string, spread: number, total: number, status: "pre" | "post", result?: "over" | "under", date = "2099-01-01"): BlowoutGame => ({ id, start: `${date}T17:00:00Z`, date, fav: "AUB", dog: "SAM", spread, total, status, ...(status === "post" ? { favScore: 55, dogScore: 3, points: 58, result } : {}) });
  it("lists the day's big favorites, the running record and the past-season rate", () => {
    const root = document.createElement("div");
    renderBlowoutPanel(root, "2099-01-01", [g("1", 48.5, 51, "pre"), g("2", 22, 49, "post", "over")], [g("3", 41, 51, "post", "over"), g("4", 44, 52, "post", "under"), g("5", 42, 51, "post", "over")]);
    expect(root.querySelector("[data-cat=blowout]")!.textContent).toBe("Blowout 2");
    expect(root.textContent).toContain("AUB -48.5 vs SAM");
    expect(root.textContent).toContain("40+ with a 50 to 52 total");
    expect(root.textContent).toContain("AUB 55-3 SAM");
    expect(root.textContent).toContain("67% over (2-1)");
  });
  it("says so when nothing is loaded yet", () => {
    const root = document.createElement("div");
    renderBlowoutPanel(root, "2099-01-01", null, null);
    expect(root.textContent).toContain("No games with a favorite of 20 or more on this day.");
    expect(root.textContent).toContain("Past-season lines have not been loaded yet.");
  });
  it("shows up as an NCAA tab on the Streaks screen", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const day = { date: "2099-01-01", generatedAt: "", modelVersion: "x", tickets: [], notes: [], picks: [] };
    await renderStreaks(root, undefined, { loadIndex: async () => ({ dates: ["2099-01-01"] }), loadDay: async () => day, loadGrades: async () => null }, { load: async (n) => (n === "tracked" ? [g("1", 48.5, 51, "pre")] : null) }, () => "2099-01-01");
    root.querySelector<HTMLButtonElement>('[data-tab="ncaa"]')!.click();
    expect(root.textContent).toContain("Blowout 1");
    expect(root.textContent).toContain("AUB -48.5 vs SAM");
    expect(root.querySelector<HTMLElement>(".filters")!.hidden).toBe(true);
  });
});

describe("favorite flags", () => {
  it("uses ESPN's favorite flags when the line text names a different code than the scoreboard", () => {
    const e = event({ competitions: [{ competitors: [{ homeAway: "home", score: "52", team: { abbreviation: "AFA" } }, { homeAway: "away", score: "3", team: { abbreviation: "UNLV" } }], odds: [{ details: "AF -23.5", overUnder: 48.5, homeTeamOdds: { favorite: true }, awayTeamOdds: { favorite: false } }] }] });
    const g = parseGame(e)!;
    expect(toBlowout(g, g.line!)).toMatchObject({ fav: "AFA", dog: "UNLV", favScore: 52, dogScore: 3, result: "over" });
  });
});
