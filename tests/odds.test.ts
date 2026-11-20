import { describe, expect, it } from "vitest";
import {
  americanToDecimal,
  breakEven,
  closingLineValue,
  decimalToAmerican,
  devigTwoWay,
  expectedValue,
  kellyFraction,
  stakeFraction,
} from "../src/core/odds";

describe("odds", () => {
  it("converts American odds to decimal", () => {
    expect(americanToDecimal(100)).toBeCloseTo(2, 10);
    expect(americanToDecimal(-110)).toBeCloseTo(1.909091, 5);
    expect(americanToDecimal(150)).toBeCloseTo(2.5, 10);
    expect(decimalToAmerican(2.5)).toBe(150);
    expect(decimalToAmerican(1.909091)).toBe(-110);
  });

  it("rejects impossible prices", () => {
    expect(() => americanToDecimal(0)).toThrow();
    expect(() => americanToDecimal(50)).toThrow();
  });

  it("knows the break-even rate", () => {
    expect(breakEven(-110)).toBeCloseTo(0.5238, 4);
    expect(breakEven(+100)).toBeCloseTo(0.5, 10);
    expect(breakEven(-165)).toBeCloseTo(0.6226, 4);
  });

  it("removes the vig from a -110/-110 market", () => {
    const fair = devigTwoWay(-110, -110);
    expect(fair.over).toBeCloseTo(0.5, 10);
    expect(fair.under).toBeCloseTo(0.5, 10);
    expect(fair.vig).toBeCloseTo(0.0476, 3);
  });

  it("devigs a lopsided market so both sides sum to 1", () => {
    for (const method of ["multiplicative", "power"] as const) {
      const fair = devigTwoWay(-165, +135, method);
      expect(fair.over + fair.under).toBeCloseTo(1, 6);
      expect(fair.over).toBeGreaterThan(fair.under);
    }
  });

  it("power devig takes less from the favorite than multiplicative", () => {
    const m = devigTwoWay(-300, +240, "multiplicative");
    const p = devigTwoWay(-300, +240, "power");
    expect(p.over).toBeGreaterThan(m.over);
  });

  it("computes EV and Kelly", () => {
    expect(expectedValue(0.6, 100)).toBeCloseTo(0.2, 10);
    expect(kellyFraction(0.6, 100)).toBeCloseTo(0.2, 10);
    expect(kellyFraction(0.4, 100)).toBe(0);
    expect(expectedValue(0.5238, -110)).toBeCloseTo(0, 3);
  });

  it("caps the suggested stake", () => {
    expect(stakeFraction(0.9, 100)).toBe(0.02);
    expect(stakeFraction(0.5, 100)).toBe(0);
  });

  it("measures closing line value as price improvement", () => {
    // 2.0 / 1.909 - 1
    expect(closingLineValue(100, -110)).toBeCloseTo(0.0476, 3);
    expect(closingLineValue(-110, 100)).toBeLessThan(0);
    expect(closingLineValue(-120, -120)).toBeCloseTo(0, 10);
  });
});
