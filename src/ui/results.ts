import type { DayFile, DayGrades, HandedPick } from "../engine/types";
import { clear, h } from "./dom";
import { liveSource, pickTitle, type PicksSource } from "./picks";

const SPORT: Record<string, string> = { nba: "NBA", nfl: "NFL", nhl: "NHL", mlb: "MLB" };
const odds = (n: number): string => (n > 0 ? `+${n}` : String(n));

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
  const price = p.price != null ? ` · ${odds(p.price)}${p.book ? ` ${p.book}` : ""}` : "";
  return h(
    "article",
    { class: `pick ${outcome ?? "open"}` },
    h("div", { class: "pick-top" }, h("strong", {}, pickTitle(p)), h("span", { class: `badge ${outcome ?? "open"}` }, label)),
    h("div", { class: "muted" }, `${SPORT[p.sport] ?? p.sport.toUpperCase()} · ${p.team} vs ${p.opponent} · ${p.kind === "potd" ? "Play of the day" : p.kind === "alt" ? "Alt line" : p.kind === "ticket" ? "Ticket leg" : "Pick"}${price}`),
  );
}

export async function renderResults(root: HTMLElement, _ledger?: unknown, source: PicksSource = liveSource): Promise<void> {
  clear(root);
  root.append(h("h2", {}, "Results"));
  root.append(h("p", { class: "muted" }, "Every pick is graded automatically from the final box score, about 3 AM Eastern. Grades are never changed once written."));
  const history = await loadHistory(source);
  if (history.length === 0) {
    root.append(h("p", { class: "empty" }, "No picks have been made yet."));
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
        ...day.picks.map((p) => row(p, byId.get(p.id)?.outcome, byId.get(p.id)?.actual)),
      ),
    );
  }
  root.append(h("div", { class: "card" }, h("strong", {}, `Record: ${wins}-${losses}${pushes ? `-${pushes}` : ""}`), h("div", { class: "muted" }, "All graded picks so far. More detail is on the Stats tab.")), ...sections);
}
