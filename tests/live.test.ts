// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { elapsedFraction, propLive, trendLive } from "../src/engine/live";
import { espnStatus, nhlStatus } from "../src/data/live";
import { watchProps } from "../src/ui/live";

describe("live status", () => {
  it("measures how much of regulation is gone", () => {
    expect(elapsedFraction("nba", 1, "12:00")).toBe(0);
    expect(elapsedFraction("nba", 3, "6:00")).toBeCloseTo(0.625, 5);
    expect(elapsedFraction("nhl", 2, "10:00")).toBeCloseTo(0.5, 5);
    expect(elapsedFraction("nba", 5, "3:00")).toBe(1);
  });
  it("reads ESPN and NHL status blocks", () => {
    const e = espnStatus({ header: { competitions: [{ status: { displayClock: "5:12", period: 3, type: { state: "in", shortDetail: "5:12 - 3rd" } } }] } }, "nba");
    expect(e).toMatchObject({ state: "in", detail: "5:12 - 3rd" });
    expect(e.frac).toBeCloseTo(0.64, 2);
    expect(nhlStatus({ gameState: "FINAL" })).toMatchObject({ state: "post", frac: 1 });
    expect(nhlStatus({ gameState: "LIVE", periodDescriptor: { number: 2 }, clock: { timeRemaining: "10:00" } }).frac).toBeCloseTo(0.5, 5);
  });
});

describe("prop live line", () => {
  const live = { state: "in" as const, detail: "5:12 - 3rd", frac: 0.7 };
  it("calls an over a hit once it clears the line", () => {
    expect(propLive("over", 9.5, 12, live, "pts")).toMatchObject({ tone: "hit" });
  });
  it("shows pace before it clears", () => {
    expect(propLive("over", 19.5, 14, live, "pts")).toMatchObject({ tone: "on" });
    expect(propLive("over", 19.5, 8, live, "pts")?.tone).toBe("off");
    expect(propLive("over", 19.5, 8, live, "pts")?.text).toContain("on pace for 11");
  });
  it("settles at the final and says nothing before the game", () => {
    expect(propLive("over", 9.5, 9, { state: "post", detail: "Final", frac: 1 }, "pts")).toMatchObject({ tone: "miss" });
    expect(propLive("over", 9.5, null, { state: "pre", detail: "", frac: 0 }, "pts")).toBeNull();
    expect(propLive("over", 9.5, null, live, "pts")?.tone).toBe("wait");
  });
});

describe("team trend live line", () => {
  const live = { state: "in" as const, detail: "Q3", frac: 0.6 };
  it("tells whether a spread is covering", () => {
    expect(trendLive({ market: "SPREAD", side: "cover", line: 10.5, sport: "nba" }, { team: 90, opp: 98 }, live)).toMatchObject({ tone: "on" });
    expect(trendLive({ market: "SPREAD", side: "cover", line: 10.5, sport: "nba" }, { team: 80, opp: 98 }, live)?.text).toContain("short of covering");
  });
  it("counts a total as decided once it is passed, and grades at the final", () => {
    expect(trendLive({ market: "GAME_TOTAL", side: "over", line: 200, sport: "nba" }, { team: 105, opp: 100 }, live)).toMatchObject({ tone: "hit" });
    expect(trendLive({ market: "GAME_TOTAL", side: "under", line: 200, sport: "nba" }, { team: 105, opp: 100 }, live)).toMatchObject({ tone: "miss" });
    expect(trendLive({ market: "MONEY_LINE", side: "cover", line: 0, sport: "nba" }, { team: 99, opp: 101 }, { state: "post", detail: "Final", frac: 1 })).toMatchObject({ tone: "miss" });
  });
});

describe("watching props", () => {
  it("fills the row for a game in progress and stops when the list leaves the page", async () => {
    vi.useFakeTimers();
    const root = document.createElement("div");
    document.body.append(root);
    root.innerHTML = '<article data-pick-id="a"><div class="s-live" hidden></div></article>';
    const pick = { id: "a", sport: "nba", gameId: 1, gameStart: new Date(Date.now() - 3_600_000).toISOString(), side: "over", line: 9.5, market: "points", player: "X" } as never;
    const load = vi.fn(async () => ({ status: { state: "in" as const, detail: "2nd", frac: 0.4 }, stat: () => 12 }));
    const stop = watchProps(root, () => [pick], load as never);
    await vi.advanceTimersByTimeAsync(10);
    expect(root.querySelector(".s-live")?.textContent).toContain("12 pts");
    expect(root.querySelector(".s-live")?.className).toContain("live-hit");
    root.remove();
    await vi.advanceTimersByTimeAsync(50_000);
    expect(load).toHaveBeenCalledTimes(1);
    stop();
    vi.useRealTimers();
  });
});

describe("game card live line", () => {
  it("says who is covering and where the total is heading", async () => {
    const { gameLive } = await import("../src/engine/live");
    const g = { fav: "DET", dog: "ATL", favHome: true, spread: 2.5, total: 224.5 };
    expect(gameLive(g, { state: "in", homeScore: 78, awayScore: 74, detail: "5:12 - 3rd" }, 0.64)?.text).toBe("LIVE 5:12 - 3rd · DET 78 - ATL 74 · DET covering by 1.5 · total 152, pace 238 vs 224.5");
    expect(gameLive(g, { state: "post", homeScore: 110, awayScore: 100 }, 1)?.text).toContain("DET covering by 7.5");
    expect(gameLive(g, { state: "pre", homeScore: null, awayScore: null }, 0)).toBeNull();
  });
});
