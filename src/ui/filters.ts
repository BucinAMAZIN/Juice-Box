import type { HandedPick } from "../engine/types";

/** Filters for the streak list, modeled on Linemate's: bet type, line type, game, and signals. */
export interface Filters {
  /** Markets switched off. */
  off: Set<string>;
  line: "all" | "main" | "alt";
  game: "all" | string;
  minStreak: number;
  /** Longest price allowed, as a negative number such as -300. 0 means any. */
  maxJuice: number;
  /** Minimum head-to-head hit rate (0 to 1). */
  h2h: number;
  /** Minimum home or away split hit rate for today's venue (0 to 1). */
  split: number;
  /** Minimum share the streak average sits above the line (0.1 = 10%). */
  cushion: number;
  /** Only props Hard Rock lists. */
  hrOnly: boolean;
}

export const defaultFilters = (): Filters => ({ off: new Set(), line: "all", game: "all", minStreak: 0, maxJuice: 0, h2h: 0, split: 0, cushion: 0, hrOnly: false });

const rate = (r?: { games: number; hits: number }): number | null => (r && r.games > 0 ? r.hits / r.games : null);
/** How far the average over the streak sits above the bet line, as a share of the line. */
export const cushionOf = (p: HandedPick): number | null => (p.avg != null && p.line + 0.5 > 0 ? p.avg / (p.line + 0.5) - 1 : null);
export const gameKey = (p: HandedPick): string => `${p.sport}:${p.gameId}`;

export function passes(p: HandedPick, f: Filters): boolean {
  if (f.off.has(p.market)) return false;
  if (f.hrOnly && !p.url) return false;
  if (f.line === "main" && p.alt === true) return false;
  if (f.line === "alt" && p.alt !== true) return false;
  if (f.game !== "all" && gameKey(p) !== f.game) return false;
  if ((p.streak ?? 0) < f.minStreak) return false;
  if (f.maxJuice !== 0 && (p.price ?? 0) < f.maxJuice) return false;
  if (f.h2h > 0) {
    const r = rate(p.h2h);
    if (r == null || r < f.h2h) return false;
  }
  if (f.split > 0) {
    const r = rate(p.split);
    if (r == null || r < f.split) return false;
  }
  if (f.cushion > 0) {
    const c = cushionOf(p);
    if (c == null || c < f.cushion) return false;
  }
  return true;
}

export function activeCount(f: Filters): number {
  return f.off.size + (f.line !== "all" ? 1 : 0) + (f.game !== "all" ? 1 : 0) + (f.minStreak ? 1 : 0) + (f.maxJuice ? 1 : 0) + (f.h2h ? 1 : 0) + (f.split ? 1 : 0) + (f.cushion ? 1 : 0) + (f.hrOnly ? 1 : 0);
}

export function loadFilters(): Filters {
  const f = defaultFilters();
  try {
    const raw = JSON.parse(localStorage.getItem("jb-filters") ?? "null") as (Partial<Omit<Filters, "off">> & { off?: string[] }) | null;
    if (raw) {
      f.off = new Set(raw.off ?? []);
      if (raw.line === "main" || raw.line === "alt") f.line = raw.line;
      if (raw.hrOnly === true) f.hrOnly = true;
      for (const k of ["minStreak", "maxJuice", "h2h", "split", "cushion"] as const) if (typeof raw[k] === "number") f[k] = raw[k]!;
    }
  } catch {
    /* storage unavailable: defaults */
  }
  return f;
}

export function saveFilters(f: Filters): void {
  try {
    localStorage.setItem("jb-filters", JSON.stringify({ ...f, off: [...f.off], game: "all" }));
  } catch {
    /* ignore */
  }
}
