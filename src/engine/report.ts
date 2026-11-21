import { brierScore, calibrationBins, logLoss, type CalibrationBin } from "../core/grade";
import type { DayFile, DayGrades, GradedPick, HandedPick } from "./types";

export interface Slice {
  picks: number;
  wins: number;
  losses: number;
  pushes: number;
  hitRate: number | null;
  /** Average model probability over decided picks. If it sits far from hitRate, the model is over- or under-confident. */
  avgModelProb: number | null;
  /** Flat 1u at each pick's limit price. A stand-in for the price you took, not a measured result. */
  profitAtLimit: number;
}

export interface Report {
  generatedAt: string;
  modelVersion: string | null;
  totalPicks: number;
  graded: number;
  overall: Slice;
  byMarket: Record<string, Slice>;
  byKind: Record<string, Slice>;
  tickets: { total: number; settled: number; won: number };
  brier: number | null;
  logLoss: number | null;
  calibration: CalibrationBin[];
  /** Plain-language reading of what the numbers say so far. */
  findings: string[];
}

function slice(rows: Array<{ pick: HandedPick; grade: GradedPick }>): Slice {
  const wins = rows.filter((r) => r.grade.outcome === "win").length;
  const losses = rows.filter((r) => r.grade.outcome === "loss").length;
  const decided = rows.filter((r) => r.grade.outcome !== "push");
  return {
    picks: rows.length,
    wins,
    losses,
    pushes: rows.length - wins - losses,
    hitRate: decided.length ? wins / decided.length : null,
    avgModelProb: decided.length ? decided.reduce((a, r) => a + r.pick.modelProb, 0) / decided.length : null,
    profitAtLimit: rows.reduce((a, r) => a + r.grade.profitAtLimit, 0),
  };
}

/** Enough graded picks in a slice before any conclusion is worth acting on. */
export const MIN_SAMPLE = 200;

export function buildReport(days: DayFile[], grades: DayGrades[], now: Date): Report {
  const picks = new Map(days.flatMap((d) => d.picks).map((p) => [p.id, p]));
  const graded = grades.flatMap((g) => g.grades);
  const rows = graded.flatMap((grade) => {
    const pick = picks.get(grade.pickId);
    return pick ? [{ pick, grade }] : [];
  });

  const group = (key: (p: HandedPick) => string): Record<string, Slice> => {
    const buckets = new Map<string, typeof rows>();
    for (const r of rows) buckets.set(key(r.pick), [...(buckets.get(key(r.pick)) ?? []), r]);
    return Object.fromEntries([...buckets].map(([k, v]) => [k, slice(v)]));
  };

  const decided = rows.filter((r) => r.grade.outcome !== "push");
  const probs = decided.map((r) => r.pick.modelProb);
  const hits = decided.map((r) => r.grade.outcome === "win");

  const outcomeById = new Map(graded.map((g) => [g.pickId, g.outcome]));
  const allTickets = days.flatMap((d) => d.tickets);
  const settled = allTickets.filter((t) => t.legIds.every((id) => outcomeById.has(id)));
  const won = settled.filter((t) => t.legIds.every((id) => outcomeById.get(id) === "win"));

  const overall = slice(rows);
  const report: Report = {
    generatedAt: now.toISOString(),
    modelVersion: days.at(-1)?.modelVersion ?? null,
    totalPicks: picks.size,
    graded: rows.length,
    overall,
    byMarket: group((p) => p.market),
    byKind: group((p) => p.kind),
    tickets: { total: allTickets.length, settled: settled.length, won: won.length },
    brier: decided.length ? brierScore(probs, hits) : null,
    logLoss: decided.length ? logLoss(probs, hits) : null,
    calibration: calibrationBins(probs, hits, 5),
    findings: [],
  };
  report.findings = findingsFor(report);
  return report;
}

function findingsFor(r: Report): string[] {
  const out: string[] = [];
  if (r.graded === 0) return ["Nothing graded yet. Picks are graded the morning after their games."];
  const o = r.overall;
  if (r.graded < MIN_SAMPLE) {
    out.push(`Only ${r.graded} graded picks. Under ${MIN_SAMPLE}, a hot or cold stretch is mostly luck, so no changes to the model are recommended yet.`);
  }
  if (o.hitRate != null && o.avgModelProb != null) {
    const gap = o.hitRate - o.avgModelProb;
    const word = Math.abs(gap) < 0.03 ? "close to" : gap < 0 ? "below" : "above";
    out.push(`Picks hit ${(o.hitRate * 100).toFixed(1)}% against an average model probability of ${(o.avgModelProb * 100).toFixed(1)}%, which is ${word} what the model expected.`);
    if (r.graded >= MIN_SAMPLE && gap < -0.04) out.push("The model looks overconfident. Consider shrinking projections toward the league rate.");
    if (r.graded >= MIN_SAMPLE && gap > 0.04) out.push("The model looks underconfident. It may be shrinking projections too hard.");
  }
  for (const [market, s] of Object.entries(r.byMarket)) {
    if (s.picks >= 30 && s.hitRate != null && s.avgModelProb != null && Math.abs(s.hitRate - s.avgModelProb) > 0.08) {
      out.push(`${market}: hit ${(s.hitRate * 100).toFixed(0)}% vs ${(s.avgModelProb * 100).toFixed(0)}% expected over ${s.picks} picks. Worth a closer look.`);
    }
  }
  return out;
}
