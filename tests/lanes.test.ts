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
