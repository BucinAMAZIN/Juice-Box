import type { Call, Grade, Lean } from "./leans";
import { type LineGame, coverResult, rate, totalResult } from "./lines";

/** A lean frozen before the game, with the line it was made against. */
export interface LoggedLean {
  league: string;
  date: string;
  fav: string;
  dog: string;
  spread: number;
  ml?: number;
  total: number;
  lean: { total: Pick<Call, "side" | "grade" | "pct" | "n"> | null; spread: (Pick<Call, "side" | "grade" | "pct" | "n"> & { note?: string }) | null };
}

export const freeze = (g: LineGame, league: string, lean: Lean): LoggedLean => {
  const pick = (c: Call | null) => (c ? { side: c.side, grade: c.grade, pct: Number(c.pct.toFixed(4)), n: c.n, ...(c.note === "moneyline" ? { note: "moneyline" } : {}) } : null);
  return { league, date: g.date, fav: g.fav, dog: g.dog, spread: g.spread, ...(g.ml != null ? { ml: g.ml } : {}), total: g.total, lean: { total: pick(lean.total), spread: pick(lean.spread) } as LoggedLean["lean"] };
};

/** Did the logged call win, lose or push against the final score? Null while the game is unfinished. */
export function gradeLean(l: LoggedLean, kind: "total" | "spread", final: LineGame): "win" | "loss" | "push" | null {
  if (final.favScore == null || final.dogScore == null) return null;
  const game: LineGame = { ...final, spread: l.spread, total: l.total };
  const c = l.lean[kind];
  if (!c) return null;
  if (kind === "total") {
    const t = totalResult(game);
    return t == null ? null : t === "push" ? "push" : t === c.side ? "win" : "loss";
  }
  if ((c as { note?: string }).note === "moneyline") {
    if (final.favScore === final.dogScore) return "push";
    const favWon = final.favScore > final.dogScore;
    return (c.side === "favorite") === favWon ? "win" : "loss";
  }
  const r = coverResult(game);
  return r == null ? null : r === "push" ? "push" : (r === "cover") === (c.side === "favorite") ? "win" : "loss";
}

export interface Tally { grade: Grade; kind: "total" | "spread"; wins: number; losses: number; pushes: number }

/** Record by grade and kind across every finished logged game. */
export function tallyLeans(logged: Record<string, LoggedLean>, finals: Map<string, LineGame>): Tally[] {
  const out = new Map<string, Tally>();
  for (const [id, l] of Object.entries(logged)) {
    const f = finals.get(id);
    if (!f) continue;
    for (const kind of ["total", "spread"] as const) {
      const c = l.lean[kind];
      const r = c && gradeLean(l, kind, f);
      if (!c || !r) continue;
      const key = `${c.grade}|${kind}`;
      const t = out.get(key) ?? { grade: c.grade, kind, wins: 0, losses: 0, pushes: 0 };
      if (r === "win") t.wins++; else if (r === "loss") t.losses++; else t.pushes++;
      out.set(key, t);
    }
  }
  const order: Grade[] = ["sweet spot", "lean", "slight"];
  return [...out.values()].sort((a, b) => order.indexOf(a.grade) - order.indexOf(b.grade) || a.kind.localeCompare(b.kind));
}
export const tallyRate = (t: Tally) => rate(t.wins, t.losses);
