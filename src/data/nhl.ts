import { boxNameKey } from "./linemate";
/**
 * NHL public API adapter (api-web.nhle.com). Parsers are pure and tolerant: a missing or oddly shaped
 * field yields a skipped row, never a crash. Response shapes follow the public API as documented by the
 * community; verify against live responses before relying on them.
 */

export const NHL_BASE = "https://api-web.nhle.com/v1";

export interface ScheduledGame {
  id: number;
  startUtc: string;
  away: string;
  home: string;
  state: string;
}

export interface PlayerLine {
  playerId: number;
  name: string;
  team: string;
  opponent: string;
  position: string;
  sog: number;
  goals: number;
  assists: number;
  points: number;
  toiMinutes: number;
}

export interface Boxscore {
  gameId: number;
  final: boolean;
  players: PlayerLine[];
}

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** "18:42" -> 18.7 minutes. Anything unparseable is 0. */
export function toiToMinutes(toi: unknown): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(str(toi));
  if (!m) return 0;
  return Number(m[1]) + Number(m[2]) / 60;
}

function nameOf(v: unknown): string {
  if (typeof v === "string") return v;
  return isObj(v) ? str(v.default) : "";
}

/** Games whose local date matches `date` (YYYY-MM-DD) from a /schedule response. */
export function parseSchedule(json: unknown, date: string): ScheduledGame[] {
  if (!isObj(json) || !Array.isArray(json.gameWeek)) return [];
  const out: ScheduledGame[] = [];
  for (const day of json.gameWeek) {
    if (!isObj(day) || day.date !== date || !Array.isArray(day.games)) continue;
    for (const g of day.games) {
      if (!isObj(g) || !isObj(g.awayTeam) || !isObj(g.homeTeam)) continue;
      const id = num(g.id);
      const away = str(g.awayTeam.abbrev);
      const home = str(g.homeTeam.abbrev);
      if (!id || !away || !home) continue;
      out.push({ id, startUtc: str(g.startTimeUTC), away, home, state: str(g.gameState) });
    }
  }
  return out;
}

const FINAL_STATES = new Set(["FINAL", "OFF"]);

/** Player lines from a /gamecenter/{id}/boxscore response. Goalies are skipped. */
export function parseBoxscore(json: unknown): Boxscore | null {
  if (!isObj(json) || !isObj(json.awayTeam) || !isObj(json.homeTeam) || !isObj(json.playerByGameStats)) return null;
  const gameId = num(json.id);
  const away = str(json.awayTeam.abbrev);
  const home = str(json.homeTeam.abbrev);
  const stats = json.playerByGameStats;
  const players: PlayerLine[] = [];

  const sides: Array<[unknown, string, string]> = [
    [stats.awayTeam, away, home],
    [stats.homeTeam, home, away],
  ];
  for (const [side, team, opponent] of sides) {
    if (!isObj(side)) continue;
    for (const group of ["forwards", "defense"] as const) {
      const rows = side[group];
      if (!Array.isArray(rows)) continue;
      for (const r of rows) {
        if (!isObj(r)) continue;
        const name = nameOf(r.name);
        if (!name) continue;
        players.push({
          playerId: num(r.playerId),
          name,
          team,
          opponent,
          position: str(r.position),
          sog: num(r.sog),
          goals: num(r.goals),
          assists: num(r.assists),
          points: num(r.points),
          toiMinutes: toiToMinutes(r.toi),
        });
      }
    }
  }
  return { gameId, final: FINAL_STATES.has(str(json.gameState)), players };
}

/** Case- and accent-insensitive name key, so "Dylan Guenther" matches "dylan  guenther". */
export function nameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function findPlayer(box: Boxscore, name: string): PlayerLine | undefined {
  // The box score writes "S. Rinzel" where the books write "Sam Rinzel", so compare first initial plus last name.
  const key = boxNameKey(name);
  return box.players.find((p) => boxNameKey(p.name) === key);
}

