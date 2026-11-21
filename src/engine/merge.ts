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
