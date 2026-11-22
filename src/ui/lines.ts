import { LEAGUES } from "../data/leagues";
import { BREAK_EVEN, RULES, RULES_START, ruleRate } from "../engine/rules";
import { type Cell, type LineGame, type LineRow, cellFor, coverRate, coverResult, fromRow, overRate, slice, totalResult, winRate, withMoneyline } from "../engine/lines";
import { type LoggedLean, tallyLeans, tallyRate } from "../engine/leanlog";
import { type Call, callText, leanFor } from "../engine/leans";
import { clear, h } from "./dom";
import { pct } from "./format";
import { getJson } from "./picks";

export interface LinesSource {
  history(league: string): Promise<LineRow[] | null>;
  tracked(league: string): Promise<LineGame[] | null>;
  leans?(): Promise<Record<string, LoggedLean> | null>;
}

export const linesSource: LinesSource = {
  async history(league) {
    return (await getJson<{ rows: LineRow[] }>(`lines/${league}/history.json`))?.rows ?? null;
  },
  async tracked(league) {
    return (await getJson<{ games: LineGame[] }>(`lines/${league}/tracked.json`))?.games ?? null;
  },
  async leans() {
    return (await getJson<{ leans: Record<string, LoggedLean> }>("lines/leans.json"))?.leans ?? null;
  },
};

const rateText = (r: { n: number; pct: number | null }): string => (r.pct == null ? "none yet" : `${pct(r.pct, 0)} (n=${r.n})`);
const when = (iso: string): string => new Date(iso).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
const GRADE_TEXT: Record<Call["grade"], string> = { "sweet spot": "sweet spot", lean: "lean", slight: "slight lean" };
export const leanLine = (c: Call | null, g: LineGame, kind: "total" | "spread"): string =>
  c == null ? `${kind === "total" ? "Total" : "Spread"}: not enough similar games` : `${kind === "total" ? "Total" : c.note === "moneyline" ? "Moneyline" : "Spread"}: ${callText(c, g, kind)} · ${GRADE_TEXT[c.grade]} · ${pct(c.pct, 0)} of ${c.n} ${c.note && c.note !== "moneyline" ? `games (${c.note})` : "similar games"} (break-even ${pct(c.breakEven, 0)})`;
const PICK_TEXT: Record<NonNullable<Cell["pick"]>, string> = { over: "over", under: "under", favorite: "favorite covers", underdog: "underdog covers" };

