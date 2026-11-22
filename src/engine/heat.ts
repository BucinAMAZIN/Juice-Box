import type { HandedPick } from "./types";

/**
 * How likely a streak prop is to hit, from the book's price plus what graded results showed adds to it:
 * a big cushion (average well above the line) and a streak of 10+ helps (16-0 so far, while 5 to 9 straight hit about 66%), a thin cushion hurts.
 * The adjustments are small and come from one graded day so far, so they are refit as more results land.
 */
export function likelihood(p: HandedPick): number {
  let s = p.modelProb;
  // The adjustments were measured on NBA props only. Other sports use the price alone until they have their own graded results.
  if (p.sport !== "nba") return Math.max(0.01, Math.min(0.99, s));
  const c = p.avg != null && p.line + 0.5 > 0 ? p.avg / (p.line + 0.5) - 1 : null;
  if (c != null) s += c >= 0.25 ? 0.06 : c < 0.1 ? -0.06 : 0;
  if ((p.streak ?? 0) >= 10) s += 0.08;
  return Math.max(0.01, Math.min(0.99, s));
}

/** Green at 85% and up, red at 50% and under, blending through yellow in between. */
export function heatHue(prob: number): number {
  return Math.round(120 * Math.max(0, Math.min(1, (prob - 0.5) / 0.35)));
}