export interface ClubGame {
  id: number;
  date: string;
  state: string;
  /** 2 = regular season, 3 = playoffs. */
  type: number;
  away: string;
  home: string;
}

/** Games from a /club-schedule-season/{team}/now response. */
export function parseClubSchedule(json: unknown): ClubGame[] {
  if (!isObj(json) || !Array.isArray(json.games)) return [];
  const out: ClubGame[] = [];
  for (const g of json.games) {
    if (!isObj(g) || !isObj(g.awayTeam) || !isObj(g.homeTeam)) continue;
    const id = num(g.id);
    const date = str(g.gameDate);
    const away = str(g.awayTeam.abbrev);
    const home = str(g.homeTeam.abbrev);
    if (!id || !date || !away || !home) continue;
    out.push({ id, date, state: str(g.gameState), type: num(g.gameType), away, home });
  }
  return out;
}

export async function loadClubSchedule(team: string): Promise<ClubGame[]> {
  return parseClubSchedule(await getJson(`${NHL_BASE}/club-schedule-season/${team}/now`));
}

/** Minimum gap between requests to the NHL API. It rate-limits (HTTP 429) when hit with bursts. */
export const MIN_GAP_MS = 300;
const BACKOFF_MS = [2_000, 5_000, 10_000, 20_000];

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
let gate: Promise<void> = Promise.resolve();

/** Space request starts apart, whatever the caller's concurrency. */
function throttle(sleep: (ms: number) => Promise<void>): Promise<void> {
  const turn = gate.then(() => sleep(MIN_GAP_MS));
  gate = turn;
  return turn;
}

export interface FetchDeps {
  fetchFn: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  timeoutMs: number;
}

/**
 * GET and parse JSON, paced, retrying on rate limits (429) and server errors with backoff.
 * Honors a Retry-After header when the API sends one. Other errors fail immediately.
 */
export async function fetchJsonWithRetry(url: string, deps: Partial<FetchDeps> = {}): Promise<unknown> {
  const fetchFn = deps.fetchFn ?? fetch;
  const sleep = deps.sleep ?? realSleep;
  const timeoutMs = deps.timeoutMs ?? 10_000;

  for (let attempt = 0; ; attempt++) {
    await throttle(sleep);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchFn(url, { signal: controller.signal });
      if (res.ok) return await res.json();
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= BACKOFF_MS.length) throw new Error(`NHL API ${res.status} for ${url}`);
      const header = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(header) && header > 0 ? Math.min(header * 1000, 30_000) : BACKOFF_MS[attempt]!);
    } finally {
      clearTimeout(timer);
    }
  }
}

function getJson(url: string, timeoutMs = 10_000): Promise<unknown> {
  return fetchJsonWithRetry(url, { timeoutMs });
}

export async function loadSchedule(date: string): Promise<ScheduledGame[]> {
  return parseSchedule(await getJson(`${NHL_BASE}/schedule/${date}`), date);
}

export async function loadBoxscore(gameId: number): Promise<Boxscore | null> {
  return parseBoxscore(await getJson(`${NHL_BASE}/gamecenter/${gameId}/boxscore`));
}

export type LeaderMarket = "sog" | "points" | "goals" | "assists";
export type Leaders = Record<LeaderMarket, string[]>;

/** Regular-season id such as 20262027. The season rolls over in September. */
export function seasonId(date: string): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const start = m >= 9 ? y : y - 1;
  return `${start}${start + 1}`;
}

export const LEADER_COUNT = 40;
const LEADER_SORT: Record<LeaderMarket, string> = { sog: "shots", points: "points", goals: "goals", assists: "assists" };

/** Pull player ids out of a stats-API skater summary page, keeping the order it came in. */
export function parseLeaderRows(json: unknown): string[] {
  const rows = (json as { data?: Array<{ playerId?: number }> } | null)?.data;
  if (!Array.isArray(rows)) throw new Error("Unexpected leaders response");
  return rows.filter((r) => typeof r.playerId === "number").map((r) => String(r.playerId));
}