function cellLine(c: Cell, ml: boolean): HTMLElement {
  const base = c.pick === "over" || c.pick === "under" ? c.over : c.cover;
  const flip = c.pick === "under" || c.pick === "underdog";
  const p = base.pct == null ? null : flip ? 1 - base.pct : base.pct;
  const lo = flip ? 1 - (base.hi ?? 0) : base.lo ?? 0;
  const hi = flip ? 1 - (base.lo ?? 0) : base.hi ?? 0;
  return h("div", { class: "streak" }, h("div", { class: "s-main" }, h("strong", {}, c.label), h("div", { class: "signals" }, `${c.pick ? PICK_TEXT[c.pick] : "no clear lean"}: ${p == null ? "–" : pct(p, 0)} of ${base.n} games (range ${pct(lo, 0)} to ${pct(hi, 0)}) · over ${rateText(c.over)} · ${ml ? `favorite wins ${rateText(c.win)}` : `favorite covers ${rateText(c.cover)}`}`)));
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
  if (s.ml) box.append(h("p", { class: "note" }, `${label} lists moneylines, so favorite strength is the price. Only the over and under are flagged, because the favorite's -1.5 line is priced at plus money and has no 50% baseline.`));
  box.append(h("p", { class: "note" }, `${label}: ${done.length} games with lines. Over ${rateText(overRate(done))}, ${s.ml ? `favorite wins ${rateText(winRate(done))}` : `favorite covers ${rateText(coverRate(done))}`}, average total ${avg.toFixed(1)}.`));

  const upcoming = tracked.filter((g) => g.status !== "post").sort((a, b) => a.start.localeCompare(b.start));
  const sec = h("section", {}, h("h3", {}, `On the board (${upcoming.length})`));
  if (upcoming.length === 0) sec.append(h("p", { class: "empty" }, "No games with a line on the board right now."));
  for (const g of upcoming) {
    const c = cellFor(g, s);
    const flag = c?.pick ? ` · sweet spot: ${PICK_TEXT[c.pick]}` : "";
    const lean = leanFor(g, all, id, s.ml);
    sec.append(h("div", { class: "streak" }, h("div", { class: "s-main" }, h("strong", {}, `${g.fav} ${g.ml != null ? `-${g.ml}` : g.spread > 0 ? `-${g.spread}` : "pick'em"} vs ${g.dog}`), h("div", { class: "signals" }, `${when(g.start)} · total ${g.total}${g.favWin != null && g.dogWin != null ? ` · records ${pct(g.favWin, 0)} vs ${pct(g.dogWin, 0)}` : ""}${flag}`), h("div", { class: "signals" }, leanLine(lean.total, g, "total")), h("div", { class: "signals" }, leanLine(lean.spread, g, "spread")))));
  }
  box.append(sec);

  const spots = s.cells.filter((c) => c.pick).sort((a, b) => b.edge - a.edge);
  const spotSec = h("section", {}, h("h3", {}, `Sweet spots (${spots.length})`));
  if (spots.length === 0) spotSec.append(h("p", { class: "empty" }, "No slice is far enough from 50% with a big enough sample to call."));
  for (const c of spots) spotSec.append(cellLine(c, s.ml));
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

  const rows = s.cells.map((c) => h("tr", {}, h("th", { scope: "row" }, c.label), h("td", {}, String(c.games.length)), h("td", {}, c.over.pct == null ? "–" : pct(c.over.pct, 0)), h("td", {}, (s.ml ? c.win : c.cover).pct == null ? "–" : pct((s.ml ? c.win : c.cover).pct!, 0))));
  box.append(h("section", { class: "records" }, h("h3", {}, "Every slice"), h("div", { class: "scroll" }, h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, ""), h("th", {}, "Games"), h("th", {}, "Over"), h("th", {}, s.ml ? "Fav wins" : "Fav covers"))), h("tbody", {}, ...rows)))));
}

const RULES_TAB = "rules";
const BOARD_TAB = "board";
const LEANS_TAB = "leans";

/** How the logged leans have done since they started being logged, by grade. */
export function renderLeanRecord(box: HTMLElement, logged: Record<string, LoggedLean>, finals: Map<string, LineGame>): void {
  clear(box);
  const tallies = tallyLeans(logged, finals);
  const total = Object.keys(logged).length;
  box.append(h("p", { class: "note" }, `Every lean is saved before kickoff and graded against the final score at the line it was made on. ${total} logged so far, ${finals.size ? `${[...finals.keys()].filter((id) => id in logged).length} finished` : "none finished yet"}. Break-even at -110 is ${pct(BREAK_EVEN, 1)}. Sample sizes are small at first, so give each grade a few hundred games before reading anything into it.`));
  const rows = tallies.map((t) => {
    const r = tallyRate(t);
    return h("tr", {}, h("th", { scope: "row" }, `${t.grade} · ${t.kind}`), h("td", {}, `${t.wins}-${t.losses}${t.pushes ? `-${t.pushes}` : ""}`), h("td", {}, r.pct == null ? "–" : pct(r.pct, 0)), h("td", {}, r.lo == null ? "–" : `${pct(r.lo, 0)} to ${pct(r.hi!, 0)}`));
  });
  box.append(h("section", { class: "records" }, h("h3", {}, "Record by grade"), rows.length ? h("div", { class: "scroll" }, h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "Call"), h("th", {}, "Record"), h("th", {}, "Win"), h("th", {}, "95% range"))), h("tbody", {}, ...rows))) : h("p", { class: "empty" }, "No logged lean has finished yet. Leans are logged on each morning's run and graded after the games end.")));
}

