import type { DayLinks } from "../engine/links";
import type { DayFile, DayGrades, HandedPick } from "../engine/types";
import { hardRockUrl } from "../data/hardrock";
import { clear, h } from "./dom";
import { jersey } from "./jersey";
import { pct } from "./format";

export interface PicksSource {
  loadIndex(): Promise<{ dates: string[] }>;
  loadDay(date: string): Promise<DayFile>;
  loadGrades(date: string): Promise<DayGrades | null>;
  loadLinks?(date: string): Promise<DayLinks | null>;
}

const base = (): string => (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";

async function getJson<T>(path: string): Promise<T | null> {
  const res = await fetch(`${base()}data/${path}`, { cache: "no-store" });
  return res.ok ? ((await res.json()) as T) : null;
}

export const liveSource: PicksSource = {
  async loadIndex() {
    return (await getJson<{ dates: string[] }>("index.json")) ?? { dates: [] };
  },
  async loadDay(date) {
    const day = await getJson<DayFile>(`picks/${date}.json`);
    if (!day) throw new Error(`No picks file for ${date}`);
    return day;
  },
  loadGrades: (date) => getJson<DayGrades>(`grades/${date}.json`),
  loadLinks: (date) => getJson<DayLinks>(`links/${date}.json`),
};

const SPORT: Record<string, string> = { nba: "NBA", nfl: "NFL", nhl: "NHL", mlb: "MLB" };
const WHAT: Record<string, string> = {
  sog: "shots on goal", points: "points", goals: "goals", assists: "assists", rebounds: "rebounds", threes: "threes made",
  passYds: "passing yards", rushYds: "rushing yards", recYds: "receiving yards", receptions: "receptions", rushRecYds: "rushing + receiving yards",
  pr: "points + rebounds", pa: "points + assists", ra: "rebounds + assists", pra: "points + rebounds + assists",
};
const odds = (n: number): string => (n > 0 ? `+${n}` : String(n));

export function pickTitle(p: HandedPick): string {
  return `${p.player} · ${p.line + 0.5}+ ${WHAT[p.market] ?? p.market}`;
}

export function pickPrice(p: HandedPick): string {
  return p.price != null
    ? `Take it at ${odds(p.price)}${p.book ? ` on ${p.book}` : ""} or better`
    : `Take it at ${odds(p.limitOdds)} or better`;
}

/** Picks the user has chosen to send to Hard Rock together, by selection id. */
export interface Slip {
  has(sid: string): boolean;
  toggle(sid: string, label: string): void;
}

export const sidOf = (url: string): string => /betslip\/(\d+)/.exec(url)?.[1] ?? "";

function hardRock(link: DayLinks["picks"][string] | undefined, graded: boolean, label: string, slip?: Slip): HTMLElement | null {
  if (graded) return null;
  if (!link) return h("div", { class: "muted" }, "Not listed on Hard Rock right now");
  const sid = sidOf(link.url);
  const open = h("a", { class: "hr", href: link.url, target: "_blank", rel: "noopener" }, `Open in Hard Rock (${odds(link.american)})`);
  if (!slip || !sid) return open;
  const box = h("input", { type: "checkbox", checked: slip.has(sid), onchange: () => slip.toggle(sid, label) });
  return h("div", { class: "hr-row" }, h("label", { class: "add" }, box, " Add to slip"), open);
}

function card(p: HandedPick, grade: DayGrades["grades"][number] | undefined, links: DayLinks | null, slip?: Slip): HTMLElement {
  const badge = grade ? h("span", { class: `badge ${grade.outcome}` }, grade.outcome === "win" ? `Won (${grade.actual})` : grade.outcome === "loss" ? `Lost (${grade.actual})` : "Push") : h("span", { class: "badge open" }, "Open");
  return h(
    "article",
    { class: "pick" },
    h("div", { class: "pick-top" }, h("div", { class: "who" }, jersey(p.sport, p.team), h("strong", {}, pickTitle(p))), badge),
    h("div", { class: "muted" }, `${p.team} vs ${p.opponent}`),
    h("div", {}, pickPrice(p)),
    h("div", { class: "muted" }, `Our chance ${pct(p.modelProb, 0)}${p.edge != null ? ` · edge ${pct(p.edge, 1)}` : ""}`),
    links ? hardRock(links.picks[p.id], grade != null, pickTitle(p), slip) : null,
  );
}

export interface DayState {
  /** Slip picks by selection id, kept across refreshes of the same day. */
  chosen: Map<string, string>;
  /** Active tab: "multi" for every sport together, or one sport. */
  tab: string;
}

export function renderDay(view: HTMLElement, day: DayFile, grades: DayGrades | null, links: DayLinks | null = null, state: DayState = { chosen: new Map(), tab: "multi" }): void {
  const chosen = state.chosen;
  const bar = h("div", { class: "slipbar", hidden: true });
  const refresh = () => {
    clear(bar);
    bar.hidden = chosen.size === 0;
    if (chosen.size === 0) return;
    const url = hardRockUrl([...chosen.keys()]);
    bar.append(
      h("div", { class: "slip-title" }, `Your slip: ${chosen.size} ${chosen.size === 1 ? "pick" : "picks"}${chosen.size > 1 ? " (one ticket, all must win)" : ""}`),
      h("ul", {}, ...[...chosen.values()].map((l) => h("li", {}, l))),
      h("a", { class: "hr", href: url, target: "_blank", rel: "noopener" }, chosen.size > 1 ? `Send ${chosen.size}-leg ticket to Hard Rock` : "Send to Hard Rock"),
      h("button", { type: "button", class: "clear", onclick: () => { chosen.clear(); view.querySelectorAll<HTMLInputElement>(".add input").forEach((i) => (i.checked = false)); refresh(); } }, "Clear"),
    );
  };
  const slip: Slip = {
    has: (sid) => chosen.has(sid),
    toggle: (sid, label) => {
      if (chosen.has(sid)) chosen.delete(sid);
      else chosen.set(sid, label);
      refresh();
    },
  };
  view.append(bar);
  const sportList = [...new Set(day.picks.map((p) => p.sport))];
  const gradeById = new Map((grades?.grades ?? []).map((g) => [g.pickId, g]));
  const MULTI = "multi";
  const content = h("div", {});
  const tabs = h("div", { class: "chips", role: "tablist", "aria-label": "Sports" });
  const cardFor = (p: HandedPick, badge: boolean): HTMLElement => {
    const c = card(p, gradeById.get(p.id), links, slip);
    return badge ? h("div", { class: "multi-card" }, h("span", { class: "sport-badge" }, SPORT[p.sport] ?? p.sport.toUpperCase()), c) : c;
  };
  // One block of picks. In the multi-sport view it holds every sport's picks, the same ones the sport tabs show.
  const block = (mine: HandedPick[], title: string, badge: boolean): HTMLElement => {
    const section = h("section", { class: "sport" }, h("h2", {}, title));
    const ofKind = (k: string) => mine.filter((p) => p.kind === k);
    const mineIds = new Set(mine.map((p) => p.id));
    const groups: Array<[string, HandedPick[]]> = [["Play of the day", ofKind("potd")], ["Alt lines", ofKind("alt")], ["Other picks", ofKind("lean")]];
    for (const [name, list] of groups) if (list.length) section.append(h("h3", {}, name), ...list.map((p) => cardFor(p, badge)));
    for (const t of day.tickets.filter((t) => t.legIds.some((id) => mineIds.has(id)))) {
      const legs = t.legIds.map((id) => day.picks.find((p) => p.id === id)).filter((p): p is HandedPick => p != null);
      section.append(
        h("h3", {}, "+100 ticket"),
        h("div", { class: "ticket" }, ...legs.map((p) => cardFor(p, badge)), links?.tickets[t.id] ? h("a", { class: "hr", href: links.tickets[t.id]!, target: "_blank", rel: "noopener" }, "Open whole ticket in Hard Rock") : null,
        h("p", { class: "muted" }, `All legs must win. Chance ${pct(t.jointProb, 0)}${t.priced != null ? ` · pays about ${odds(t.priced)}` : ""}. ${t.note}`)),
      );
    }
    return section;
  };
  const draw = () => {
    clear(content);
    for (const t of tabs.children) t.setAttribute("aria-selected", String((t as HTMLElement).dataset.tab === state.tab));
    if (day.picks.length === 0) content.append(h("p", { class: "empty" }, "Nothing met the bar today, so there are no picks."));
    else if (state.tab === MULTI) content.append(block(day.picks, "Multi-sport", true));
    else content.append(block(day.picks.filter((p) => p.sport === state.tab), SPORT[state.tab] ?? state.tab.toUpperCase(), false));
  };
  if (!sportList.includes(state.tab as never)) state.tab = MULTI;
  if (sportList.length > 1) {
    for (const [id, label] of [[MULTI, "Multi-sport"], ...sportList.map((sp) => [sp, SPORT[sp] ?? sp.toUpperCase()])] as Array<[string, string]>) {
      tabs.append(h("button", { type: "button", role: "tab", class: "chip", "data-tab": id, onclick: () => { state.tab = id; draw(); } }, label));
    }
    view.append(tabs);
  } else if (sportList.length === 1) state.tab = sportList[0]!;
  view.append(content);
  draw();
  if (day.notes.length) view.append(h("details", { class: "notes" }, h("summary", {}, "Why some sports have no picks"), ...day.notes.map((n) => h("p", { class: "muted" }, n))));
}

export async function renderPicks(view: HTMLElement, _ledger?: unknown, source: PicksSource = liveSource): Promise<void> {
  clear(view);
  view.append(h("h2", {}, "Today's picks"));
  view.append(h("p", { class: "muted" }, "Picks are made automatically each afternoon from Linemate's lines and prices. Nothing is picked unless Linemate has the line. Every pick is saved before the game and graded after."));
  let dates: string[];
  try {
    dates = (await source.loadIndex()).dates;
  } catch {
    dates = [];
  }
  if (dates.length === 0) {
    view.append(h("p", { class: "empty" }, "No picks have been made yet. The first set appears after the next automatic run."));
    return;
  }
  const latest = dates[dates.length - 1]!;
  const body = h("div", {});
  let state: DayState = { chosen: new Map(), tab: "multi" };
  let shown = latest;
  const pickDate = async (date: string) => {
    if (date !== shown) state = { chosen: new Map(), tab: state.tab };
    shown = date;
    try {
      const [day, grades, links] = [await source.loadDay(date), await source.loadGrades(date), source.loadLinks ? await source.loadLinks(date).catch(() => null) : null];
      clear(body);
      renderDay(body, day, grades, links, state);
    } catch {
      clear(body);
      body.append(h("p", { class: "empty" }, `Could not load picks for ${date}.`));
    }
  };
  const select = h("select", { "aria-label": "Pick a day", onchange: () => void pickDate(select.value) }, ...[...dates].reverse().map((d) => h("option", { value: d }, d)));
  const status = h("span", { class: "muted", "aria-live": "polite" });
  const refresh = async () => {
    status.textContent = "Refreshing…";
    await pickDate(select.value);
    status.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  };
  view.append(h("label", {}, "Day ", select), " ", h("button", { type: "button", class: "refresh", onclick: () => void refresh() }, "Refresh"), " ", status, body);
  pullToRefresh(view, refresh);
  await pickDate(latest);
}

let pullOff: (() => void) | null = null;

/** Pull down from the top of the page to run `reload`. Replaces any earlier handler, and stops once the view leaves the page. */
export function pullToRefresh(view: HTMLElement, reload: () => Promise<void>, threshold = 80): void {
  pullOff?.();
  let startY: number | null = null;
  let busy = false;
  const start = (e: TouchEvent) => {
    startY = window.scrollY <= 0 && !busy ? (e.touches[0]?.clientY ?? null) : null;
  };
  const end = (e: TouchEvent) => {
    const y = e.changedTouches[0]?.clientY;
    const pulled = startY != null && y != null && y - startY >= threshold;
    startY = null;
    if (!pulled || !view.isConnected) return;
    busy = true;
    void reload().finally(() => (busy = false));
  };
  window.addEventListener("touchstart", start, { passive: true });
  window.addEventListener("touchend", end, { passive: true });
  pullOff = () => {
    window.removeEventListener("touchstart", start);
    window.removeEventListener("touchend", end);
  };
}
