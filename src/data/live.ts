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
  const res = await fetch(`${url}${url.includes("?") ? "&" : "?"}_=${Date.now()}`, { headers: { accept: "application/json" } });
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

/** Fetch one game's current box score and status. Null when the feed cannot be read. */
export async function loadGameLive(sport: "nba" | "nfl" | "nhl", gameId: number): Promise<GameLive | null> {
  try {
    if (sport === "nhl") {
      const json = await getJson(`${NHL_BASE}/gamecenter/${gameId}/boxscore`);
      const box = parseBoxscore(json);
      return {
        status: nhlStatus(json),
        stat: (p) => {
          const key = nameKey(p.player);
          const line = box?.players.find((x) => nameKey(x.name) === key);
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