/** Every game on the board in every league, each with its lean on the total and the spread. */
export function renderBoard(box: HTMLElement, data: Record<string, { all: LineGame[]; tracked: LineGame[] }>): void {
  clear(box);
  const rows: Array<{ g: LineGame; id: string; ml: boolean }> = [];
  for (const [id, d] of Object.entries(data)) for (const g of d.tracked.filter((x) => x.status !== "post")) rows.push({ g, id, ml: d.all.some((x) => x.ml != null) });
  rows.sort((a, b) => a.g.start.localeCompare(b.g.start));
  box.append(h("p", { class: "note" }, "Each game gets a lean on the total and the spread from the finished games closest to it in spread and total. Sweet spot means a pattern that held up season by season. Lean means the 95% range sits above 50%. Slight lean is just the better side of a near coin flip, and most closing lines are close to efficient, so treat a slight lean as a tiebreaker only. Break-even at -110 is 52.4%."));
  const sec = h("section", {}, h("h3", {}, `All games on the board (${rows.length})`));
  if (rows.length === 0) sec.append(h("p", { class: "empty" }, "No games with a line on the board right now."));
  for (const { g, id, ml } of rows) {
    const lean = leanFor(g, data[id]!.all, id, ml);
    sec.append(h("div", { class: "streak" }, h("div", { class: "s-main" }, h("strong", {}, `${id.toUpperCase()}: ${g.fav} ${g.ml != null ? `-${g.ml}` : g.spread > 0 ? `-${g.spread}` : "pick'em"} vs ${g.dog}`), h("div", { class: "signals" }, `${when(g.start)} · total ${g.total}`), h("div", { class: "signals" }, leanLine(lean.total, g, "total")), h("div", { class: "signals" }, leanLine(lean.spread, g, "spread")))));
  }
  box.append(sec);
}

/** Every rule: how it did in the history, how it has done since it was set, and which games on the board fit it. */
export function renderRules(box: HTMLElement, data: Record<string, { all: LineGame[]; tracked: LineGame[] }>): void {
  clear(box);
  const label = (id: string): string => LEAGUES.find((l) => l.id === id)?.label ?? id.toUpperCase();
  const plays: HTMLElement[] = [];
  const rows: HTMLElement[] = [];
  for (const r of RULES) {
    const d = data[r.league] ?? { all: [], tracked: [] };
    const hist = ruleRate(r, d.all);
    const fwd = ruleRate(r, d.tracked.filter((g) => g.date >= RULES_START));
    for (const g of d.tracked.filter((x) => x.status !== "post" && r.test(x)).sort((a, b) => a.start.localeCompare(b.start))) {
      plays.push(h("div", { class: "streak" }, h("div", { class: "s-main" }, h("strong", {}, `${label(r.league)}: ${r.lean} ${g.total} · ${g.fav} vs ${g.dog}`), h("div", { class: "signals" }, `${when(g.start)} · ${r.label} (${hist.pct == null ? "–" : pct(hist.pct, 0)} in the history, n=${hist.n})`))));
    }
    rows.push(h("tr", {}, h("th", { scope: "row" }, `${label(r.league)} ${r.lean}: ${r.label}`), h("td", {}, hist.pct == null ? "–" : `${pct(hist.pct, 0)} (${hist.n})`), h("td", {}, fwd.n === 0 ? "none yet" : `${fwd.hits}-${fwd.n - fwd.hits} (${pct(fwd.pct ?? 0, 0)})`)));
  }
  box.append(
    h("p", { class: "note" }, `Leans found in the history. Break-even at -110 is ${pct(BREAK_EVEN, 1)}, and most of these clear it by a point or three, which is within what one season of luck can erase. The forward record counts games from ${RULES_START} on and is the real test.`),
    h("section", {}, h("h3", {}, `Rule plays on the board (${plays.length})`), ...(plays.length ? plays : [h("p", { class: "empty" }, "No game on the board fits a rule right now.")])),
    h("section", { class: "records" }, h("h3", {}, "Every rule"), h("div", { class: "scroll" }, h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "Rule"), h("th", {}, "History"), h("th", {}, "Since set"))), h("tbody", {}, ...rows)))),
  );
}

