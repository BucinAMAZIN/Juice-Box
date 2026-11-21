import type { DayFile } from "./types";

/** Combine per-sport day files into one. Pick and ticket ids are already distinct per sport. */
export function mergeDays(days: DayFile[]): DayFile {
  const first = days[0]!;
  return {
    date: first.date,
    generatedAt: first.generatedAt,
    modelVersion: days.map((d) => d.modelVersion).join("+"),
    picks: days.flatMap((d) => d.picks),
    tickets: days.flatMap((d) => d.tickets),
    notes: days.flatMap((d) => d.notes),
  };
}

/** Add only new picks to a day that already exists. The saved picks are never changed or removed. */
export function appendNew(existing: DayFile, fresh: DayFile): { day: DayFile; added: number } {
  const seen = new Set(existing.picks.map((p) => `${p.gameId}|${p.player}|${p.market}|${p.line}`));
  const hasPotd = new Set(existing.picks.filter((p) => p.kind === "potd").map((p) => p.sport));
  const run = existing.picks.length + 1;
  const added = fresh.picks
    .filter((p) => p.kind !== "ticket" && !seen.has(`${p.gameId}|${p.player}|${p.market}|${p.line}`) && !(p.kind === "potd" && hasPotd.has(p.sport)))
    .map((p) => ({ ...p, id: `${p.id}-r${run}` }));
  return { day: { ...existing, picks: [...existing.picks, ...added] }, added: added.length };
}
