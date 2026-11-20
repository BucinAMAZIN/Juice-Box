/** Count distributions for shots, points and the like. */

export type CountDist =
  | { kind: "poisson"; mean: number }
  /** Negative binomial with a given mean and size r. Variance = mean * (1 + mean / r). Smaller r = more spread. */
  | { kind: "negbin"; mean: number; size: number };

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

export function logGamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * z))) - logGamma(1 - z);
  const x = z - 1;
  let a = 0.99999999999980993;
  const t = x + 7.5;
  for (let i = 0; i < LANCZOS.length; i++) a += LANCZOS[i]! / (x + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function logFactorial(k: number): number {
  return logGamma(k + 1);
}

export function pmf(dist: CountDist, k: number): number {
  if (!Number.isInteger(k) || k < 0) return 0;
  if (dist.mean <= 0) return k === 0 ? 1 : 0;
  if (dist.kind === "poisson") {
    return Math.exp(k * Math.log(dist.mean) - dist.mean - logFactorial(k));
  }
  const r = dist.size;
  const p = r / (r + dist.mean);
  return Math.exp(logGamma(k + r) - logFactorial(k) - logGamma(r) + r * Math.log(p) + k * Math.log(1 - p));
}

/** P(X <= k). */
export function cdf(dist: CountDist, k: number): number {
  if (k < 0) return 0;
  let sum = 0;
  for (let i = 0; i <= Math.floor(k); i++) sum += pmf(dist, i);
  return Math.min(1, sum);
}

export function variance(dist: CountDist): number {
  return dist.kind === "poisson" ? dist.mean : dist.mean * (1 + dist.mean / dist.size);
}

/**
 * Probabilities for an over/under line. Half-point lines never push. Whole-number lines can,
 * and the push probability is returned so callers can price it correctly.
 */
export function overUnder(dist: CountDist, line: number): { over: number; under: number; push: number } {
  if (Number.isInteger(line)) {
    const push = pmf(dist, line);
    const under = cdf(dist, line - 1);
    return { over: Math.max(0, 1 - under - push), under, push };
  }
  const under = cdf(dist, Math.floor(line));
  return { over: 1 - under, under, push: 0 };
}
