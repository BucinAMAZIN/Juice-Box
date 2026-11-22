import { describe, expect, it } from "vitest";
import { spreadLane, totalLane } from "../src/engine/live";

const g = { favHome: true, spread: 16.5, total: 45.5 };
describe("lane bars", () => {
  it("favorite short of covering is off and fills left", () => {
    const l = spreadLane("favorite", g, { state: "in", homeScore: 6, awayScore: 0 }, "nfl")!;
    expect(l.tone).toBe("off"); expect(l.fill).toBeLessThan(0); expect(l.text).toContain("10.5 short");
  });
  it("underdog covers when the margin is inside the spread", () => {
    const l = spreadLane("underdog", g, { state: "in", homeScore: 6, awayScore: 0 }, "nfl")!;
    expect(l.tone).toBe("on"); expect(l.fill).toBeGreaterThan(0); expect(l.text).toBe("Covering by 10.5");
  });
  it("total over: pace and result", () => {
    expect(totalLane("over", g, { state: "in", homeScore: 6, awayScore: 0 }, 0.04)?.tone).toBe("on");
    expect(totalLane("over", g, { state: "in", homeScore: 30, awayScore: 20 }, 0.7)?.tone).toBe("hit");
    expect(totalLane("under", g, { state: "post", homeScore: 20, awayScore: 10 }, 1)?.tone).toBe("hit");
    expect(totalLane("over", g, { state: "pre", homeScore: null, awayScore: null }, 0)).toBeNull();
  });
});

import { leanFor } from "../src/engine/leans";
import type { LineGame } from "../src/engine/lines";
describe("puck line lean", () => {
  const mk = (i: number, fav: number, dog: number): LineGame => ({ id: String(i), start: "", date: "", fav: "A", dog: "B", favHome: true, spread: 1.5, ml: 150, total: 6, status: "post", favScore: fav, dogScore: dog });
  const hist = Array.from({ length: 120 }, (_, i) => (i % 2 ? mk(i, 5, 1) : mk(i, 2, 1)));
  it("is made only for moneyline leagues", () => {
    expect(leanFor(mk(999, 0, 0), hist, "nhl", true).puck?.note).toBe("puckline");
    expect(leanFor(mk(999, 0, 0), hist, "nba", false).puck).toBeUndefined();
  });
});

import { espnStatus } from "../src/data/live";
describe("espnStatus score", () => {
  it("reads both scores", () => {
    const json = { header: { competitions: [{ status: { type: { state: "in" }, displayClock: "5:00", period: 3 }, competitors: [{ homeAway: "home", score: "17", team: { abbreviation: "DET" } }, { homeAway: "away", score: "7", team: { abbreviation: "TB" } }] }] } };
    expect(espnStatus(json, "nfl").score).toBe("TB 7 - DET 17");
  });
});

import { boxNameKey, playerKey } from "../src/data/linemate";
describe("name keys ignore suffixes", () => {
  it("matches James Cook III to James Cook", () => {
    expect(boxNameKey("James Cook III")).toBe(boxNameKey("James Cook"));
    expect(boxNameKey("Michael Pittman Jr.")).toBe(playerKey("Michael", "Pittman Jr."));
    expect(boxNameKey("Michael Pittman Jr.")).toBe(playerKey("Michael", "Pittman"));
  });
});
