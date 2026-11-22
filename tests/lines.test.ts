// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { type LineGame, type LineRow, coverResult, fromRow, rate, slice, thirds, toLineGame, toRow, totalResult } from "../src/engine/lines";
import { renderLines } from "../src/ui/lines";
import { parseGame } from "../src/data/ncaa";

const g = (spread: number, total: number, fav: number, dog: number, id = `${spread}-${total}-${fav}-${dog}-${Math.random()}`): LineGame => ({ id, start: "2026-01-01T00:00:00Z", date: "2026-01-01", fav: "A", dog: "B", favHome: true, spread, total, status: "post", favScore: fav, dogScore: dog });

describe("line results", () => {
  it("grades the total and the spread from the favorite's side", () => {
    expect(totalResult(g(7, 200, 110, 95))).toBe("over");
    expect(totalResult(g(7, 205, 110, 95))).toBe("push");
    expect(coverResult(g(7.5, 200, 110, 105))).toBe("miss");
    expect(coverResult(g(7, 200, 110, 103))).toBe("push");
    expect(coverResult(g(0, 200, 110, 103))).toBeNull();
  });
  it("round-trips compact history rows", () => {
    const game = g(3.5, 221.5, 110, 102, "9");
    const row = toRow(game)!;
    expect(row[0]).toBe("9");
    expect(fromRow(row as LineRow)).toMatchObject({ spread: 3.5, total: 221.5, favScore: 110, dogScore: 102, favHome: true });
  });
  it("puts scores on the right team using ESPN's favorite flags", () => {
    const e = { id: "1", date: "2026-01-01T00:00Z", status: { type: { state: "post", completed: true } }, competitions: [{ competitors: [{ homeAway: "home", score: "100", team: { abbreviation: "BOS" }, records: [{ summary: "10-2" }] }, { homeAway: "away", score: "90", team: { abbreviation: "NYK" }, records: [{ summary: "6-6" }] }], odds: [{ details: "NY -3.5", overUnder: 220.5, homeTeamOdds: { favorite: false }, awayTeamOdds: { favorite: true } }] }] };
    const game = parseGame(e)!;
    expect(toLineGame(game, game.line!)).toMatchObject({ fav: "NYK", dog: "BOS", favHome: false, favScore: 90, dogScore: 100, favWin: 0.5, dogWin: 10 / 12 });
  });
});

describe("sweet spots", () => {
  it("gives a wider interval to a small sample than a big one", () => {
    expect(rate(6, 4).hi! - rate(6, 4).lo!).toBeGreaterThan(rate(600, 400).hi! - rate(600, 400).lo!);
    expect(rate(0, 0).pct).toBeNull();
  });
  it("splits values into thirds", () => {
    expect(thirds([1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual([4, 7]);
  });
  it("flags a slice that goes over far more than half the time with a real sample, and leaves noise alone", () => {
    const games: LineGame[] = [];
    for (let i = 0; i < 60; i++) games.push(g(1 + (i % 2), 200, i < 50 ? 110 : 95, 95)); // low spread, low total, mostly over
    for (let i = 0; i < 60; i++) games.push(g(10 + (i % 2), 230, i % 2 ? 120 : 100, 100)); // coin-flip-ish
    for (let i = 0; i < 60; i++) games.push(g(5 + (i % 2), 215, i % 2 ? 115 : 100, 100));
    const s = slice(games);
    const hot = s.cells.find((c) => c.pick === "over");
    expect(hot).toBeTruthy();
    expect(hot!.over.n).toBeGreaterThanOrEqual(30);
    expect(slice(games.slice(0, 20)).cells.every((c) => c.pick === null)).toBe(true);
  });
});

describe("Lines screen", () => {
  it("shows a league's totals, the board and says so when a league is empty", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const rows: LineRow[] = Array.from({ length: 90 }, (_, i) => ["h" + i, "2026-01-01T00:00:00Z", "BOS", "NYK", 1, 3 + (i % 9), 215 + (i % 11), 110, 100] as LineRow);
    const board: LineGame = { id: "t1", start: "2099-01-01T00:00:00Z", date: "2099-01-01", fav: "BOS", dog: "NYK", favHome: true, spread: 4.5, total: 220.5, status: "pre", favWin: 0.7, dogWin: 0.4 };
    await renderLines(root, undefined, { history: async (l) => (l === "nba" ? rows : null), tracked: async (l) => (l === "nba" ? [board] : null) });
    root.querySelector<HTMLButtonElement>('[data-tab="nba"]')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(root.textContent).toContain("90 games with lines");
    expect(root.textContent).toContain("BOS -4.5 vs NYK");
    expect(root.textContent).toContain("records 70% vs 40%");
    root.querySelector<HTMLButtonElement>('[data-tab="nfl"]')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(root.textContent).toContain("No NFL lines yet");
  });
});

import { strength, withMoneyline } from "../src/engine/lines";

describe("moneyline leagues", () => {
  it("treats a spread slot of 100 or more as the favorite's moneyline", () => {
    const row: LineRow = ["1", "2026-05-01T00:00:00Z", "NYY", "BOS", 1, 150, 8.5, 5, 2];
    const game = fromRow(row);
    expect(game).toMatchObject({ ml: 150, spread: 1.5 });
    expect(strength(game)).toBe(150);
    expect(coverResult(game)).toBe("cover");
    expect(toRow(game)![5]).toBe(150);
    expect(withMoneyline({ spread: 7 })).toEqual({ spread: 7 });
  });
  it("buckets a moneyline league by price and says so", () => {
    const games = Array.from({ length: 90 }, (_, i) => fromRow(["m" + i, "2026-05-01T00:00:00Z", "A", "B", 1, 110 + (i % 3) * 50, 8 + (i % 2), 5, 2]));
    expect(slice(games).ml).toBe(true);
    expect(slice(games).cells[0]!.label).toContain("favorite");
  });
});

import { RULES, RULES_START, ruleRate, ruleWon } from "../src/engine/rules";

describe("rules", () => {
  const rule = RULES.find((r) => r.id === "nba-under-pickem")!;
  const game = (spread: number, total: number, fav: number, dog: number, date = "2026-12-01"): LineGame => ({ id: `${spread}${total}${fav}${dog}${date}`, start: `${date}T00:00:00Z`, date, fav: "A", dog: "B", favHome: true, spread, total, status: "post", favScore: fav, dogScore: dog });
  it("scores a rule on the lean it names and skips pushes", () => {
    expect(ruleWon(rule, game(1.5, 220, 100, 99))).toBe(true);
    expect(ruleWon(rule, game(1.5, 190, 100, 99))).toBe(false);
    expect(ruleWon(rule, game(1.5, 199, 100, 99))).toBeNull();
    const r = ruleRate(rule, [game(1.5, 220, 100, 99), game(1.5, 190, 100, 99), game(6, 190, 100, 99), game(2, 200, 110, 100)]);
    expect([r.hits, r.n]).toEqual([1, 3]);
  });
  it("lists plays on the board and the forward record on the Rules view", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const board: LineGame = { id: "b1", start: "2099-01-01T00:00:00Z", date: "2099-01-01", fav: "BOS", dog: "NYK", favHome: true, spread: 1.5, total: 220.5, status: "pre" };
    const done = game(1, 210, 100, 99, RULES_START);
    await renderLines(root, undefined, { history: async () => null, tracked: async (l) => (l === "nba" ? [board, done] : null) });
    (root.querySelector('[data-tab="rules"]') as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 20));
    expect(root.textContent).toContain("Rule plays on the board (1)");
    expect(root.textContent).toContain("NBA: under 220.5 · BOS vs NYK");
    expect(root.textContent).toContain("1-0 (100%)");
  });
});

