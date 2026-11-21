/**
 * ESPN public feed adapter for the NBA (scoreboard, box scores, season per-game stats).
 * Parsers are pure and tolerant: an odd row is skipped, never a crash.
 */
import { boxNameKey } from "./linemate";

export const SITE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
export const COMMON = "https://site.api.espn.com/apis/common/v3/sports/basketball/nba";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const toNum = (v: unknown): number => {
  const n = Number(typeof v === "string" ? v.split("-")[0] : v);
  return Number.isFinite(n) ? n : 0;
};

export interface NbaGame {
  id: number;
  startUtc: string;
  away: string;
  home: string;
  /** "pre", "in" or "post". */
  state: string;
}

export interface NbaLine {
  name: string;
  /** Initial plus last name, comparable with Linemate. */
  key: string;
  team: string;
  opponent: string;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  threes: number;
}

export interface NbaBox {
  gameId: number;
  final: boolean;
  players: NbaLine[];
}

export function parseScoreboard(json: unknown): NbaGame[] {
  if (!isObj(json)) throw new Error("Unexpected scoreboard response");
  const out: NbaGame[] = [];
  for (const ev of arr(json.events)) {
    if (!isObj(ev)) continue;
    const comp = isObj(ev.competitions) ? ev.competitions : arr(ev.competitions)[0];
    if (!isObj(comp)) continue;
    const teams = arr(comp.competitors).filter(isObj);
    const home = teams.find((c) => c.homeAway === "home");
    const away = teams.find((c) => c.homeAway === "away");
    const code = (c: Obj | undefined) => (c && isObj(c.team) ? str(c.team.abbreviation) : "");
    const state = isObj(ev.status) && isObj(ev.status.type) ? str(ev.status.type.state) : "";
    const id = Number(ev.id);
    if (!Number.isFinite(id) || !code(home) || !code(away)) continue;
    out.push({ id, startUtc: str(ev.date), away: code(away), home: code(home), state });
  }
  return out;
}

export function parseNbaBox(json: unknown, gameId: number): NbaBox | null {
  if (!isObj(json) || !isObj(json.boxscore)) return null;
  const header = isObj(json.header) ? arr(json.header.competitions)[0] : null;
  const status = isObj(header) && isObj(header.status) && isObj(header.status.type) ? header.status.type : null;
  const final = status ? status.completed === true : false;
  const blocks = arr(json.boxscore.players).filter(isObj);
  const codes = blocks.map((b) => (isObj(b.team) ? str(b.team.abbreviation) : ""));
  const players: NbaLine[] = [];
  blocks.forEach((block, i) => {
    const stat = arr(block.statistics).filter(isObj)[0];
    if (!stat) return;
    const keys = arr(stat.keys).map(str);
    const at = (k: string) => keys.indexOf(k);
    const iMin = at("minutes");
    const iPts = at("points");
    const iReb = at("rebounds");
    const iAst = at("assists");
    const iTpm = at("threePointFieldGoalsMade-threePointFieldGoalsAttempted");
    if (iMin < 0 || iPts < 0 || iReb < 0 || iAst < 0) return;
    for (const a of arr(stat.athletes)) {
      if (!isObj(a) || !isObj(a.athlete) || a.didNotPlay === true) continue;
      const s = arr(a.stats);
      const minutes = toNum(s[iMin]);
      if (minutes <= 0) continue;
      const name = str(a.athlete.displayName);
      players.push({
        name,
        key: boxNameKey(name),
        team: codes[i] ?? "",
        opponent: codes[1 - i] ?? "",
        minutes,
        points: toNum(s[iPts]),
        rebounds: toNum(s[iReb]),
        assists: toNum(s[iAst]),
        threes: iTpm >= 0 ? toNum(s[iTpm]) : 0,
      });
    }
  });
  return players.length > 0 ? { gameId, final, players } : null;
}

export interface SeasonAvg {
  name: string;
  key: string;
  team: string;
  games: number;
  points: number;
  rebounds: number;
  assists: number;
  threes: number;
}

/** Pull per-game averages from a byathlete page, using the category and stat names it lists. */
export function parseByAthlete(json: unknown): SeasonAvg[] {
  if (!isObj(json)) throw new Error("Unexpected byathlete response");
  const cats = arr(json.categories).filter(isObj);
  const index = (cat: string, name: string) => {
    const c = cats.find((x) => x.name === cat);
    return c ? arr(c.names).map(str).indexOf(name) : -1;
  };
  const iGp = index("general", "gamesPlayed");
  const iReb = index("general", "avgRebounds");
  const iPts = index("offensive", "avgPoints");
  const iAst = index("offensive", "avgAssists");
  const iTpm = index("offensive", "avgThreePointFieldGoalsMade");
  if ([iGp, iReb, iPts, iAst, iTpm].some((i) => i < 0)) throw new Error("byathlete columns changed");
  const out: SeasonAvg[] = [];
  for (const row of arr(json.athletes)) {
    if (!isObj(row) || !isObj(row.athlete)) continue;
    const byCat = new Map<string, number[]>();
    for (const c of arr(row.categories)) if (isObj(c)) byCat.set(str(c.name), arr(c.values).map((v) => (typeof v === "number" ? v : 0)));
    const g = byCat.get("general");
    const o = byCat.get("offensive");
    if (!g || !o) continue;
    const name = str(row.athlete.displayName);
    out.push({
      name,
      key: boxNameKey(name),
      team: str(row.athlete.teamShortName) || str(row.athlete.teamName),
      games: g[iGp] ?? 0,
      rebounds: g[iReb] ?? 0,
      points: o[iPts] ?? 0,
      assists: o[iAst] ?? 0,
      threes: o[iTpm] ?? 0,
    });
  }
  return out;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { "user-agent": "juice-box" } });
  if (!res.ok) throw new Error(`ESPN ${res.status} for ${url}`);
  return res.json();
}

const compact = (date: string) => date.replace(/-/g, "");

export async function loadNbaScoreboard(date: string): Promise<NbaGame[]> {
  return parseScoreboard(await getJson(`${SITE}/scoreboard?dates=${compact(date)}`));
}

export async function loadNbaBox(gameId: number): Promise<NbaBox | null> {
  return parseNbaBox(await getJson(`${SITE}/summary?event=${gameId}`), gameId);
}

export function nbaSeason(date: string): number {
  const y = Number(date.slice(0, 4));
  return Number(date.slice(5, 7)) >= 9 ? y + 1 : y;
}

/** Season per-game averages for the players at the top of each sort, which is all the leader lists need. */
export async function loadNbaSeasonAverages(date: string, pages = 2): Promise<SeasonAvg[]> {
  const season = nbaSeason(date);
  const sorts = ["offensive.avgPoints", "general.avgRebounds", "offensive.avgAssists", "offensive.avgThreePointFieldGoalsMade"];
  const byKey = new Map<string, SeasonAvg>();
  for (const sort of sorts) {
    for (let page = 1; page <= pages; page++) {
      const url = `${COMMON}/statistics/byathlete?season=${season}&seasontype=2&limit=50&page=${page}&sort=${encodeURIComponent(sort + ":desc")}`;
      for (const a of parseByAthlete(await getJson(url))) byKey.set(`${a.key}|${a.name}`, a);
    }
  }
  return [...byKey.values()];
}
