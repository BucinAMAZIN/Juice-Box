import { LEAGUES } from "../data/leagues";
import { BREAK_EVEN, RULES, RULES_START, ruleRate } from "../engine/rules";
import { type Cell, type LineGame, type LineRow, cellFor, coverRate, coverResult, fromRow, overRate, slice, totalResult, winRate, withMoneyline } from "../engine/lines";
import { type LoggedLean, tallyLeans, tallyRate } from "../engine/leanlog";
import { type Call, type Lean, callText, leanFor } from "../engine/leans";
import { hardRockUrl } from "../data/hardrock";
import { heatHue } from "../engine/heat";
import { type TeamTrend, type TrendMarket, type TrendOutcome, MARKET_TEXT, trendChance } from "../engine/teamtrends";
import { letter } from "./grading";
import { odds } from "./streaks";
import { gameFrac, type ScoreTarget, watchScores } from "./live";
import { type LaneLive, gameLive, scoreLine, spreadLane, totalLane, trendLive } from "../engine/live";
import { canonTeam } from "../engine/teamtrends";
import { clear, h } from "./dom";
import { pct } from "./format";
import { getJson } from "./picks";

export interface LinesSource {
  history(league: string): Promise<LineRow[] | null>;
  tracked(league: string): Promise<LineGame[] | null>;
  leans?(): Promise<Record<string, LoggedLean> | null>;
  /** Linemate team trends, saved by game day. */
  trends?(): Promise<Array<TeamTrend & { outcome?: TrendOutcome }>>;
}

