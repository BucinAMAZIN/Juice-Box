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
      const json = await getJson(url);
      if (isObj(json) && arr(json.athletes).length === 0 && page > 1) break;
      for (const a of parseByAthlete(json)) byKey.set(`${a.key}|${a.name}`, a);
    }
  }
  return [...byKey.values()];
}

/** Average minutes per game by player key, from a byathlete page. */
export function parseMinutes(json: unknown): Map<string, number> {
  const out = new Map<string, number>();
  if (!isObj(json)) return out;
  const cats = arr(json.categories).filter(isObj);
  const where = cats.map((c) => ({ name: str(c.name), i: arr(c.names).map(str).indexOf("avgMinutes") })).find((x) => x.i >= 0);
  if (!where) throw new Error("byathlete minutes column missing");
  for (const row of arr(json.athletes)) {
    if (!isObj(row) || !isObj(row.athlete)) continue;
    const cat = arr(row.categories).filter(isObj).find((c) => str(c.name) === where.name);
    const v = cat ? arr(cat.values)[where.i] : undefined;
    if (typeof v === "number" && v > 0) out.set(boxNameKey(str(row.athlete.displayName)), Math.round(v * 10) / 10);
  }
  return out;
}

/** The 200 NBA players who play the most minutes per game. Anyone not listed plays under about 15. */
export async function loadNbaMinutes(date: string, pages = 4): Promise<Map<string, number>> {
  const season = nbaSeason(date);
  const out = new Map<string, number>();
  for (let page = 1; page <= pages; page++) {
    const url = `${COMMON}/statistics/byathlete?season=${season}&seasontype=2&limit=50&page=${page}&sort=${encodeURIComponent("general.avgMinutes:desc")}`;
    for (const [k, v] of parseMinutes(await getJson(url))) out.set(k, v);
  }
  return out;
}

// ---------------------------------------------------------------- NFL

export const NFL_SITE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
export const NFL_COMMON = "https://site.api.espn.com/apis/common/v3/sports/football/nfl";

export interface NflLine {
  name: string;
  key: string;
  team: string;
  opponent: string;
  passYds: number;
  rushYds: number;
  recYds: number;
  receptions: number;
}

export interface NflBox {
  gameId: number;
  final: boolean;
  players: NflLine[];
}

export function parseNflBox(json: unknown, gameId: number): NflBox | null {
  if (!isObj(json) || !isObj(json.boxscore)) return null;
  const header = isObj(json.header) ? arr(json.header.competitions)[0] : null;
  const status = isObj(header) && isObj(header.status) && isObj(header.status.type) ? header.status.type : null;
  const final = status ? status.completed === true : false;
  const blocks = arr(json.boxscore.players).filter(isObj);
  const codes = blocks.map((b) => (isObj(b.team) ? str(b.team.abbreviation) : ""));
  const WANT: Record<string, Array<[string, keyof Pick<NflLine, "passYds" | "rushYds" | "recYds" | "receptions">]>> = {
    passing: [["passingYards", "passYds"]],
    rushing: [["rushingYards", "rushYds"]],
    receiving: [["receivingYards", "recYds"], ["receptions", "receptions"]],
  };
  const players = new Map<string, NflLine>();
  blocks.forEach((block, i) => {
    for (const stat of arr(block.statistics).filter(isObj)) {
      const wanted = WANT[str(stat.name)];
      if (!wanted) continue;
      const keys = arr(stat.keys).map(str);
      for (const a of arr(stat.athletes)) {
        if (!isObj(a) || !isObj(a.athlete)) continue;
        const name = str(a.athlete.displayName);
        const id = `${i}|${name}`;
        let line = players.get(id);
        if (!line) {
          line = { name, key: boxNameKey(name), team: codes[i] ?? "", opponent: codes[1 - i] ?? "", passYds: 0, rushYds: 0, recYds: 0, receptions: 0 };
          players.set(id, line);
        }
        const s = arr(a.stats);
        for (const [key, field] of wanted) {
          const at = keys.indexOf(key);
          if (at >= 0) line[field] = toNum(s[at]);
        }
      }
    }
  });
  return players.size > 0 ? { gameId, final, players: [...players.values()] } : null;
}

