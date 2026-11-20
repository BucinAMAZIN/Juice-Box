import { describe, expect, it } from "vitest";
import { cdf, overUnder, pmf, variance } from "../src/core/dist";
import { DEFAULT_FLAG_RULES, evaluateProp, flagBest } from "../src/core/evaluate";
import { blendContext, combineFactors, expectedCount, project, shrinkRate } from "../src/core/model";

describe("distributions", () => {
  it("matches a hand-computed Poisson tail", () => {
    // P(X >= 3) for mean 3 = 1 - e^-3 * (1 + 3 + 4.5)
    const { over } = overUnder({ kind: "poisson", mean: 3 }, 2.5);
    expect(over).toBeCloseTo(0.57681, 4);
  });

  it("sums to one", () => {
    for (const dist of [
      { kind: "poisson", mean: 3.2 } as const,
      { kind: "negbin", mean: 3.2, size: 10 } as const,
    ]) {
      let total = 0;
      for (let k = 0; k < 80; k++) total += pmf(dist, k);
      expect(total).toBeCloseTo(1, 8);
      expect(cdf(dist, 79)).toBeCloseTo(1, 8);
    }
  });

  it("negative binomial approaches Poisson as size grows", () => {
    const p = pmf({ kind: "poisson", mean: 3 }, 4);
    const nb = pmf({ kind: "negbin", mean: 3, size: 1e6 }, 4);
    expect(nb).toBeCloseTo(p, 4);
  });

  it("negative binomial has fatter tails than Poisson at the same mean", () => {
    const poisson = overUnder({ kind: "poisson", mean: 3 }, 6.5).over;
    const nb = overUnder({ kind: "negbin", mean: 3, size: 4 }, 6.5).over;
    expect(nb).toBeGreaterThan(poisson);
    expect(variance({ kind: "negbin", mean: 3, size: 4 })).toBeCloseTo(3 * (1 + 3 / 4), 10);
  });

  it("handles pushes on whole-number lines", () => {
    const { over, under, push } = overUnder({ kind: "poisson", mean: 3 }, 3);
    expect(over + under + push).toBeCloseTo(1, 10);
    expect(push).toBeGreaterThan(0.2);
  });

  it("handles a zero mean", () => {
    expect(overUnder({ kind: "poisson", mean: 0 }, 0.5).over).toBe(0);
  });
});

describe("projection model", () => {
  it("multiplies rate by ice time across game states", () => {
    const mean = expectedCount({ ev: 9, pp: 12, pk: 1 }, { ev: 15, pp: 3, pk: 1 });
    // (9*15 + 12*3 + 1*1) / 60 = 172 / 60
    expect(mean).toBeCloseTo(2.8667, 3);
  });

  it("shrinks small samples toward the prior and leaves big ones alone", () => {
    const small = shrinkRate(6, 60, 3, 300);
    const big = shrinkRate(6, 3000, 3, 300);
    expect(small).toBeCloseTo(3.5, 5);
    expect(big).toBeGreaterThan(5.4);
    expect(shrinkRate(6, 0, 3, 300)).toBe(3);
  });

  it("barely moves on a tiny with-or-without sample", () => {
    expect(blendContext(8, 20, 5, 200)).toBeLessThan(5.3);
  });

  it("clamps runaway adjustments", () => {
    expect(combineFactors([2, 2])).toBe(1.3);
    expect(combineFactors([0.5, 0.5])).toBe(0.7);
    expect(combineFactors([1.05, 0.98])).toBeCloseTo(1.029, 5);
  });

  it("builds a projection with market dispersion", () => {
    const p = project({
      market: "sog",
      ratesPer60: { ev: 9, pp: 12, pk: 1 },
      toiMinutes: { ev: 15, pp: 3, pk: 1 },
      factors: [1.1],
    });
    expect(p.mean).toBeCloseTo(2.8667 * 1.1, 3);
    expect(p.dist.kind).toBe("negbin");
    expect(project({ market: "goals", ratesPer60: { ev: 1, pp: 1, pk: 0 }, toiMinutes: { ev: 15, pp: 3, pk: 0 } }).dist.kind).toBe("poisson");
  });
});

describe("edge evaluation", () => {
  const dist = { kind: "poisson", mean: 3.5 } as const;

  it("uses the no-vig price when both sides are quoted", () => {
    const evals = evaluateProp(dist, 2.5, { overOdds: -130, underOdds: +110 });
    const over = evals.find((e) => e.side === "over")!;
    expect(over.devigged).toBe(true);
    expect(over.bookProb).toBeLessThan(0.565); // fair is below the raw implied rate
    expect(over.edge).toBeGreaterThan(0);
  });

  it("falls back to raw implied probability for one-sided quotes and says so", () => {
    const [only] = evaluateProp(dist, 2.5, { overOdds: -130 });
    expect(only!.devigged).toBe(false);
    expect(only!.bookProb).toBeCloseTo(0.5652, 3);
  });

  it("flags only plays that clear the bar", () => {
    const strong = evaluateProp({ kind: "poisson", mean: 5 }, 2.5, { overOdds: -110, underOdds: -110 });
    expect(flagBest(strong)?.side).toBe("over");
    const fair = evaluateProp({ kind: "poisson", mean: 2.9 }, 2.5, { overOdds: -110, underOdds: -110 });
    expect(flagBest(fair, { ...DEFAULT_FLAG_RULES, minEdge: 0.15 })).toBeNull();
  });

  it("can demand a real devig before flagging", () => {
    const one = evaluateProp({ kind: "poisson", mean: 5 }, 2.5, { overOdds: -110 });
    expect(flagBest(one, { ...DEFAULT_FLAG_RULES, requireDevig: true })).toBeNull();
  });

  it("prices pushes as zero profit", () => {
    const dist = { kind: "poisson", mean: 3 } as const;
    const { push } = overUnder(dist, 3);
    const [over] = evaluateProp(dist, 3, { overOdds: +100 });
    // At +100 the EV of a decided bet is 2p - 1. A push dilutes that by the chance the bet is decided.
    const decidedEv = 2 * over!.modelProb - 1;
    expect(over!.ev).toBeCloseTo((1 - push) * decidedEv, 10);
  });
});
