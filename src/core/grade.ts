import { americanToDecimal, closingLineValue } from "./odds";
import type { Grade, Outcome, Pick, Side } from "./types";

export function gradeSide(side: Side, line: number, actual: number): Outcome {
  if (actual === line) return "push";
  const over = actual > line;
  return (side === "over") === over ? "win" : "loss";
}

/** Profit in units: a win pays odds-1 per unit, a loss costs the stake, a push returns it. */
export function profitUnits(outcome: Outcome, american: number, units: number): number {
  if (outcome === "push") return 0;
  if (outcome === "loss") return -units;
  return units * (americanToDecimal(american) - 1);
}

export function gradePick(pick: Pick, actual: number, closeOdds: number | undefined, now = new Date()): Grade {
  const outcome = gradeSide(pick.side, pick.line, actual);
  const grade: Grade = {
    pickId: pick.id,
    actual,
    outcome,
    profit: profitUnits(outcome, pick.odds, pick.units),
    gradedAt: now.toISOString(),
  };
  if (closeOdds != null) grade.closeOdds = closeOdds;
  return grade;
}

/** A pick only counts if it was logged before the game started. Late entries are excluded from the record. */
export function isEligible(pick: Pick): boolean {
  return Date.parse(pick.createdAt) < Date.parse(pick.gameStart);
}

/** Mean squared error of probabilities. 0 is perfect, 0.25 is a coin flip every time. */
export function brierScore(probs: number[], outcomes: boolean[]): number {
  if (probs.length === 0) return NaN;
  return probs.reduce((acc, p, i) => acc + (p - (outcomes[i] ? 1 : 0)) ** 2, 0) / probs.length;
}

export function logLoss(probs: number[], outcomes: boolean[]): number {
  if (probs.length === 0) return NaN;
  const eps = 1e-12;
  return (
    -probs.reduce((acc, p, i) => {
      const q = Math.min(1 - eps, Math.max(eps, p));
      return acc + (outcomes[i] ? Math.log(q) : Math.log(1 - q));
    }, 0) / probs.length
  );
}

export interface CalibrationBin {
  lo: number;
  hi: number;
  n: number;
  predicted: number;
  actual: number;
}

/** Do your 60% picks win about 60% of the time? Empty bins are dropped. */
export function calibrationBins(probs: number[], outcomes: boolean[], bins = 5): CalibrationBin[] {
  const out: CalibrationBin[] = [];
  for (let b = 0; b < bins; b++) {
    const lo = b / bins;
    const hi = (b + 1) / bins;
    const idx = probs.map((p, i) => i).filter((i) => probs[i]! >= lo && (b === bins - 1 ? probs[i]! <= hi : probs[i]! < hi));
    if (idx.length === 0) continue;
    const predicted = idx.reduce((a, i) => a + probs[i]!, 0) / idx.length;
    const actual = idx.filter((i) => outcomes[i]).length / idx.length;
    out.push({ lo, hi, n: idx.length, predicted, actual });
  }
  return out;
}

export interface Summary {
  picks: number;
  wins: number;
  losses: number;
  pushes: number;
  unitsStaked: number;
  profit: number;
  /** Profit divided by units staked. */
  roi: number;
  /** Average price improvement vs close over picks with a closing price. */
  avgClv: number | null;
  clvSample: number;
  brier: number;
  logLoss: number;
}

export function summarize(picks: Pick[], grades: Grade[]): Summary {
  const byId = new Map(picks.map((p) => [p.id, p]));
  const rows = grades
    .map((g) => ({ g, p: byId.get(g.pickId) }))
    .filter((r): r is { g: Grade; p: Pick } => r.p != null && isEligible(r.p));

  const wins = rows.filter((r) => r.g.outcome === "win").length;
  const losses = rows.filter((r) => r.g.outcome === "loss").length;
  const pushes = rows.filter((r) => r.g.outcome === "push").length;
  const unitsStaked = rows.reduce((a, r) => a + r.p.units, 0);
  const profit = rows.reduce((a, r) => a + r.g.profit, 0);

  const withClose = rows.filter((r) => r.g.closeOdds != null);
  const avgClv = withClose.length
    ? withClose.reduce((a, r) => a + closingLineValue(r.p.odds, r.g.closeOdds!), 0) / withClose.length
    : null;

  const decided = rows.filter((r) => r.g.outcome !== "push");
  const probs = decided.map((r) => r.p.modelProb);
  const hits = decided.map((r) => r.g.outcome === "win");

  return {
    picks: rows.length,
    wins,
    losses,
    pushes,
    unitsStaked,
    profit,
    roi: unitsStaked > 0 ? profit / unitsStaked : 0,
    avgClv,
    clvSample: withClose.length,
    brier: brierScore(probs, hits),
    logLoss: logLoss(probs, hits),
  };
}
