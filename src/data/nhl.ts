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
  const key = nameKey(name);
  return box.players.find((p) => nameKey(p.name) === key);
}

async function getJson(url: string, timeoutMs = 10_000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`NHL API ${res.status} for ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function loadSchedule(date: string): Promise<ScheduledGame[]> {
  return parseSchedule(await getJson(`${NHL_BASE}/schedule/${date}`), date);
}

export async function loadBoxscore(gameId: number): Promise<Boxscore | null> {
  return parseBoxscore(await getJson(`${NHL_BASE}/gamecenter/${gameId}/boxscore`));
}
