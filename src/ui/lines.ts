import { LEAGUES } from "../data/leagues";
import { type Cell, type LineGame, type LineRow, cellFor, coverRate, fromRow, overRate, slice, totalResult, coverResult } from "../engine/lines";
import { clear, h } from "./dom";
import { pct } from "./format";
import { getJson } from "./picks";

export interface LinesSource {
  history(league: string): Promise<LineRow[] | null>;
  tracked(league: string): Promise<LineGame[] | null>;
}

export const linesSource: LinesSource = {
  async history(league) {
    return (await getJson<{ rows: LineRow[] }>(`lines/${league}/history.json`))?.rows ?? null;
  },
  async tracked(league) {
    return (await getJson<{ games: LineGame[] }>(`lines/${league}/tracked.json`))?.games ?? null;
  },
};

const rateText = (r: { n: number; pct: number | null }): string => (r.pct == null ? "none yet" : `${pct(r.pct, 0)} (n=${r.n})`);
const when = (iso: string): string => new Date(iso).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
const PICK_TEXT: Record<NonNullable<Cell["pick"]>, string> = { over: "over", under: "under", favorite: "favorite covers", underdog: "underdog covers" };

function cellLine(c: Cell): HTMLElement {
  const rate = c.pick === "over" || c.pick === "under" ? c.over : c.cover;
  return h("div", { class: "streak" }, h("div", { class: "s-main" }, h("strong", {}, c.label), h("div", { class: "signals" }, `${c.pick ? PICK_TEXT[c.pick] : "no clear lean"}: ${rate.pct == null ? "–" : pct(rate.pct, 0)} of ${rate.n} games (range ${pct(rate.lo ?? 0, 0)} to ${pct(rate.hi ?? 0, 0)}) · over ${rateText(c.over)} · favorite covers ${rateText(c.cover)}`)));
}

export function renderLeague(box: HTMLElement, id: string, all: LineGame[], tracked: LineGame[]): void {
  clear(box);
  const label = LEAGUES.find((l) => l.id === id)?.label ?? id.toUpperCase();
  const done = all.filter((g) => g.favScore != null);
  if (done.length === 0 && tracked.length === 0) {
    box.append(h("p", { class: "empty" }, `No ${label} lines yet. History loads from the next backfill, and games are tracked once the season is on.`));
    return;
  }
  const s = slice(all);
  const totals = done.map((g) => g.total);
  const avg = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
  box.append(h("p", { class: "note" }, `${label}: ${done.length} games with lines. Over ${rateText(overRate(done))}, favorite covers ${rateText(coverRate(done))}, average total ${avg.toFixed(1)}.`));

  const upcoming = tracked.filter((g) => g.status !== "post").sort((a, b) => a.start.localeCompare(b.start));
  const sec = h("section", {}, h("h3", {}, `On the board (${upcoming.length})`));
  if (upcoming.length === 0) sec.append(h("p", { class: "empty" }, "No games with a line on the board right now."));
  for (const g of upcoming) {
    const c = cellFor(g, s);
    const flag = c?.pick ? ` · sweet spot: ${PICK_TEXT[c.pick]}` : "";
    sec.append(h("div", { class: "streak" }, h("div", { class: "s-main" }, h("strong", {}, `${g.fav} ${g.spread > 0 ? `-${g.spread}` : "pick'em"} vs ${g.dog}`), h("div", { class: "signals" }, `${when(g.start)} · total ${g.total}${g.favWin != null && g.dogWin != null ? ` · records ${pct(g.favWin, 0)} vs ${pct(g.dogWin, 0)}` : ""}${flag}`))));
  }
  box.append(sec);

  const spots = s.cells.filter((c) => c.pick).sort((a, b) => b.edge - a.edge);
  const spotSec = h("section", {}, h("h3", {}, `Sweet spots (${spots.length})`));
  if (spots.length === 0) spotSec.append(h("p", { class: "empty" }, "No slice is far enough from 50% with a big enough sample to call."));
  for (const c of spots) spotSec.append(cellLine(c));
  spotSec.append(h("p", { class: "note" }, "A slice only counts with 30+ games and a 95% range that sits fully on one side of 50%. With nine slices and four rates each, one or two will look special by luck, so the tracked record below is the real test."));
  box.append(spotSec);

  const finals = tracked.filter((g) => g.status === "post");
  const flagged = finals.filter((g) => cellFor(g, s)?.pick);
  const hit = flagged.filter((g) => {
    const p = cellFor(g, s)!.pick!;
    return (p === "over" && totalResult(g) === "over") || (p === "under" && totalResult(g) === "under") || (p === "favorite" && coverResult(g) === "cover") || (p === "underdog" && coverResult(g) === "miss");
  }).length;
  const decided = flagged.filter((g) => { const p = cellFor(g, s)!.pick!; return p === "over" || p === "under" ? totalResult(g) !== "push" : coverResult(g) !== "push" && coverResult(g) != null; }).length;
  box.append(h("section", {}, h("h3", {}, "Tracked going forward"), h("p", { class: "note" }, finals.length === 0 ? "No tracked games have finished yet." : `${finals.length} finished since tracking started. Sweet-spot games: ${decided ? `${hit} of ${decided} landed on the lean (${pct(hit / decided, 0)})` : "none yet"}. Over ${rateText(overRate(finals))}, favorite covers ${rateText(coverRate(finals))}.`)));

  const rows = s.cells.map((c) => h("tr", {}, h("th", { scope: "row" }, c.label), h("td", {}, String(c.games.length)), h("td", {}, c.over.pct == null ? "–" : pct(c.over.pct, 0)), h("td", {}, c.cover.pct == null ? "–" : pct(c.cover.pct, 0))));
  box.append(h("section", { class: "records" }, h("h3", {}, "Every slice"), h("div", { class: "scroll" }, h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, ""), h("th", {}, "Games"), h("th", {}, "Over"), h("th", {}, "Fav covers"))), h("tbody", {}, ...rows)))));
}

export async function renderLines(view: HTMLElement, _ledger?: unknown, source: LinesSource = linesSource): Promise<void> {
  clear(view);
  const chips = h("div", { class: "chips", role: "tablist", "aria-label": "Leagues" });
  const body = h("div", {});
  let current = LEAGUES[0]!.id;
  const show = async (id: string) => {
    current = id;
    for (const b of chips.children) b.setAttribute("aria-selected", String((b as HTMLElement).dataset.tab === id));
    clear(body);
    body.append(h("p", { class: "empty" }, "Loading…"));
    const [hist, tracked] = await Promise.all([source.history(id).catch(() => null), source.tracked(id).catch(() => null)]);
    if (current !== id) return;
    const trackedGames = tracked ?? [];
    const seen = new Set(trackedGames.filter((g) => g.status === "post").map((g) => g.id));
    const all = [...(hist ?? []).filter((r) => !seen.has(r[0])).map(fromRow), ...trackedGames.filter((g) => g.status === "post")];
    renderLeague(body, id, all, trackedGames);
  };
  for (const l of LEAGUES) chips.append(h("button", { type: "button", role: "tab", class: "chip", "data-tab": l.id, onclick: () => void show(l.id) }, l.label));
  view.append(h("p", { class: "note" }, "Every game with a spread and total, tracked to the final score, to find where the over and the favorite pay."), chips, body);
  await show(current);
}
