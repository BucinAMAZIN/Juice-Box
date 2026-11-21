import type { DayFile, DayGrades, HandedPick } from "../engine/types";
import { clear, h } from "./dom";
import type { PicksSource } from "./picks";
import { SPORT, odds, propText, streakSource } from "./streaks";

export interface DayResult {
  date: string;
  day: DayFile;
  grades: DayGrades | null;
}

/** Every saved day with its grades, newest first. A day that cannot be read is skipped. */
export async function loadHistory(source: PicksSource): Promise<DayResult[]> {
  const dates = (await source.loadIndex().catch(() => ({ dates: [] as string[] }))).dates;
  const out: DayResult[] = [];
  for (const date of [...dates].reverse()) {
    try {
      out.push({ date, day: await source.loadDay(date), grades: await source.loadGrades(date).catch(() => null) });
    } catch {
      /* skip */
    }
  }
  return out;
}

function row(p: HandedPick, outcome: string | undefined, actual: number | undefined): HTMLElement {
  const label = outcome === "win" ? `Won (${actual})` : outcome === "loss" ? `Lost (${actual})` : outcome === "push" ? `Push (${actual})` : "Open";
  return h(
    "article",
    { class: `pick ${outcome ?? "open"}` },
    h("div", { class: "pick-top" }, h("strong", {}, propText(p)), h("span", { class: `badge ${outcome ?? "open"}` }, label)),
    h("div", { class: "muted" }, `${p.teamName ?? p.team} vs ${p.opponent} · ${SPORT[p.sport] ?? p.sport.toUpperCase()} · ${p.streak ?? "?"} straight · ${p.price != null ? odds(p.price) : ""}`),
  );
}

export async function renderResults(root: HTMLElement, _ledger?: unknown, source: PicksSource = streakSource): Promise<void> {
  clear(root);
  root.append(h("h2", {}, "Results"));
  root.append(h("p", { class: "muted" }, "Every streak prop is saved before its game and graded automatically from the final box score, about 3 AM Eastern. Grades are never changed once written."));
  const history = await loadHistory(source);
  if (history.length === 0) {
    root.append(h("p", { class: "empty" }, "Nothing saved yet."));
    return;
  }
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  const sections: HTMLElement[] = [];
  for (const { date, day, grades } of history) {
    const byId = new Map((grades?.grades ?? []).map((g) => [g.pickId, g]));
    const w = [...byId.values()].filter((g) => g.outcome === "win").length;
    const l = [...byId.values()].filter((g) => g.outcome === "loss").length;
    wins += w;
    losses += l;
    pushes += [...byId.values()].filter((g) => g.outcome === "push").length;
    const open = day.picks.length - byId.size;
    sections.push(
      h(
        "section",
        { class: "day" },
        h("h3", {}, `${date} · ${byId.size ? `${w}-${l}` : "not graded yet"}${open > 0 && byId.size ? ` · ${open} open` : ""}`),
        ...[...day.picks].sort((a, b) => (b.streak ?? 0) - (a.streak ?? 0)).map((p) => row(p, byId.get(p.id)?.outcome, byId.get(p.id)?.actual)),
      ),
    );
  }
  root.append(h("div", { class: "card" }, h("strong", {}, `Record: ${wins}-${losses}${pushes ? `-${pushes}` : ""}`), h("div", { class: "muted" }, "All graded streak props so far. Breakdowns are on the Records tab.")), ...sections);
}
