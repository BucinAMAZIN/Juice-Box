/** Odds math. Everything here is pure and works in American odds unless a name says otherwise. */

export function americanToDecimal(american: number): number {
  if (!Number.isFinite(american) || american === 0 || Math.abs(american) < 100) {
    throw new RangeError(`Invalid American odds: ${american}`);
  }
  return american > 0 ? 1 + american / 100 : 1 + 100 / -american;
}

export function decimalToAmerican(decimal: number): number {
  if (!Number.isFinite(decimal) || decimal <= 1) throw new RangeError(`Invalid decimal odds: ${decimal}`);
  return decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1));
}

/** Implied probability of a price, vig included. Also the break-even win rate. */
export function impliedProb(american: number): number {
  return 1 / americanToDecimal(american);
}

export const breakEven = impliedProb;

export type DevigMethod = "multiplicative" | "power";

/**
 * Remove the vig from a two-way market and return the fair probability of each side.
 * `multiplicative` scales both sides evenly. `power` shades the longshot more, which is
 * closer to how books actually build their margins on lopsided prices.
 */
export function devigTwoWay(
  overAmerican: number,
  underAmerican: number,
  method: DevigMethod = "multiplicative",
): { over: number; under: number; vig: number } {
  const io = impliedProb(overAmerican);
  const iu = impliedProb(underAmerican);
  const total = io + iu;
  const vig = total - 1;
  if (method === "multiplicative" || total <= 1) {
    return { over: io / total, under: iu / total, vig };
  }
  // Solve io^k + iu^k = 1 for k > 1 by bisection.
  let lo = 1;
  let hi = 20;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (io ** mid + iu ** mid > 1) lo = mid;
    else hi = mid;
  }
  const k = (lo + hi) / 2;
  return { over: io ** k, under: iu ** k, vig };
}

/** Expected profit per 1 unit staked, given your win probability and the offered price. */
export function expectedValue(winProb: number, american: number): number {
  const b = americanToDecimal(american) - 1;
  return winProb * b - (1 - winProb);
}

/** Full Kelly fraction of bankroll. Zero when there is no edge. */
export function kellyFraction(winProb: number, american: number): number {
  const b = americanToDecimal(american) - 1;
  const f = (b * winProb - (1 - winProb)) / b;
  return f > 0 ? f : 0;
}

/** Fractional Kelly with a hard cap, for sizing that survives model error. */
export function stakeFraction(winProb: number, american: number, kellyMultiplier = 0.25, cap = 0.02): number {
  return Math.min(cap, kellyFraction(winProb, american) * kellyMultiplier);
}

/** Percent price improvement versus the closing price. Positive means you beat the close. */
export function closingLineValue(pickAmerican: number, closeAmerican: number): number {
  return americanToDecimal(pickAmerican) / americanToDecimal(closeAmerican) - 1;
}

export function formatAmerican(american: number): string {
  return american > 0 ? `+${american}` : `${american}`;
}
