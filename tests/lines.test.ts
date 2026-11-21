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
    expect(root.textContent).toContain("90 games with lines");
    expect(root.textContent).toContain("BOS -4.5 vs NYK");
    expect(root.textContent).toContain("records 70% vs 40%");
    root.querySelector<HTMLButtonElement>('[data-tab="nfl"]')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(root.textContent).toContain("No NFL lines yet");
  });
});