export async function loadLeaders(date: string): Promise<Leaders> {
  const season = seasonId(date);
  const out = {} as Leaders;
  for (const market of Object.keys(LEADER_SORT) as LeaderMarket[]) {
    const sort = encodeURIComponent(JSON.stringify([{ property: LEADER_SORT[market], direction: "DESC" }]));
    const exp = encodeURIComponent(`seasonId=${season} and gameTypeId=2`);
    const url = `https://api.nhle.com/stats/rest/en/skater/summary?isAggregate=false&isGame=false&sort=${sort}&start=0&limit=${LEADER_COUNT}&cayenneExp=${exp}`;
    out[market] = parseLeaderRows(await getJson(url)).slice(0, LEADER_COUNT);
  }
  return out;
}

/** Average time on ice per game, in minutes, by player key, for every NHL skater this season. */
export function parseToi(json: unknown): Map<string, number> {
  const out = new Map<string, number>();
  const rows = typeof json === "object" && json !== null && Array.isArray((json as { data?: unknown }).data) ? ((json as { data: unknown[] }).data) : [];
  for (const r of rows) {
    if (typeof r !== "object" || r === null) continue;
    const o = r as Record<string, unknown>;
    const name = typeof o.skaterFullName === "string" ? o.skaterFullName : "";
    const secs = typeof o.timeOnIcePerGame === "number" ? o.timeOnIcePerGame : 0;
    if (name && secs > 0) out.set(boxNameKey(name), Math.round((secs / 60) * 10) / 10);
  }
  return out;
}

export async function loadNhlToi(date: string): Promise<Map<string, number>> {
  const y = Number(date.slice(0, 4));
  const start = Number(date.slice(5, 7)) >= 9 ? y : y - 1;
  const season = `${start}${start + 1}`;
  const out = new Map<string, number>();
  // The service hands back 100 rows at a time, so page through until a page comes back short.
  for (let start = 0; start < 1500; start += 100) {
    const url = `https://api.nhle.com/stats/rest/en/skater/timeonice?isAggregate=false&isGame=false&limit=100&start=${start}&sort=${encodeURIComponent("timeOnIcePerGame")}&cayenneExp=${encodeURIComponent(`seasonId=${season} and gameTypeId=2`)}`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`NHL stats ${res.status}`);
    const page = parseToi(await res.json());
    for (const [k, v] of page) out.set(k, v);
    if (page.size < 100) break;
  }
  return out;
}

export interface NhlAvg { key: string; games: number; sog: number; points: number; goals: number; assists: number }

/** Per-game averages for every NHL skater this season. */
export async function loadNhlSeasonAverages(date: string): Promise<NhlAvg[]> {
  const y = Number(date.slice(0, 4));
  const start0 = Number(date.slice(5, 7)) >= 9 ? y : y - 1;
  const out: NhlAvg[] = [];
  for (let start = 0; start < 1500; start += 100) {
    const url = `https://api.nhle.com/stats/rest/en/skater/summary?isAggregate=false&isGame=false&limit=100&start=${start}&sort=${encodeURIComponent("points")}&cayenneExp=${encodeURIComponent(`seasonId=${start0}${start0 + 1} and gameTypeId=2`)}`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`NHL stats ${res.status}`);
    const json = (await res.json()) as { data?: Array<Record<string, unknown>> };
    const rows = json.data ?? [];
    for (const r of rows) {
      const n = (k: string): number => (typeof r[k] === "number" ? (r[k] as number) : 0);
      const gp = n("gamesPlayed");
      const name = typeof r.skaterFullName === "string" ? r.skaterFullName : "";
      if (!name || gp <= 0) continue;
      out.push({ key: boxNameKey(name), games: gp, sog: n("shots") / gp, points: n("points") / gp, goals: n("goals") / gp, assists: n("assists") / gp });
    }
    if (rows.length < 100) break;
  }
  return out;
}
