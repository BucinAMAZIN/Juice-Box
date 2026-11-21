import { americanToDecimal, decimalToAmerican } from "../core/odds";
import { hardRockUrl } from "../data/hardrock";
import type { DayFile, DayGrades, HandedPick } from "../engine/types";
import { clear, h } from "./dom";
import { activeCount, cushionOf, defaultFilters, gameKey, loadFilters, passes, saveFilters, type Filters } from "./filters";
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
  filters: Filters;
}

function signalLine(p: HandedPick): HTMLElement | null {
  const bits: string[] = [];
  if (p.h2h) bits.push(`vs ${p.opponent} ${p.h2h.hits}/${p.h2h.games}`);
  if (p.split) bits.push(`${p.home ? "home" : "away"} ${p.split.hits}/${p.split.games}`);
  const c = cushionOf(p);
  if (p.avg != null) bits.push(`avg ${p.avg}${c != null ? ` (${c >= 0 ? "+" : ""}${Math.round(c * 100)}%)` : ""}`);
  if (p.alt) bits.push("alt line");
  return bits.length ? h("div", { class: "signals" }, bits.join(" · ")) : null;
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
    h("div", { class: "s-main" }, h("strong", {}, propText(p)), h("div", { class: "muted" }, `${p.teamName ?? p.team} vs ${p.opponent} · ${SPORT[p.sport] ?? p.sport.toUpperCase()} · ${started ? "started" : startTime(p.gameStart)}`), signalLine(p)),
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
  const count = h("summary", {}, "Filters");
  const shownNote = h("span", { class: "muted" });
  const panel = h("details", { class: "filters" }, count);
  const group = <T extends string | number>(label: string, options: Array<[string, T]>, get: () => T, set: (v: T) => void): HTMLElement => {
    const box = h("div", { class: "fgroup", role: "group", "aria-label": label }, h("span", { class: "flabel" }, label));
    const btns = options.map(([text, value]) => h("button", { type: "button", class: "chip", "aria-pressed": String(get() === value), onclick: () => { set(value); saveFilters(state.filters); for (const [b, v] of pairs) b.setAttribute("aria-pressed", String(get() === v)); draw(); } }, text));
    const pairs = btns.map((b, i) => [b, options[i]![1]] as const);
    box.append(...btns);
    return box;
  };
  const f0 = state.filters;
  const markets = [...new Set(day.picks.map((p) => p.market))];
  const marketBox = h("div", { class: "fgroup", role: "group", "aria-label": "Bet type" }, h("span", { class: "flabel" }, "Bet type"));
  for (const m of markets) {
    const b = h("button", { type: "button", class: "chip", "aria-pressed": String(!f0.off.has(m)), onclick: () => {
      if (state.filters.off.has(m)) state.filters.off.delete(m); else state.filters.off.add(m);
      b.setAttribute("aria-pressed", String(!state.filters.off.has(m)));
      saveFilters(state.filters);
      draw();
    } }, MARKET_LABEL[m] ?? m);
    marketBox.append(b);
  }
  const games = [...new Map(day.picks.map((p) => [gameKey(p), `${p.opponent} @ ${p.team} ${startTime(p.gameStart)}`])).entries()];
  const gameSel = h("select", { "aria-label": "Game", onchange: () => { state.filters.game = gameSel.value; draw(); } }, h("option", { value: "all" }, "All games"), ...games.map(([k, label]) => h("option", { value: k }, label)));
  gameSel.value = f0.game;
  panel.append(
    marketBox,
    group("Line", [["All", "all"], ["Main", "main"], ["Alt", "alt"]] as Array<[string, Filters["line"]]>, () => state.filters.line, (v) => (state.filters.line = v)),
    group("Streak", [["Any", 0], ["7+", 7], ["10+", 10]] as Array<[string, number]>, () => state.filters.minStreak, (v) => (state.filters.minStreak = v)),
    group("Price", [["Any", 0], ["-200", -200], ["-300", -300], ["-400", -400]] as Array<[string, number]>, () => state.filters.maxJuice, (v) => (state.filters.maxJuice = v)),
    group("Head to head", [["Any", 0], ["75%+", 0.75], ["100%", 1]] as Array<[string, number]>, () => state.filters.h2h, (v) => (state.filters.h2h = v)),
    group("Home/away", [["Any", 0], ["75%+", 0.75], ["100%", 1]] as Array<[string, number]>, () => state.filters.split, (v) => (state.filters.split = v)),
    group("Cushion", [["Any", 0], ["+10%", 0.1], ["+25%", 0.25]] as Array<[string, number]>, () => state.filters.cushion, (v) => (state.filters.cushion = v)),
    h("div", { class: "fgroup" }, h("span", { class: "flabel" }, "Game"), gameSel),
    h("button", { type: "button", class: "ghost", onclick: () => { state.filters = defaultFilters(); saveFilters(state.filters); clear(view); renderStreakDay(view, day, state); } }, "Reset filters"),
  );
  const draw = () => {
    clear(content);
    for (const t of tabs.children) t.setAttribute("aria-selected", String((t as HTMLElement).dataset.tab === state.tab));
    const f = state.filters;
    const inTab = day.picks.filter((p) => state.tab === "multi" || p.sport === state.tab);
    const list = inTab.filter((p) => passes(p, f)).sort((a, b) => (b.streak ?? 0) - (a.streak ?? 0) || (b.price ?? 0) - (a.price ?? 0));
    count.textContent = activeCount(f) ? `Filters (${activeCount(f)})` : "Filters";
    shownNote.textContent = activeCount(f) ? `Showing ${list.length} of ${inTab.length}` : "";
    if (list.length === 0) content.append(h("p", { class: "empty" }, inTab.length ? "Nothing matches these filters." : "No streaks of 5+ with a Hard Rock price for this day yet."));
    for (const p of list) content.append(row(p, state, refreshBar));
  };
  if (sports.length > 1) {
    for (const [id, label] of [["multi", "Multi-sport"], ...sports.map((s) => [s, SPORT[s] ?? s.toUpperCase()])] as Array<[string, string]>) {
      tabs.append(h("button", { type: "button", role: "tab", class: "chip", "data-tab": id, onclick: () => { state.tab = id; draw(); } }, label));
    }
    view.append(tabs);
  }
  view.append(panel, shownNote, bar, content);
  draw();
  refreshBar();
}

export async function renderStreaks(view: HTMLElement, _ledger?: unknown, source: PicksSource = streakSource): Promise<void> {
  clear(view);
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
  let state: StreakState = { chosen: new Map(), tab: "multi", filters: loadFilters() };
  let shown = dates[dates.length - 1]!;
  const load = async (date: string) => {
    if (date !== shown) state = { chosen: new Map(), tab: state.tab, filters: state.filters };
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
  view.append(h("div", { class: "controls" }, select, h("button", { type: "button", class: "refresh", onclick: () => void refresh() }, "Refresh")), status, body);
  pullToRefresh(view, refresh);
  await load(shown);
}
