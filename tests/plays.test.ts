import { describe, expect, it } from "vitest";
import { overUnder, type CountDist } from "../src/core/dist";
import { atLeast, priceLadder, rankRungs } from "../src/core/ladder";
import { americanToDecimal } from "../src/core/odds";
import { DEFAULT_POTD_RULES, inPriceWindow, playsOfTheDay, type Candidate } from "../src/core/potd";
import { buildTickets, parlayDecimal, PLUS_100_RULES, type Leg } from "../src/core/ticket";

const dist: CountDist = { kind: "negbin", mean: 24, size: 14 };

describe("alt-line ladder", () => {
  it("matches the over probability and never rises as the threshold climbs", () => {
    // "25+" is the same event as "over 24.5".
    expect(atLeast(dist, 25)).toBeCloseTo(overUnder(dist, 24.5).over, 12);
    const probs = [15, 20, 25, 30, 35].map((n) => atLeast(dist, n));
    for (let i = 1; i < probs.length; i++) expect(probs[i]!).toBeLessThan(probs[i - 1]!);
    expect(atLeast({ kind: "poisson", mean: 3 }, 3)).toBeCloseTo(0.57681, 4);
  });

  it("prices quoted rungs and leaves the rest blank", () => {
    const rungs = priceLadder(dist, [30, 20, 25], { 30: +300, 20: -250 });
    expect(rungs.map((r) => r.threshold)).toEqual([20, 25, 30]);
    expect(rungs[1]!.odds).toBeNull();
    expect(rungs[1]!.ev).toBeNull();
    expect(rungs[2]!.bookProb).toBeCloseTo(0.25, 10);
    expect(rungs[2]!.edge).toBeCloseTo(rungs[2]!.prob - 0.25, 10);
  });

  it("ranks only rungs that clear the bar, best EV first", () => {
    const ranked = rankRungs(priceLadder(dist, [15, 20, 25, 30, 35], { 15: -2000, 20: -300, 25: +100, 30: +300, 35: +900 }));
    expect(ranked.length).toBeGreaterThan(0);
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1]!.ev!).toBeGreaterThanOrEqual(ranked[i]!.ev!);
    expect(ranked.every((r) => r.ev! >= 0.02)).toBe(true);
    expect(ranked.some((r) => r.threshold === 15)).toBe(false);
  });
});

const leg = (id: string, game: string, prob: number, odds: number): Leg => ({ id, label: id, game, prob, odds });

describe("+100 ticket builder", () => {
  const legs = [
    leg("a", "g1", 0.72, -250),
    leg("b", "g2", 0.7, -230),
    leg("c", "g3", 0.68, -200),
    leg("d", "g1", 0.74, -270),
    leg("e", "g4", 0.55, +110),
  ];

  it("multiplies decimal prices", () => {
    expect(parlayDecimal([legs[0]!, legs[1]!])).toBeCloseTo(americanToDecimal(-250) * americanToDecimal(-230), 10);
  });

  it("only returns tickets that pay +100 or better", () => {
    const tickets = buildTickets(legs);
    expect(tickets.length).toBeGreaterThan(0);
    for (const t of tickets) {
      expect(t.decimal).toBeGreaterThanOrEqual(2);
      expect(t.american).toBeGreaterThanOrEqual(100);
    }
  });

  it("keeps same-game legs apart by default and flags them when allowed", () => {
    const strict = buildTickets(legs, { ...PLUS_100_RULES, top: 50 });
    expect(strict.every((t) => !t.sameGame)).toBe(true);
    const loose = buildTickets(legs, { ...PLUS_100_RULES, allowSameGame: true, top: 50 });
    expect(loose.some((t) => t.sameGame)).toBe(true);
  });

  it("ranks by expected value and respects the leg limits", () => {
    const tickets = buildTickets(legs, { ...PLUS_100_RULES, maxLegs: 2, top: 50 });
    expect(tickets.every((t) => t.legs.length === 2)).toBe(true);
    for (let i = 1; i < tickets.length; i++) expect(tickets[i - 1]!.ev).toBeGreaterThanOrEqual(tickets[i]!.ev);
  });

  it("returns nothing when no combination reaches the target", () => {
    expect(buildTickets([leg("x", "g1", 0.9, -900), leg("y", "g2", 0.9, -900)])).toEqual([]);
  });

  it("computes the joint probability and EV from the legs", () => {
    const [t] = buildTickets([leg("a", "g1", 0.7, -240), leg("b", "g2", 0.7, -240)], { ...PLUS_100_RULES, minAmerican: 100 });
    expect(t).toBeDefined();
    expect(t!.jointProb).toBeCloseTo(0.49, 10);
    expect(t!.ev).toBeCloseTo(0.49 * (t!.decimal - 1) - 0.51, 10);
  });
});

function cand(sport: Candidate["sport"], label: string, odds: number, over: Partial<Candidate> = {}): Candidate {
  return { sport, label, side: "over", odds, modelProb: 0.6, bookProb: 0.53, devigged: true, edge: 0.07, ev: 0.08, stakeFraction: 0.01, ...over };
}

describe("play of the day", () => {
  it("treats -110 to -135 as the default window", () => {
    expect(inPriceWindow(-110, -135, -110)).toBe(true);
    expect(inPriceWindow(-135, -135, -110)).toBe(true);
    expect(inPriceWindow(-120, -135, -110)).toBe(true);
    expect(inPriceWindow(-105, -135, -110)).toBe(false);
    expect(inPriceWindow(-140, -135, -110)).toBe(false);
    expect(inPriceWindow(+110, -135, -110)).toBe(false);
  });

  it("picks the best-EV play per sport inside the window", () => {
    const out = playsOfTheDay([
      cand("nba", "A", -120, { ev: 0.05 }),
      cand("nba", "B", -125, { ev: 0.09 }),
      cand("nba", "C", +100, { ev: 0.3 }),
      cand("nhl", "D", -110),
    ]);
    expect(out.nba?.label).toBe("B");
    expect(out.nhl?.label).toBe("D");
    expect(out.nfl).toBeNull();
    expect(out.mlb).toBeNull();
  });

  it("skips plays that do not clear the bar or lack a real no-vig price", () => {
    const out = playsOfTheDay([
      cand("nba", "thin", -120, { edge: 0.01, ev: 0.005 }),
      cand("nfl", "vig-in", -120, { devigged: false }),
    ]);
    expect(out.nba).toBeNull();
    expect(out.nfl).toBeNull();
    const relaxed = playsOfTheDay([cand("nfl", "vig-in", -120, { devigged: false })], { ...DEFAULT_POTD_RULES, requireDevig: false });
    expect(relaxed.nfl?.label).toBe("vig-in");
  });
});
