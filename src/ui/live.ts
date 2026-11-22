import { loadGameLive, type GameLive } from "../data/live";
import { easternDate } from "../data/autograde";
import { leagueById } from "../data/leagues";
import { loadDay, type NcaaGame } from "../data/ncaa";
import { elapsedFraction } from "../engine/live";
import { type PropLive, propLive } from "../engine/live";
import type { HandedPick } from "../engine/types";

const UNIT: Record<string, string> = { points: "pts", rebounds: "reb", assists: "ast", threes: "3PM", pr: "pts+reb", pa: "pts+ast", ra: "reb+ast", pra: "PRA", passYds: "pass yds", rushYds: "rush yds", recYds: "rec yds", receptions: "rec", rushRecYds: "rush+rec yds", sog: "SOG", goals: "goals" };

/** Fill one prop row's live line from the game it belongs to. */
export function showProp(row: HTMLElement, pick: HandedPick, game: GameLive | null): void {
  const box = row.querySelector<HTMLElement>(".s-live");
  if (!box) return;
  const live: PropLive | null = game ? propLive(pick.side, pick.line, game.stat(pick), game.status, UNIT[pick.market] ?? pick.market) : null;
  box.hidden = live == null;
  box.className = `s-live live-${live?.tone ?? "wait"}`;
  box.textContent = "";
  if (live && game) {
    const stat = game.stat(pick);
    const goal = pick.side === "over" ? Math.floor(pick.line) + 1 : pick.line;
    const fill = stat == null || goal <= 0 ? 0 : Math.max(0, Math.min(1, stat / goal));
    const bar = document.createElement("div");
    bar.className = "s-bar";
    const inner = document.createElement("i");
    inner.style.width = `${Math.round(fill * 100)}%`;
    bar.append(inner);
    if (game.status.state === "in") {
      const tick = document.createElement("b");
      tick.title = "Where it needs to be by now";
      tick.style.left = `${Math.round(Math.max(0, Math.min(1, game.status.frac)) * 100)}%`;
      bar.append(tick);
    }
    const label = document.createElement("span");
    label.textContent = game.status.score ? `${live.text} · ${game.status.score}` : live.text;
    box.append(label, bar);
  } else box.textContent = live?.text ?? "";
  row.dataset.live = live?.tone ?? "";
}

/** The last live reading per prop, so a row rebuilt by a filter or tab change shows it at once instead of waiting for the next poll. */
const lastGame = new Map<string, GameLive>();
export function applyCached(row: HTMLElement, pick: HandedPick): void {
  const g = lastGame.get(pick.id);
  if (g) showProp(row, pick, g);
}

const INTERVAL_MS = 20_000;
/** A game is worth polling from just before kickoff until a few hours after, or until it is final. */
const eligible = (p: HandedPick, now: number): boolean => Date.parse(p.gameStart) <= now + 5 * 60_000 && Date.parse(p.gameStart) >= now - 6 * 3_600_000;

/**
 * Keep every prop row under `root` up to date while its game is on. Polls once a minute or so, only while the page is
 * visible, and stops when the list is taken off the page. Returns a stop function.
 */
export function watchProps(root: HTMLElement, picks: () => HandedPick[], load: typeof loadGameLive = loadGameLive, now: () => number = Date.now): () => void {
  let stopped = false;
  const done = new Set<string>();
  const tick = async (): Promise<void> => {
    if (stopped || !root.isConnected) { stop(); return; }
    if (typeof document !== "undefined" && document.hidden) return;
    const open = picks().filter((p) => eligible(p, now()) && !done.has(p.id));
    const games = new Map<string, HandedPick[]>();
    for (const p of open) {
      const k = `${p.sport}|${p.gameId}`;
      games.set(k, [...(games.get(k) ?? []), p]);
    }
    await Promise.all([...games.entries()].map(async ([k, ps]) => {
      const [sport, id] = k.split("|") as ["nba" | "nfl" | "nhl", string];
      const g = await load(sport, Number(id));
      for (const p of ps) {
        const row = root.querySelector<HTMLElement>(`[data-pick-id="${p.id.replace(/"/g, "\\\"")}"]`);
        if (g) lastGame.set(p.id, g);
        if (row) showProp(row, p, g);
        if (g?.status.state === "post") done.add(p.id);
      }
    }));
  };
  const timer = setInterval(() => void tick(), INTERVAL_MS);
  const wake = () => { if (!document.hidden) void tick(); };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", wake);
  const stop = () => { stopped = true; clearInterval(timer); if (typeof document !== "undefined") document.removeEventListener("visibilitychange", wake); };
  void tick();
  return stop;
}

/** A card or row on a page that wants its game's live score. */
export interface ScoreTarget {
  el: HTMLElement;
  league: string;
  start: string;
  /** Called with the league's games for today and yesterday; the target finds its own game. */
  update(games: NcaaGame[]): void;
}

export const gameFrac = (league: string, g: NcaaGame): number => (g.state === "post" ? 1 : g.state === "pre" ? 0 : elapsedFraction(league, g.period ?? 0, g.clock ?? ""));

/**
 * Keep scores on cards up to date while their games are on: one scoreboard request per league per round, only for
 * leagues that have a game in the live window, only while the page is visible, stopping when the list leaves the page.
 */
export function watchScores(root: HTMLElement, targets: () => ScoreTarget[], load: (day: string, league: string) => Promise<NcaaGame[]> = (d, l) => loadDay(d.replace(/-/g, ""), leagueById(l)!), now: () => number = Date.now): () => void {
  let stopped = false;
  const tick = async (): Promise<void> => {
    if (stopped || !root.isConnected) { stop(); return; }
    if (typeof document !== "undefined" && document.hidden) return;
    const t = now();
    const live = targets().filter((x) => Date.parse(x.start) <= t + 5 * 60_000 && Date.parse(x.start) >= t - 6 * 3_600_000);
    const leagues = [...new Set(live.map((x) => x.league))];
    await Promise.all(leagues.map(async (league) => {
      try {
        const days = [easternDate(new Date(t).toISOString()), easternDate(new Date(t - 86_400_000).toISOString())];
        const games = (await Promise.all(days.map((d) => load(d, league).catch(() => [] as NcaaGame[])))).flat();
        for (const x of live.filter((y) => y.league === league)) x.update(games);
      } catch { /* the next round tries again */ }
    }));
  };
  const timer = setInterval(() => void tick(), INTERVAL_MS);
  const wake = () => { if (!document.hidden) void tick(); };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", wake);
  const stop = () => { stopped = true; clearInterval(timer); if (typeof document !== "undefined") document.removeEventListener("visibilitychange", wake); };
  void tick();
  return stop;
}