describe("leans for every game", () => {
  it("leans over where similar games went over and gives every game a call", async () => {
    const { leanFor, callText } = await import("../src/engine/leans");
    const hist: LineGame[] = [];
    for (let i = 0; i < 100; i++) hist.push(g(5, 200, 110, 100, `h${i}`)); // 210 points, all over; favorite wins by 10, covers
    const board: LineGame = { id: "x", start: "2099-01-01T00:00:00Z", date: "2099-01-01", fav: "BOS", dog: "NYK", favHome: true, spread: 5, total: 200, status: "pre" };
    const lean = leanFor(board, hist, "nba", false);
    expect(lean.total).toMatchObject({ side: "over", grade: "lean", n: 60 });
    expect(lean.spread).toMatchObject({ side: "favorite" });
    expect(callText(lean.total!, board, "total")).toBe("Over 200");
    expect(callText(lean.spread!, board, "spread")).toBe("BOS -5");
  });
  it("makes no call without enough similar games", async () => {
    const { leanFor } = await import("../src/engine/leans");
    const board: LineGame = { id: "x", start: "2099-01-01T00:00:00Z", date: "2099-01-01", fav: "A", dog: "B", favHome: true, spread: 5, total: 200, status: "pre" };
    expect(leanFor(board, [g(5, 200, 110, 100)], "nba", false)).toEqual({ total: null, spread: null });
  });
  it("shows leans for every league on the All games view", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const board: LineGame = { id: "b1", start: "2099-01-01T00:00:00Z", date: "2099-01-01", fav: "BOS", dog: "NYK", favHome: true, spread: 5, total: 200, status: "pre" };
    const hist = Array.from({ length: 100 }, (_, i) => toRow(g(5, 200, 110, 100, `h${i}`))!);
    await renderLines(root, undefined, { history: async () => hist as LineRow[], tracked: async (l) => (l === "nba" ? [board] : null) });
    expect(root.textContent).toContain("All games on the board (1)");
    expect(root.textContent).toContain("Over 200");
    expect(root.textContent).toContain("Lean");
    expect(root.textContent).toContain("BOS -5");
    expect(root.querySelectorAll(".callbox").length).toBe(2);
  });
});

describe("lean log", () => {
  it("freezes a lean and grades it at the logged line", async () => {
    const { freeze, gradeLean, tallyLeans } = await import("../src/engine/leanlog");
    const board: LineGame = { id: "z", start: "2099-01-01T00:00:00Z", date: "2099-01-01", fav: "BOS", dog: "NYK", favHome: true, spread: 5, total: 200, status: "pre" };
    const logged = freeze(board, "nba", { total: { side: "over", pct: 0.6, n: 60, grade: "lean", breakEven: 0.52 }, spread: { side: "underdog", pct: 0.55, n: 60, grade: "slight", breakEven: 0.52 } });
    const final: LineGame = { ...board, status: "post", favScore: 108, dogScore: 104 };
    expect(gradeLean(logged, "total", final)).toBe("win");
    expect(gradeLean(logged, "spread", final)).toBe("win");
    expect(gradeLean(logged, "total", board)).toBeNull();
    const t = tallyLeans({ z: logged }, new Map([["z", final]]));
    expect(t.map((x) => `${x.grade}|${x.kind}|${x.wins}`)).toEqual(["lean|total|1", "slight|spread|1"]);
  });
});
