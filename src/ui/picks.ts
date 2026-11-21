import type { DayLinks } from "../engine/links";
import type { DayFile, DayGrades, HandedPick } from "../engine/types";
import { hardRockUrl } from "../data/hardrock";
import { clear, h } from "./dom";
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
    h("div", { class: "pick-top" }, h("strong", {}, pickTitle(p)), badge),
    h("div", { class: "muted" }, `${p.team} vs ${p.opponent}`),
    h("div", {}, pickPrice(p)),
    h("div", { class: "muted" }, `Our chance ${pct(p.modelProb, 0)}${p.edge != null ? ` · edge ${pct(p.edge, 1)}` : ""}`),
    links ? hardRock(links.picks[p.id], grade != null, pickTitle(p), slip) : null,
  );
}

export function renderDay(view: HTMLElement, day: DayFile, grades: DayGrades | null, links: DayLinks | null = null): void {
  const chosen = new Map<string, string>();
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
  const gradeById = new Map((grades?.grades ?? []).map((g) => [g.pickId, g]));
  const sports = [...new Set(day.picks.map((p) => p.sport))];
  if (sports.length === 0) view.append(h("p", { class: "empty" }, "Nothing met the bar today, so there are no picks."));
  for (const sport of sports) {
    const mine = day.picks.filter((p) => p.sport === sport);
    const section = h("section", { class: "sport" }, h("h2", {}, SPORT[sport] ?? sport.toUpperCase()));
    const potd = mine.filter((p) => p.kind === "potd");
    const alts = mine.filter((p) => p.kind === "alt");
    const leans = mine.filter((p) => p.kind === "lean");
    const mineIds = new Set(mine.map((p) => p.id));
    const tickets = day.tickets.filter((t) => t.legIds.some((id) => mineIds.has(id)));
    if (potd.length) section.append(h("h3", {}, "Play of the day"), ...potd.map((p) => card(p, gradeById.get(p.id), links, slip)));
    if (alts.length) section.append(h("h3", {}, "Alt lines"), ...alts.map((p) => card(p, gradeById.get(p.id), links, slip)));
    if (leans.length) section.append(h("h3", {}, "Other picks"), ...leans.map((p) => card(p, gradeById.get(p.id), links, slip)));
    for (const t of tickets) {
      const legs = t.legIds.map((id) => mine.find((p) => p.id === id)).filter((p): p is HandedPick => p != null);
      section.append(
        h("h3", {}, "+100 ticket"),
        h("div", { class: "ticket" }, ...legs.map((p) => card(p, gradeById.get(p.id), links, slip)), links?.tickets[t.id] ? h("a", { class: "hr", href: links.tickets[t.id]!, target: "_blank", rel: "noopener" }, "Open whole ticket in Hard Rock") : null,
        h("p", { class: "muted" }, `All legs must win. Chance ${pct(t.jointProb, 0)}${t.priced != null ? ` · pays about ${odds(t.priced)}` : ""}. ${t.note}`)),
      );
    }
    view.append(section);
  }
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
  const pickDate = async (date: string) => {
    clear(body);
    try {
      renderDay(body, await source.loadDay(date), await source.loadGrades(date), source.loadLinks ? await source.loadLinks(date).catch(() => null) : null);
    } catch {
      body.append(h("p", { class: "empty" }, `Could not load picks for ${date}.`));
    }
  };
  const select = h("select", { "aria-label": "Pick a day", onchange: () => void pickDate(select.value) }, ...[...dates].reverse().map((d) => h("option", { value: d }, d)));
  view.append(h("label", {}, "Day ", select), body);
  await pickDate(latest);
}