export async function renderLines(view: HTMLElement, _ledger?: unknown, source: LinesSource = linesSource): Promise<void> {
  clear(view);
  const chips = h("div", { class: "chips", role: "tablist", "aria-label": "Leagues" });
  const body = h("div", {});
  let current = BOARD_TAB;
  const merge = (hist: LineRow[] | null, tracked: LineGame[] | null) => {
    const trackedGames = (tracked ?? []).map(withMoneyline);
    const seen = new Set(trackedGames.filter((g) => g.status === "post").map((g) => g.id));
    return { trackedGames, all: [...(hist ?? []).filter((r) => !seen.has(r[0])).map(fromRow), ...trackedGames.filter((g) => g.status === "post")] };
  };
  const show = async (id: string) => {
    if (id === LEANS_TAB) {
      current = id;
      for (const b of chips.children) b.setAttribute("aria-selected", String((b as HTMLElement).dataset.tab === id));
      clear(body);
      body.append(h("p", { class: "empty" }, "Loading…"));
      const logged = (await source.leans?.().catch(() => null)) ?? {};
      const finals = new Map<string, LineGame>();
      await Promise.all(LEAGUES.map(async (l) => {
        for (const g of ((await source.tracked(l.id).catch(() => null)) ?? []).map(withMoneyline)) if (g.status === "post") finals.set(g.id, g);
      }));
      if (current === id) renderLeanRecord(body, logged, finals);
      return;
    }
    if (id === BOARD_TAB) {
      current = id;
      for (const b of chips.children) b.setAttribute("aria-selected", String((b as HTMLElement).dataset.tab === id));
      clear(body);
      body.append(h("p", { class: "empty" }, "Loading…"));
      const data: Record<string, { all: LineGame[]; tracked: LineGame[] }> = {};
      await Promise.all(LEAGUES.map(async (l) => {
        const [hist, tracked] = await Promise.all([source.history(l.id).catch(() => null), source.tracked(l.id).catch(() => null)]);
        const m = merge(hist, tracked);
        data[l.id] = { all: m.all, tracked: m.trackedGames };
      }));
      if (current === id) renderBoard(body, data);
      return;
    }
    if (id === RULES_TAB) {
      current = id;
      for (const b of chips.children) b.setAttribute("aria-selected", String((b as HTMLElement).dataset.tab === id));
      clear(body);
      body.append(h("p", { class: "empty" }, "Loading…"));
      const ids = [...new Set(RULES.map((r) => r.league))];
      const data: Record<string, { all: LineGame[]; tracked: LineGame[] }> = {};
      await Promise.all(ids.map(async (lid) => {
        const [hist, tracked] = await Promise.all([source.history(lid).catch(() => null), source.tracked(lid).catch(() => null)]);
        const m = merge(hist, tracked);
        data[lid] = { all: m.all, tracked: m.trackedGames };
      }));
      if (current === id) renderRules(body, data);
      return;
    }
    current = id;
    for (const b of chips.children) b.setAttribute("aria-selected", String((b as HTMLElement).dataset.tab === id));
    clear(body);
    body.append(h("p", { class: "empty" }, "Loading…"));
    const [hist, tracked] = await Promise.all([source.history(id).catch(() => null), source.tracked(id).catch(() => null)]);
    if (current !== id) return;
    const m = merge(hist, tracked);
    renderLeague(body, id, m.all, m.trackedGames);
  };
  for (const [id, text] of [[BOARD_TAB, "All games"], [LEANS_TAB, "Lean record"], [RULES_TAB, "Rules"], ...LEAGUES.map((l) => [l.id, l.label])] as Array<[string, string]>) chips.append(h("button", { type: "button", role: "tab", class: "chip", "data-tab": id, onclick: () => void show(id) }, text));
  view.append(h("p", { class: "note" }, "Every game with a spread and total, tracked to the final score, to find where the over and the favorite pay."), chips, body);
  await show(current);
}
