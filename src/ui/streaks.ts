import { americanToDecimal, decimalToAmerican } from "../core/odds";
import { hardRockUrl } from "../data/hardrock";
import type { DayFile, DayGrades, HandedPick } from "../engine/types";
import { clear, h } from "./dom";
import { getJson, pullToRefresh, type PicksSource } from "./picks";


/** Streak lists and their grades, written by the scheduled runs. */
export const streakSource: PicksSource = {
  async loadIndex() {
    return (await getJson<{ dates: string[] }>("streaks/index.json")) ?? { dates: [] };
  },
  async loadDay(date) {
    const day = await getJson<DayFile>(`streaks/${date}.json`);
    if (!day) throw new Error(`No streaks for ${date}`);
    return day;
  },
  loadGrades: (date) => getJson<DayGrades>(`streak-grades/${date}.json`),
};

export const SPORT: Record<string, string> = { nba: "NBA", nfl: "NFL", nhl: "NHL", mlb: "MLB" };
export const MARKET_LABEL: Record<string, string> = {
  points: "Points", rebounds: "Rebounds", assists: "Assists", threes: "Three Pointers", pr: "Points + Rebounds", pa: "Points + Assists", ra: "Rebounds + Assists", pra: "Points + Rebounds + Assists",
  passYds: "Passing Yards", rushYds: "Rushing Yards", recYds: "Receiving Yards", receptions: "Receptions", rushRecYds: "Rush + Rec Yards", sog: "Shots on Goal", goals: "Goals",
};
export const odds = (n: number): string => (n > 0 ? `+${n}` : String(n));
export const propText = (p: HandedPick): string => `${p.player} ${p.line + 0.5}+ ${MARKET_LABEL[p.market] ?? p.market}`;

const startTime = (iso: string): string => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export interface StreakState {
  chosen: Map<string, { label: string; price: number }>;
  tab: string;
}

function row(p: HandedPick, state: StreakState, refresh: () => void): HTMLElement {
  const started = Date.parse(p.gameStart) <= Date.now();
  const sid = p.sid ?? "";
  const pick = h("div", { class: "s-pick" });
  if (sid && !started) {
    const box = h("input", { type: "checkbox", checked: state.chosen.has(sid), "aria-label": `Add ${propText(p)} to slip`, onchange: () => {
      if (state.chosen.has(sid)) state.chosen.delete(sid);
      else state.chosen.set(sid, { label: propText(p), price: p.price ?? -110 });
      refresh();
    } });
    pick.append(h("label", { class: "add" }, box));
  }
  return h(
    "article",
    { class: "streak" },
    pick,
    h("div", { class: "s-main" }, h("strong", {}, propText(p)), h("div", { class: "muted" }, `${p.teamName ?? p.team} vs ${p.opponent} · ${SPORT[p.sport] ?? p.sport.toUpperCase()} · ${started ? "started" : startTime(p.gameStart)}`)),
    h("div", { class: "s-streak", title: "Straight games over this line" }, h("span", {}, String(p.streak ?? "")), h("small", {}, "streak")),
    p.url && !started ? h("a", { class: "hr s-odds", href: p.url, target: "_blank", rel: "noopener" }, odds(p.price ?? 0)) : h("span", { class: "s-odds off" }, p.price != null ? odds(p.price) : "–"),
  );
}

export function renderStreakDay(view: HTMLElement, day: DayFile, state: StreakState): void {
  const bar = h("div", { class: "slipbar", hidden: true });
  const content = h("div", {});
  const tabs = h("div", { class: "chips", role: "tablist", "aria-label": "Sports" });
  const sports = [...new Set(day.picks.map((p) => p.sport))];
  if (!["multi", ...sports].includes(state.tab)) state.tab = "multi";
  const refreshBar = () => {
    clear(bar);
    bar.hidden = state.chosen.size === 0;
    if (state.chosen.size === 0) return;
    const legs = [...state.chosen.entries()];
    const pays = decimalToAmerican(legs.reduce((d, [, l]) => d * americanToDecimal(l.price), 1));
    bar.append(
      h("div", { class: "slip-title" }, `Your slip: ${legs.length} ${legs.length === 1 ? "prop" : "props"}${legs.length > 1 ? ` · all must win · pays about ${odds(pays)}` : ""}`),
      h("ul", {}, ...legs.map(([, l]) => h("li", {}, l.label))),
      h("a", { class: "hr", href: hardRockUrl(legs.map(([sid]) => sid)), target: "_blank", rel: "noopener" }, legs.length > 1 ? `Send ${legs.length}-leg ticket to Hard Rock` : "Send to Hard Rock"),
      h("button", { type: "button", class: "clear", onclick: () => { state.chosen.clear(); draw(); refreshBar(); } }, "Clear"),
    );
  };
  const draw = () => {
    clear(content);
    for (const t of tabs.children) t.setAttribute("aria-selected", String((t as HTMLElement).dataset.tab === state.tab));
    const list = day.picks.filter((p) => state.tab === "multi" || p.sport === state.tab).sort((a, b) => (b.streak ?? 0) - (a.streak ?? 0) || (b.price ?? 0) - (a.price ?? 0));
    if (list.length === 0) content.append(h("p", { class: "empty" }, "No streaks of 5+ with a Hard Rock price for this day yet."));
    for (const p of list) content.append(row(p, state, refreshBar));
  };
  if (sports.length > 1) {
    for (const [id, label] of [["multi", "Multi-sport"], ...sports.map((s) => [s, SPORT[s] ?? s.toUpperCase()])] as Array<[string, string]>) {
      tabs.append(h("button", { type: "button", role: "tab", class: "chip", "data-tab": id, onclick: () => { state.tab = id; draw(); } }, label));
    }
    view.append(tabs);
  }
  view.append(bar, content);
  draw();
  refreshBar();
}

export async function renderStreaks(view: HTMLElement, _ledger?: unknown, source: PicksSource = streakSource): Promise<void> {
  clear(view);
  view.append(h("h2", {}, "Streaks"));
  view.append(h("p", { class: "muted" }, "Props that have gone over their line five or more straight games, with the Hard Rock price. Tick the ones you like and send them to Hard Rock as one ticket."));
  let dates: string[];
  try {
    dates = (await source.loadIndex()).dates;
  } catch {
    dates = [];
  }
  if (dates.length === 0) {
    view.append(h("p", { class: "empty" }, "No streaks yet. The first list appears after the next automatic run."));
    return;
  }
  const body = h("div", {});
  let state: StreakState = { chosen: new Map(), tab: "multi" };
  let shown = dates[dates.length - 1]!;
  const load = async (date: string) => {
    if (date !== shown) state = { chosen: new Map(), tab: state.tab };
    shown = date;
    try {
      const day = await source.loadDay(date);
      clear(body);
      renderStreakDay(body, day, state);
    } catch {
      clear(body);
      body.append(h("p", { class: "empty" }, `Could not load streaks for ${date}.`));
    }
  };
  const select = h("select", { "aria-label": "Pick a day", onchange: () => void load(select.value) }, ...[...dates].reverse().map((d) => h("option", { value: d }, d)));
  const status = h("span", { class: "muted", "aria-live": "polite" });
  const refresh = async () => {
    status.textContent = "Refreshing…";
    await load(select.value);
    status.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  };
  view.append(h("label", {}, "Day ", select), " ", h("button", { type: "button", class: "refresh", onclick: () => void refresh() }, "Refresh"), " ", status, body);
  pullToRefresh(view, refresh);
  await load(shown);
}
