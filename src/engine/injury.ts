/** What a listed injury means for a prop on that player. */
export interface Injury {
  /** The feed's wording: Out, Questionable, Day-To-Day, ... */
  status: string;
  /** Why, in a few words: "Knee", "Illness". Empty when the feed gives none. */
  reason: string;
}

export type InjuryLevel = "out" | "flag" | null;

/** Out for sure, worth a "!", or nothing to show (probable and the like). */
export function injuryLevel(status: string): InjuryLevel {
  const s = status.trim().toLowerCase();
  if (/^(out|injured reserve|ir|suspended|suspension|inactive)/.test(s) || s.includes("out for season")) return "out";
  if (/(doubtful|questionable|day.?to.?day)/.test(s)) return "flag";
  return null;
}

/** The tag text for a row: "OUT · Knee" or "! Questionable · Illness". */
export function injuryText(i: Injury): string {
  const lvl = injuryLevel(i.status);
  if (!lvl) return "";
  const why = i.reason ? ` · ${i.reason}` : "";
  return lvl === "out" ? `OUT${why}` : `! ${i.status}${why}`;
}
