import { describe, expect, it } from "vitest";
import { brierScore, calibrationBins, gradePick, gradeSide, isEligible, logLoss, profitUnits, summarize } from "../src/core/grade";
import type { Pick } from "../src/core/types";

function pick(over: Partial<Pick> = {}): Pick {
  return {
    id: "p1",
    createdAt: "2026-11-20T20:00:00Z",
    gameStart: "2026-11-21T00:00:00Z",
    player: "Test Player",
    team: "DET",
    opponent: "VAN",
    market: "sog",
    line: 2.5,
    side: "over",
    odds: -110,
    book: "manual",
    modelProb: 0.6,
    fairProb: 0.5,
    units: 1,
    ...over,
  };
}

describe("grading", () => {
  it("grades overs, unders and pushes", () => {
    expect(gradeSide("over", 2.5, 3)).toBe("win");
    expect(gradeSide("over", 2.5, 2)).toBe("loss");
    expect(gradeSide("under", 2.5, 2)).toBe("win");
    expect(gradeSide("over", 3, 3)).toBe("push");
  });

  it("pays wins at the price, loses the stake, returns pushes", () => {
    expect(profitUnits("win", 100, 2)).toBeCloseTo(2, 10);
    expect(profitUnits("win", -110, 1.1)).toBeCloseTo(1, 6);
    expect(profitUnits("loss", -110, 1)).toBe(-1);
    expect(profitUnits("push", -110, 1)).toBe(0);
  });

  it("keeps late picks out of the record", () => {
    expect(isEligible(pick())).toBe(true);
    expect(isEligible(pick({ createdAt: "2026-11-21T00:05:00Z" }))).toBe(false);
    const late = pick({ id: "late", createdAt: "2026-11-21T01:00:00Z" });
    const s = summarize([late], [gradePick(late, 5, undefined)]);
    expect(s.picks).toBe(0);
  });

  it("summarizes profit, ROI and closing line value", () => {
    const a = pick({ id: "a", odds: 100 });
    const b = pick({ id: "b", odds: -110, modelProb: 0.55 });
    const c = pick({ id: "c", line: 3, odds: 100 });
    const grades = [gradePick(a, 4, -110), gradePick(b, 1, -120), gradePick(c, 3, undefined)];
    const s = summarize([a, b, c], grades);
    expect(s.picks).toBe(3);
    expect(s.wins).toBe(1);
    expect(s.losses).toBe(1);
    expect(s.pushes).toBe(1);
    expect(s.profit).toBeCloseTo(0, 6); // +1 on a, -1 on b, 0 on the push
    expect(s.unitsStaked).toBe(3);
    expect(s.clvSample).toBe(2);
    expect(s.avgClv).not.toBeNull();
    expect(s.brier).toBeGreaterThan(0);
  });

  it("scores probabilities", () => {
    expect(brierScore([1, 0], [true, false])).toBe(0);
    expect(brierScore([0.5, 0.5], [true, false])).toBeCloseTo(0.25, 10);
    expect(logLoss([0.5, 0.5], [true, false])).toBeCloseTo(Math.log(2), 10);
    expect(Number.isFinite(logLoss([1, 0], [false, true]))).toBe(true);
  });

  it("bins predictions to check calibration", () => {
    const bins = calibrationBins([0.55, 0.58, 0.62, 0.9], [true, false, true, true], 5);
    const mid = bins.find((b) => b.lo === 0.4 && b.hi === 0.6)!;
    expect(mid.n).toBe(2);
    expect(mid.actual).toBe(0.5);
    expect(bins.find((b) => b.hi === 1)!.n).toBe(1);
  });
});
