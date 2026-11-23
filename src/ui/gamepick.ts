import { canonTeam } from "../engine/teamtrends";
import { clear, h } from "./dom";

/** Games the person ticked. Empty means every game. One set shared by Streaks and Lines, so a pick in one shows in the other. */
const selection = new Set<string>();

/** One game under one name in both tabs: the sport plus the two teams, spelled the same way. Props and lines use different team codes. */
export const matchKey = (sport: string, a: string, b: string): string => `${sport}:${[canonTeam(sport, a), canonTeam(sport, b)].sort().join("-")}`;

export const gameSelected = (key: string): boolean => selection.size === 0 || selection.has(key);
export const selectedCount = (): number => selection.size;
export const clearGames = (): void => selection.clear();

const startTime = (iso: string): string => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
export const gameLabel = (away: string, home: string, start: string): string => `${away} @ ${home} ${startTime(start)}`;

const summaryText = (options: Array<[string, string]>): string => {
  const picked = options.filter(([k]) => selection.has(k));
  return picked.length === 0 ? "All games" : picked.length === 1 ? picked[0]![1] : `${picked.length} games`;
};

/** A list of games with a checkbox each. Nothing ticked shows everything. */
export function gamePicker(options: Array<[string, string]>, onChange: () => void): HTMLElement {
  const box = h("details", { class: "gamepick" });
  const summary = h("summary", {});
  const list = h("div", { class: "gp-list" });
  const sync = () => {
    summary.textContent = summaryText(options);
    for (const input of list.querySelectorAll("input")) (input as HTMLInputElement).checked = input.dataset.k === "all" ? selection.size === 0 : selection.has(input.dataset.k!);
  };
  const row = (key: string, label: string) =>
    h("label", { class: "gp-row" }, h("input", { type: "checkbox", "data-k": key, onchange: (e: Event) => {
      const on = (e.target as HTMLInputElement).checked;
      if (key === "all") selection.clear();
      else if (on) selection.add(key);
      else selection.delete(key);
      sync();
      onChange();
    } }), h("span", {}, label));
  clear(list);
  list.append(row("all", "All games"), ...options.map(([k, label]) => row(k, label)));
  box.append(summary, list);
  sync();
  return box;
}