export interface NflAvg {
  name: string;
  key: string;
  games: number;
  passYds: number;
  rushYds: number;
  recYds: number;
  receptions: number;
}

/** Per-game averages from a byathlete page. Receptions come as a season total and are divided by games played. */
export function parseNflByAthlete(json: unknown): NflAvg[] {
  if (!isObj(json)) throw new Error("Unexpected byathlete response");
  const cats = arr(json.categories).filter(isObj);
  const index = (cat: string, name: string) => {
    const c = cats.find((x) => x.name === cat);
    return c ? arr(c.names).map(str).indexOf(name) : -1;
  };
  const iGp = index("general", "gamesPlayed");
  const iPass = index("passing", "passingYardsPerGame");
  const iRush = index("rushing", "rushingYardsPerGame");
  const iRec = index("receiving", "receivingYardsPerGame");
  const iCatch = index("receiving", "receptions");
  if ([iGp, iPass, iRush, iRec, iCatch].some((i) => i < 0)) throw new Error("NFL byathlete columns changed");
  const out: NflAvg[] = [];
  for (const row of arr(json.athletes)) {
    if (!isObj(row) || !isObj(row.athlete)) continue;
    const byCat = new Map<string, number[]>();
    for (const c of arr(row.categories)) if (isObj(c)) byCat.set(str(c.name), arr(c.values).map((v) => (typeof v === "number" ? v : 0)));
    const gp = byCat.get("general")?.[iGp] ?? 0;
    if (gp <= 0) continue;
    const name = str(row.athlete.displayName);
    out.push({
      name,
      key: boxNameKey(name),
      games: gp,
      passYds: byCat.get("passing")?.[iPass] ?? 0,
      rushYds: byCat.get("rushing")?.[iRush] ?? 0,
      recYds: byCat.get("receiving")?.[iRec] ?? 0,
      receptions: (byCat.get("receiving")?.[iCatch] ?? 0) / gp,
    });
  }
  return out;
}

export interface WeekInfo {
  week: number;
  games: NbaGame[];
}

/** The scoreboard for a week, or the current week when none is given. */
export async function loadNflWeek(week?: number): Promise<WeekInfo> {
  const json = await getJson(`${NFL_SITE}/scoreboard${week ? `?seasontype=2&week=${week}` : ""}`);
  const number = isObj(json) && isObj(json.week) ? Number(json.week.number) : week ?? 0;
  return { week: Number.isFinite(number) ? number : 0, games: parseScoreboard(json) };
}

export async function loadNflBox(gameId: number): Promise<NflBox | null> {
  return parseNflBox(await getJson(`${NFL_SITE}/summary?event=${gameId}`), gameId);
}

export function nflSeason(date: string): number {
  const y = Number(date.slice(0, 4));
  return Number(date.slice(5, 7)) >= 8 ? y : y - 1;
}

export async function loadNflSeasonAverages(date: string, pages = 2): Promise<NflAvg[]> {
  const season = nflSeason(date);
  const sorts = ["passing.passingYards", "rushing.rushingYards", "receiving.receivingYards", "receiving.receptions"];
  const byKey = new Map<string, NflAvg>();
  for (const sort of sorts) {
    for (let page = 1; page <= pages; page++) {
      const url = `${NFL_COMMON}/statistics/byathlete?season=${season}&seasontype=2&limit=50&page=${page}&sort=${encodeURIComponent(sort + ":desc")}`;
      const json = await getJson(url);
      // Past the last page the service returns no athletes (and no columns), so stop there instead of failing.
      if (isObj(json) && arr(json.athletes).length === 0 && page > 1) break;
      for (const a of parseNflByAthlete(json)) byKey.set(`${a.key}|${a.name}`, a);
    }
  }
  return [...byKey.values()];
}
