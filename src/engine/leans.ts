import { type LineGame, type Rate, coverResult, rate, strength, totalResult } from "./lines";

/** How much the history backs a call. A sweet spot is a hand-checked pattern, a lean has a 95% range above 50%, and a slight lean is only a point estimate. */
export type Grade = "sweet spot" | "lean" | "slight";

export interface Call {
  side: "over" | "under" | "favorite" | "underdog";
  /** Share of similar finished games that landed on this side. */
  pct: number;
  n: number;
  grade: Grade;
  /** Win rate needed to break even on this call. */
  breakEven: number;
  note?: string;
}

export interface Lean {
  total: Call | null;
  /** The spread call, or the moneyline call for leagues that list a price instead of a spread. */
  spread: Call | null;
}

/** Patterns that held up when tested against the line history, season by season. */
export const SPOTS: Array<{ id: string; league: string; label: string; side: Call["side"]; test: (g: LineGame) => boolean }> = [
  { id: "ncaaf-over-40", league: "ncaaf", label: "Favorite by 40+, total 51 to 58", side: "over", test: (g) => g.spread >= 40 && g.total >= 51 && g.total <= 58 },
  { id: "nfl-under-bigfav", league: "nfl", label: "Favorite by 7.5 to 14, total 49 to 52", side: "under", test: (g) => g.spread >= 7.5 && g.spread <= 14 && g.total >= 49 && g.total <= 52 },
  { id: "nba-under-high", league: "nba", label: "Favorite by under 2.5, total 235+", side: "under", test: (g) => g.spread < 2.5 && g.total >= 235 },
];

const BE = 110 / 210;
const sd = (xs: number[]): number => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) || 1;
};


/** The share of the nearest finished games (by spread and total) that went each way. */
export function neighbors(g: LineGame, history: LineGame[], k = 300): LineGame[] {
  const done = history.filter((x) => x.favScore != null && x.id !== g.id);
  if (done.length === 0) return [];
  const ss = sd(done.map(strength));
  const st = sd(done.map((x) => x.total));
  const dist = (x: LineGame): number => ((strength(x) - strength(g)) / ss) ** 2 + ((x.total - g.total) / st) ** 2;
  const size = Math.min(done.length, Math.max(60, Math.min(k, Math.round(done.length / 10))));
  return done.map((x) => [dist(x), x] as const).sort((a, b) => a[0] - b[0]).slice(0, size).map((p) => p[1]);
}

const call = (side: Call["side"], r: Rate, flip: boolean, breakEven: number, note?: string): Call => {
  const p = r.pct!;
  const mine = flip ? 1 - p : p;
  const lo = flip ? 1 - r.hi! : r.lo!;
  return { side, pct: mine, n: r.n, grade: lo > 0.5 ? "lean" : "slight", breakEven, ...(note ? { note } : {}) };
};

/** A lean on the total and on the spread (or moneyline) for one game, from the games most like it. */
export function leanFor(g: LineGame, history: LineGame[], league: string, ml: boolean): Lean {
  const near = neighbors(g, history);
  const out: Lean = { total: null, spread: null };
  if (near.length >= 30) {
    const over = rate(near.filter((x) => totalResult(x) === "over").length, near.filter((x) => totalResult(x) === "under").length);
    if (over.n >= 30) out.total = over.pct! >= 0.5 ? call("over", over, false, BE) : call("under", over, true, BE);
    if (ml) {
      const win = rate(near.filter((x) => x.favScore! > x.dogScore!).length, near.filter((x) => x.favScore! < x.dogScore!).length);
      if (win.n >= 30) {
        const implied = (g.ml ?? 150) / ((g.ml ?? 150) + 100);
        out.spread = win.pct! >= implied ? call("favorite", win, false, implied, "moneyline") : call("underdog", win, true, 1 - implied, "moneyline");
      }
    } else {
      const cover = rate(near.filter((x) => coverResult(x) === "cover").length, near.filter((x) => coverResult(x) === "miss").length);
      if (cover.n >= 30) out.spread = cover.pct! >= 0.5 ? call("favorite", cover, false, BE) : call("underdog", cover, true, BE);
    }
  }
  const spot = SPOTS.find((s) => s.league === league && s.test(g));
  if (spot) {
    const rows = history.filter((x) => x.favScore != null && spot.test(x));
    const r = rate(rows.filter((x) => totalResult(x) === spot.side).length, rows.filter((x) => totalResult(x) === (spot.side === "over" ? "under" : "over")).length);
    if (r.n > 0) out.total = { side: spot.side, pct: r.pct!, n: r.n, grade: "sweet spot", breakEven: BE, note: spot.label };
  }
  return out;
}

export const callText = (c: Call, g: LineGame, kind: "total" | "spread"): string => {
  if (kind === "total") return `${c.side === "over" ? "Over" : "Under"} ${g.total}`;
  if (c.note === "moneyline") return c.side === "favorite" ? `${g.fav} to win` : `${g.dog} to win`;
  const pts = g.spread;
  return c.side === "favorite" ? `${g.fav} ${pts > 0 ? `-${pts}` : "pick'em"}` : `${g.dog} ${pts > 0 ? `+${pts}` : "pick'em"}`;
};
