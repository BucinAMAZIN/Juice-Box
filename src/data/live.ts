import { NFL_SITE, SITE, parseNbaBox, parseNflBox } from "./espn";
import { NHL_BASE, nameKey, parseBoxscore } from "./nhl";
import { boxNameKey } from "./linemate";
import { type GameStatus, clockMinutes, elapsedFraction } from "../engine/live";
import { statOf as nbaStat } from "../engine/nba";
import { statOf as nflStat } from "../engine/nfl";
import { statFor } from "./autograde";
import type { HandedPick, NbaMarket, NflMarket } from "../engine/types";
import type { Market } from "../core/types";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** One game's live state and a way to read any listed player's number out of it. */
export interface GameLive {
  status: GameStatus;
  stat(pick: HandedPick): number | null;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url.startsWith(NHL_BASE) ? url : `${url}${url.includes("?") ? "&" : "?"}_=${Date.now()}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** ESPN's status block for a summary: state, clock text and the period. */
export function espnStatus(json: unknown, sport: string): GameStatus {
  const header = isObj(json) && isObj(json.header) && Array.isArray(json.header.competitions) ? json.header.competitions[0] : null;
  const st = isObj(header) && isObj(header.status) ? header.status : null;
  const type = st && isObj(st.type) ? st.type : {};
  const state = type.state === "in" ? "in" : type.state === "post" && type.completed !== false ? "post" : "pre";
  const clock = st && typeof st.displayClock === "string" ? st.displayClock : "";
  const period = st && typeof st.period === "number" ? st.period : 0;
  const detail = typeof type.shortDetail === "string" ? type.shortDetail : clock;
  const comps = isObj(header) && Array.isArray(header.competitors) ? header.competitors.filter(isObj) : [];
  const side = (w: string) => comps.find((c) => c.homeAway === w);
  const part = (c: Obj | undefined) => (c && isObj(c.team) && typeof c.team.abbreviation === "string" ? `${c.team.abbreviation} ${c.score ?? ""}`.trim() : "");
  const score = side("away") && side("home") && state !== "pre" ? `${part(side("away"))} - ${part(side("home"))}` : undefined;
  return { state, detail, frac: state === "post" ? 1 : state === "pre" ? 0 : elapsedFraction(sport, period, clock), ...(score ? { score } : {}) };
}

export function nhlStatus(json: unknown): GameStatus {
  const o = isObj(json) ? json : {};
  const gs = typeof o.gameState === "string" ? o.gameState : "";
  const state = gs === "LIVE" || gs === "CRIT" ? "in" : gs === "FINAL" || gs === "OFF" ? "post" : "pre";
  const clock = isObj(o.clock) && typeof o.clock.timeRemaining === "string" ? o.clock.timeRemaining : "";
  const period = isObj(o.periodDescriptor) && typeof o.periodDescriptor.number === "number" ? o.periodDescriptor.number : 0;
  const intermission = isObj(o.clock) && o.clock.inIntermission === true;
  const tm = (k: string) => (isObj(o[k]) && typeof (o[k] as Obj).abbrev === "string" ? `${(o[k] as Obj).abbrev} ${(o[k] as Obj).score ?? ""}`.trim() : "");
  const score = state !== "pre" && tm("awayTeam") && tm("homeTeam") ? `${tm("awayTeam")} - ${tm("homeTeam")}` : undefined;
  return { ...(score ? { score } : {}), state, detail: state === "in" ? `P${period} ${intermission ? "intermission" : clock}` : state === "post" ? "Final" : "", frac: state === "post" ? 1 : state === "pre" ? 0 : elapsedFraction("nhl", period, intermission ? "0:00" : clock) };
}

const NHL_SITE = "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl";
/** Team codes differ between the NHL's feed, Linemate and ESPN; compare them in one form. */
const NHL_CODE: Record<string, string> = { TBL: "TB", NJD: "NJ", SJS: "SJ", LAK: "LA", UTA: "UTAH", VGK: "VGK", WSH: "WSH", MTL: "MTL" };
const code = (c: string): string => NHL_CODE[c.toUpperCase()] ?? c.toUpperCase();

/** What we know about a game that lets us find it in another feed. */
export interface GameHint { team: string; opponent: string; start: string }

const espnNhlId = new Map<number, string>();
/** The NHL's own feed refuses requests from a web page, so find the same game in ESPN's, which allows them. */
async function findEspnNhl(gameId: number, hint: GameHint): Promise<string | null> {
  const known = espnNhlId.get(gameId);
  if (known) return known;
  const day = new Date(hint.start).toLocaleDateString("en-CA", { timeZone: "America/New_York" }).replace(/-/g, "");
  const json = await getJson(`${NHL_SITE}/scoreboard?dates=${day}`);
  const events = isObj(json) && Array.isArray(json.events) ? json.events.filter(isObj) : [];
  const want = new Set([code(hint.team), code(hint.opponent)]);
  for (const e of events) {
    const comp = Array.isArray(e.competitions) && isObj(e.competitions[0]) ? e.competitions[0] : null;
    const teams = comp && Array.isArray(comp.competitors) ? comp.competitors.filter(isObj).map((c) => (isObj(c.team) && typeof c.team.abbreviation === "string" ? code(c.team.abbreviation) : "")) : [];
    if (teams.length === 2 && teams.every((t) => want.has(t)) && typeof e.id === "string") { espnNhlId.set(gameId, e.id); return e.id; }
  }
  return null;
}

export interface EspnNhlLine { key: string; goals: number; assists: number; points: number; sog: number }
/** Skater lines in an ESPN hockey summary. ESPN gives goals, assists and shots; points are goals plus assists. */
export function parseEspnNhlBox(json: unknown): EspnNhlLine[] {
  const out: EspnNhlLine[] = [];
  const teams = isObj(json) && isObj(json.boxscore) && Array.isArray(json.boxscore.players) ? json.boxscore.players.filter(isObj) : [];
  for (const t of teams) {
    for (const g of Array.isArray(t.statistics) ? t.statistics.filter(isObj) : []) {
      if (g.name !== "forwards" && g.name !== "defenses") continue;
      const keys = Array.isArray(g.keys) ? g.keys.map(String) : [];
      const at = (k: string) => keys.indexOf(k);
      for (const a of Array.isArray(g.athletes) ? g.athletes.filter(isObj) : []) {
        if (!isObj(a.athlete) || !Array.isArray(a.stats)) continue;
        const stats = a.stats as unknown[];
        const n = (k: string): number => { const v = Number(stats[at(k)]); return Number.isFinite(v) ? v : 0; };
        const goals = n("goals");
        const assists = n("assists");
        out.push({ key: boxNameKey(String(a.athlete.displayName ?? "")), goals, assists, points: goals + assists, sog: n("shotsTotal") });
      }
    }
  }
  return out;
}

/** Fetch one game's current box score and status. Null when the feed cannot be read. */
export async function loadGameLive(sport: "nba" | "nfl" | "nhl", gameId: number, hint?: GameHint): Promise<GameLive | null> {
  try {
    if (sport === "nhl" && typeof window !== "undefined") {
      if (!hint) return null;
      const id = await findEspnNhl(gameId, hint);
      if (!id) return null;
      const json = await getJson(`${NHL_SITE}/summary?event=${id}`);
      const lines = parseEspnNhlBox(json);
      return {
        status: espnStatus(json, "nhl"),
        stat: (p) => {
          const l = lines.find((x) => x.key === boxNameKey(p.player));
          if (!l) return null;
          return p.market === "sog" ? l.sog : p.market === "goals" ? l.goals : p.market === "assists" ? l.assists : p.market === "points" ? l.points : null;
        },
      };
    }
    if (sport === "nhl") {
      const json = await getJson(`${NHL_BASE}/gamecenter/${gameId}/boxscore`);
      const box = parseBoxscore(json);
      return {
        status: nhlStatus(json),
        stat: (p) => {
          const key = boxNameKey(p.player);
          const line = box?.players.find((x) => boxNameKey(x.name) === key);
          return line ? statFor(line, p.market as Market) : null;
        },
      };
    }
    const json = await getJson(`${sport === "nba" ? SITE : NFL_SITE}/summary?event=${gameId}`);
    const status = espnStatus(json, sport);
    if (sport === "nba") {
      const box = parseNbaBox(json, gameId);
      return { status, stat: (p) => { const l = box?.players.find((x) => x.key === boxNameKey(p.player)); return l ? nbaStat(l, p.market as NbaMarket) : null; } };
    }
    const box = parseNflBox(json, gameId);
    // A player with no line in an NFL box score has no stats in that category yet, which counts as zero.
    return { status, stat: (p) => { const l = box?.players.find((x) => x.key === boxNameKey(p.player)); return l ? nflStat(l, p.market as NflMarket) : 0; } };
  } catch {
    return null;
  }
}

export { clockMinutes };
