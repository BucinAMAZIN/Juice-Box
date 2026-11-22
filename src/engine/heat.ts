/** Green at 85% and up, red at 50% and under, blending through yellow in between. */
export function heatHue(prob: number): number {
  return Math.round(120 * Math.max(0, Math.min(1, (prob - 0.5) / 0.35)));
}
