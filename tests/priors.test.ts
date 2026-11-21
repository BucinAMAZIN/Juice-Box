import { describe, expect, it } from "vitest";
import { applyPriors, haircutFor } from "../src/engine/filter";
import { buildPriors, type FeedRow } from "../src/engine/priors";
import type { Candidate } from "../src/engine/select";

function rows(n: number, wins: number, odds: string, sport = "NBA", fam = "Player points"): FeedRow[] {
  return Array.from({ length: n }, (_, i) => ({ date: "2026-11-01", sport, fam, prop: "x", pick: "p", odds, res: i < wins ? "W" : "L" }));
}

describe("ParlayBOT priors", () => {
  it("measures hit rate against the price and skips parlays, voids and unpriced rows", () => {
    const feed: FeedRow[] = [
      ...rows(100, 50, "-200"),
      { sport: "NBA", fam: "Parlay", prop: "NBA parlay", odds: "+200", res: "W" },
      { sport: "NBA", fam: "Player points", prop: "x", odds: "n/a", res: "W" },
      { sport: "NBA", fam: "Player points", prop: "x", odds: "-110", res: "V" },
      { sport: "NBA", fam: "Player points", prop: "x", odds: "-110", res: "W", legs: [{}] },
    ];
    const p = buildPriors(feed);
    expect(p.sample).toBe(100);
    const seg = p.segments.find((s) => s.key === "nba:Player points")!;
    expect(seg.hit).toBeCloseTo(0.5);
    expect(seg.implied).toBeCloseTo(2 / 3, 3);
    // gap 16.7 pts, shrunk by 100 / 250
    expect(seg.haircut).toBeCloseTo((2 / 3 - 0.5) * 0.4, 3);
    expect(p.segments.some((s) => s.key === "heavy")).toBe(true);
  });

  it("ignores small segments and never rewards a segment that beat its price", () => {
    const p = buildPriors([...rows(10, 0, "-110"), ...rows(100, 90, "-110", "NBA", "Assists")]);
    expect(p.segments.find((s) => s.key === "nba:Player points")).toBeUndefined();
    expect(p.segments.find((s) => s.key === "nba:Assists")!.haircut).toBe(0);
  });
});

describe("haircut", () => {
  const priors = buildPriors([
    ...rows(200, 100, "-130"),
    ...["NHL", "NFL", "NCAAF", "WNBA"].flatMap((sp) => rows(50, 33, "-300", sp, "Other")),
  ]);
  it("uses the larger of the market haircut and the heavy-favorite haircut, not both", () => {
    const own = haircutFor("nba", "points", 0.6, priors);
    expect(own.haircut).toBeGreaterThan(0);
    const heavy = haircutFor("mlb", "sog", 0.75, priors);
    expect(heavy.reason).toMatch(/heavy favorites/);
    const light = haircutFor("mlb", "sog", 0.6, priors);
    expect(light.haircut).toBe(0);
  });

  it("lowers candidate probability and keeps the original", () => {
    const c = { projection: { market: "points" }, threshold: 1, line: 0.5, prob: 0.6 } as unknown as Candidate;
    const [out] = applyPriors([c], "nba", priors);
    expect(out!.prob).toBeLessThan(0.6);
    expect(out!.rawProb).toBe(0.6);
    expect(out!.adjustment).toBeTruthy();
  });
});