export const linesSource: LinesSource = {
  async history(league) {
    return (await getJson<{ rows: LineRow[] }>(`lines/${league}/history.json`))?.rows ?? null;
  },
  async tracked(league) {
    return (await getJson<{ games: LineGame[] }>(`lines/${league}/tracked.json`))?.games ?? null;
  },
  async trends() {
    const dates = (await getJson<{ dates: string[] }>("team-trends/index.json"))?.dates ?? [];
    const days = await Promise.all(dates.map((d) => getJson<{ trends: Array<TeamTrend & { outcome?: TrendOutcome }> }>(`team-trends/${d}.json`).catch(() => null)));
    return days.flatMap((d) => d?.trends ?? []);
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
type Tone = "sweet" | "lean" | "above" | "below" | "none";
const toneOf = (c: Call | null): Tone => (c == null ? "none" : c.grade === "sweet spot" ? "sweet" : c.grade === "lean" ? "lean" : c.pct >= c.breakEven ? "above" : "below");
const TAG: Record<Tone, string> = { sweet: "Sweet spot", lean: "Lean", above: "Slight", below: "Slight", none: "No call" };
/** How far a call sits above its break-even, for sorting. A sweet spot counts for more. */
const strengthOf = (l: Lean): number => Math.max(...[l.total, l.spread].map((c) => (c == null ? -1 : c.pct - c.breakEven + (c.grade === "sweet spot" ? 0.1 : c.grade === "lean" ? 0.03 : 0))));
const barPos = (x: number): string => `${Math.max(0, Math.min(100, Math.round(((x - 0.4) / 0.3) * 100)))}%`;

function callBox(kind: "total" | "spread", c: Call | null, g: LineGame, slot?: HTMLElement): HTMLElement {
  const tone = toneOf(c);
  const name = kind === "total" ? "Total" : c?.note === "moneyline" ? "Moneyline" : "Spread";
  const head = h("div", { class: "cb-head" }, h("span", { class: "cb-name" }, name), h("span", { class: "cb-tag" }, TAG[tone]));
  if (c == null) return h("div", { class: "callbox tone-none" }, head, h("div", { class: "cb-none" }, "Not enough similar games"));
  return h(
    "div",
    { class: `callbox tone-${tone}` },
    head,
    h("div", { class: "cb-call" }, callText(c, g, kind)),
    h("div", { class: "cb-bar", role: "img", "aria-label": `${pct(c.pct, 0)} hit rate, ${pct(c.breakEven, 0)} needed to break even` }, h("div", { class: "cb-fill", style: `width:${barPos(c.pct)}` }), h("div", { class: "cb-tick", style: `left:${barPos(c.breakEven)}` })),
    h("div", { class: "cb-note" }, h("strong", {}, pct(c.pct, 0)), ` of ${c.n} ${c.note && c.note !== "moneyline" ? `games (${c.note})` : "games"}`),
    ...(slot ? [slot] : []),
  );
}

/** Draw a lane's live reading (text plus bar) into its slot. */
function drawLane(slot: HTMLElement, lane: LaneLive | null): void {
  slot.hidden = lane == null;
  slot.textContent = "";
  slot.className = `lane-live live-${lane?.tone ?? "wait"}`;
  if (!lane) return;
  const bar = h("div", { class: lane.center ? "s-bar centred" : "s-bar" });
  const fill = h("i", {});
  if (lane.center) { fill.style.left = lane.fill >= 0 ? "50%" : `${50 + lane.fill * 50}%`; fill.style.width = `${Math.abs(lane.fill) * 50}%`; }
  else fill.style.width = `${Math.round(lane.fill * 100)}%`;
  bar.append(fill);
  if (lane.center) bar.append(h("b", { class: "mid", style: "left:50%" }));
  else if (lane.tick != null) bar.append(h("b", { style: `left:${Math.round(Math.max(0, Math.min(1, lane.tick)) * 100)}%`, title: "Where it should be by now" }));
  slot.append(h("span", {}, lane.text), bar);
}

/** One game: who is favored and when, then a box for the spread call and a box for the total call. */
function gameCard(g: LineGame, lean: Lean, league?: string, extra = "", live?: { league: string; targets: ScoreTarget[]; ml: boolean }): HTMLElement {
  const fav = `${g.fav} ${g.ml != null ? `-${g.ml}` : g.spread > 0 ? `-${g.spread}` : "pick'em"}`;
  const liveBox = h("div", { class: "s-live", hidden: "" });
  const spreadSlot = h("div", { class: "lane-live", hidden: "" });
  const totalSlot = h("div", { class: "lane-live", hidden: "" });
  const card = h(
    "article",
    { class: "gamecard" },
    h("div", { class: "gc-top" }, h("h4", {}, `${league ? `${league.toUpperCase()} · ` : ""}${fav} vs ${g.dog}`), h("span", { class: "gc-when" }, when(g.start))),
    h("div", { class: "gc-meta" }, `Total ${g.total}${g.favWin != null && g.dogWin != null ? ` · records ${pct(g.favWin, 0)} vs ${pct(g.dogWin, 0)}` : ""}${extra}`),
    liveBox,
    h("div", { class: "lanes" }, callBox("spread", lean.spread, g, spreadSlot), callBox("total", lean.total, g, totalSlot)),
  );
  if (live) {
    live.targets.push({
      el: card,
      league: live.league,
      start: g.start,
      update: (games) => {
        const game = games.find((x) => x.id === g.id);
        const gl = { ...g, ...(live.ml && g.ml != null ? { ml: g.ml } : {}) };
        const line = game ? scoreLine(g, game) : null;
        liveBox.hidden = line == null;
        liveBox.textContent = line ?? "";
        liveBox.className = `s-live live-${game?.state === "post" ? "wait" : "on"}`;
        const sp = lean.spread?.side;
        drawLane(spreadSlot, game && (sp === "favorite" || sp === "underdog") ? spreadLane(sp, gl, game, live.league) : null);
        const tt = lean.total?.side;
        drawLane(totalSlot, game && (tt === "over" || tt === "under") ? totalLane(tt, g, game, gameFrac(live.league, game)) : null);
      },
    });
  }
  return card;
}

type SortMode = "time" | "strength";
const sortToggle = (get: () => SortMode, set: (m: SortMode) => void): HTMLElement => {
  const box = h("div", { class: "chips", role: "group", "aria-label": "Sort games" });
  for (const [id, label] of [["time", "By time"], ["strength", "Strongest first"]] as const) {
    const b = h("button", { type: "button", class: "chip", "data-sort": id, "aria-pressed": String(get() === id), onclick: () => { set(id); for (const x of box.children) x.setAttribute("aria-pressed", String((x as HTMLElement).dataset.sort === id)); } }, label);
    box.append(b);
  }
  return box;
};

const COLOUR_KEY = (): HTMLElement => h("div", { class: "tone-key", "aria-label": "Colour key" }, ...([["sweet", "Sweet spot"], ["lean", "Lean"], ["above", "Slight, above break-even"], ["below", "Slight, below break-even"], ["none", "No call"]] as const).map(([t, l]) => h("span", { class: `tone-${t}` }, l)));

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

  const upcoming = tracked.filter((g) => g.status !== "post");
  const sec = h("section", {}, h("h3", {}, `On the board (${upcoming.length})`));
  const list = h("div", {});
  const items = upcoming.map((g) => {
    const c = cellFor(g, s);
    return { g, lean: leanFor(g, all, id, s.ml), extra: c?.pick ? ` · sweet spot: ${PICK_TEXT[c.pick]}` : "" };
  });
  let mode: SortMode = "time";
  const targets: ScoreTarget[] = [];
  const draw = () => {
    clear(list);
    targets.length = 0;
    const sorted = [...items].sort((a, b) => (mode === "strength" ? strengthOf(b.lean) - strengthOf(a.lean) : 0) || a.g.start.localeCompare(b.g.start));
    for (const x of sorted) list.append(gameCard(x.g, x.lean, undefined, x.extra, { league: id, targets, ml: s.ml }));
  };
  if (upcoming.length === 0) sec.append(h("p", { class: "empty" }, "No games with a line on the board right now."));
  else sec.append(COLOUR_KEY(), sortToggle(() => mode, (m) => { mode = m; draw(); }), list);
  draw();
  box.append(sec);
  watchScores(box, () => targets);

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
const LINEMATE_TAB = "linemate";

const trendName = (t: TeamTrend): string => {
  const [, away, home] = t.gameId.split("-");
  const n = (x: number) => (x > 0 ? `+${x}` : String(x));
  switch (t.market) {
    case "SPREAD": return `${t.team} ${n(t.line)}`;
    case "MONEY_LINE": return `${t.team} to win`;
    case "TEAM_TOTAL": return `${t.team} team total ${t.side} ${t.line}`;
    case "GAME_TOTAL": return `${away ?? t.team} @ ${home ?? t.opponent} total ${t.side} ${t.line}`;
  }
};

/** Linemate's own team trends, ranked by its numbers, with how they have done once graded. */
export function renderTeamTrends(box: HTMLElement, trends: Array<TeamTrend & { outcome?: TrendOutcome }>, now = Date.now()): void {
  clear(box);
  const filter = { market: "all" as TrendMarket | "all", sport: "all" as string };
  const upcoming = trends.filter((t) => Date.parse(t.start) > now);
  const list = h("div", {});
  const record = h("section", { class: "records" });
  const targets: ScoreTarget[] = [];
  const draw = () => {
    clear(list);
    targets.length = 0;
    const shown = upcoming.filter((t) => (filter.market === "all" || t.market === filter.market) && (filter.sport === "all" || t.sport === filter.sport)).map((t) => ({ t, p: trendChance(t) })).sort((a, b) => b.p - a.p || a.t.start.localeCompare(b.t.start));
    if (shown.length === 0) list.append(h("p", { class: "empty" }, "No Linemate team trends of 5+ games at 80%+ for these filters right now."));
    for (const { t, p } of shown.slice(0, 60)) {
      const hr = t.book === "Hard Rock" && t.sid;
      const price = t.price == null ? null : hr ? h("a", { class: "hr s-odds", href: hardRockUrl([t.sid!]), target: "_blank", rel: "noopener" }, odds(t.price)) : h("span", { class: "s-odds off", title: "Hard Rock may still offer this line: check the Hard Rock app." }, odds(t.price), h("small", {}, `${t.book ?? "other"} · check HR`));
      const liveBox = h("div", { class: "s-live", hidden: "" });
      const row = h("article", { class: "streak heat", style: `--heat:${heatHue(p)}` }, h("div", { class: "s-main" }, h("strong", {}, trendName(t)), h("div", { class: "muted" }, `${MARKET_TEXT[t.market]} · ${t.sport.toUpperCase()} · ${t.team} vs ${t.opponent} · ${when(t.start)}`), h("div", { class: "signals" }, `${t.hits} of last ${t.games}${t.h2h ? ` · vs ${t.opponent} ${t.h2h.hits}/${t.h2h.games}` : ""}${t.split ? ` · ${t.home ? "home" : "away"} ${t.split.hits}/${t.split.games}` : ""}`), liveBox), price, h("div", { class: "s-grades" }, h("span", {}, `${letter(p)} ${Math.round(p * 100)}%`)));
      list.append(row);
      targets.push({
        el: row,
        league: t.sport,
        start: t.start,
        update: (games) => {
          const a = canonTeam(t.sport, t.team);
          const b = canonTeam(t.sport, t.opponent);
          const game = games.find((x) => Math.abs(Date.parse(x.start) - Date.parse(t.start)) <= 3 * 3_600_000 && ((canonTeam(t.sport, x.home) === a && canonTeam(t.sport, x.away) === b) || (canonTeam(t.sport, x.away) === a && canonTeam(t.sport, x.home) === b)));
          let out = null;
          if (game && game.homeScore != null && game.awayScore != null) {
            const mine = canonTeam(t.sport, game.home) === a;
            out = trendLive(t, { team: mine ? game.homeScore : game.awayScore, opp: mine ? game.awayScore : game.homeScore }, { state: game.state, detail: game.detail ?? "", frac: gameFrac(t.sport, game) });
          }
          liveBox.hidden = out == null;
          liveBox.textContent = out?.text ?? "";
          liveBox.className = `s-live live-${out?.tone ?? "wait"}`;
        },
      });
    }
    clear(record);
    const done = trends.filter((t) => t.outcome);
    const rows = (["SPREAD", "TEAM_TOTAL", "MONEY_LINE", "GAME_TOTAL"] as TrendMarket[]).map((m) => {
      const mine = done.filter((t) => t.market === m);
      const w = mine.filter((t) => t.outcome === "win").length;
      const l = mine.filter((t) => t.outcome === "loss").length;
      return h("tr", {}, h("th", { scope: "row" }, MARKET_TEXT[m]), h("td", {}, `${w}-${l}`), h("td", {}, w + l ? pct(w / (w + l), 0) : "–"));
    });
    record.append(h("h3", {}, "How Linemate's team trends have done"), done.length === 0 ? h("p", { class: "empty" }, "None graded yet. Trends are saved before kickoff and graded from the final score.") : h("div", { class: "scroll" }, h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "Market"), h("th", {}, "W-L"), h("th", {}, "Hit"))), h("tbody", {}, ...rows))));
  };
  const chip = (group: "market" | "sport", id: string, label: string) => h("button", { type: "button", class: "chip", "data-f": `${group}:${id}`, "aria-pressed": String(filter[group] === id), onclick: () => { filter[group] = id as never; for (const b of box.querySelectorAll(`[data-f^="${group}:"]`)) b.setAttribute("aria-pressed", String((b as HTMLElement).dataset.f === `${group}:${id}`)); draw(); } }, label);
  box.append(
    h("p", { class: "note" }, "Linemate's team trends: spreads, team totals, moneylines and game totals where a team has hit the line in 80%+ of its last 5 or more games. Ranked by Linemate's own numbers (recent record, head to head and home/away split), colored green to red. Grades here are Linemate's, not ours: results fill in below as games finish."),
    h("div", { class: "chips", role: "group", "aria-label": "Market" }, chip("market", "all", "All markets"), chip("market", "SPREAD", "Spread"), chip("market", "TEAM_TOTAL", "Team total"), chip("market", "MONEY_LINE", "Moneyline"), chip("market", "GAME_TOTAL", "Game total")),
    h("div", { class: "chips", role: "group", "aria-label": "Sport" }, chip("sport", "all", "All sports"), chip("sport", "nba", "NBA"), chip("sport", "nfl", "NFL"), chip("sport", "nhl", "NHL")),
    h("section", {}, h("h3", {}, `On the board (${upcoming.length})`), list),
    record,
  );
  draw();
  watchScores(box, () => targets);
}

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
  const list = h("div", {});
  const items = rows.map(({ g, id, ml }) => ({ g, id, lean: leanFor(g, data[id]!.all, id, ml) }));
  let mode: SortMode = "time";
  const targets: ScoreTarget[] = [];
  const mlOf = new Map(rows.map((r) => [r.id, r.ml]));
  const draw = () => {
    clear(list);
    targets.length = 0;
    const sorted = [...items].sort((x, y) => (mode === "strength" ? strengthOf(y.lean) - strengthOf(x.lean) : 0) || x.g.start.localeCompare(y.g.start));
    for (const x of sorted) list.append(gameCard(x.g, x.lean, x.id, "", { league: x.id, targets, ml: mlOf.get(x.id) ?? false }));
  };
  if (rows.length === 0) sec.append(h("p", { class: "empty" }, "No games with a line on the board right now."));
  else sec.append(COLOUR_KEY(), sortToggle(() => mode, (m) => { mode = m; draw(); }), list);
  draw();
  box.append(sec);
  watchScores(box, () => targets);
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
    if (id === LINEMATE_TAB) {
      current = id;
      for (const b of chips.children) b.setAttribute("aria-selected", String((b as HTMLElement).dataset.tab === id));
      clear(body);
      body.append(h("p", { class: "empty" }, "Loading…"));
      const trends = (await source.trends?.().catch(() => [])) ?? [];
      if (current === id) renderTeamTrends(body, trends);
      return;
    }
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
  for (const [id, text] of [[BOARD_TAB, "All games"], [LINEMATE_TAB, "Linemate"], [LEANS_TAB, "Lean record"], [RULES_TAB, "Rules"], ...LEAGUES.map((l) => [l.id, l.label])] as Array<[string, string]>) chips.append(h("button", { type: "button", role: "tab", class: "chip", "data-tab": id, onclick: () => void show(id) }, text));
  view.append(h("p", { class: "note" }, "Every game with a spread and total, tracked to the final score, to find where the over and the favorite pay."), chips, body);
  await show(current);
}
