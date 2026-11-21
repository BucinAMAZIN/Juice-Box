/** College football lines and scores from ESPN: the scoreboard for games ahead, the core odds API for lines on games already played. */
export const NCAA_SITE = "https://site.api.espn.com/apis/site/v2/sports/football/college-football";
export const NCAA_CORE = "https://sports.core.api.espn.com/v2/sports/football/leagues/college-football";

export interface NcaaLine {
  /** The favorite's team code. */
  fav: string;
  /** Points the favorite gives, as a positive number. */
  spread: number;
  total: number;
}

export interface NcaaGame {
  id: string;
  start: string;
  state: "pre" | "in" | "post";
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  line: NcaaLine | null;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const numOf = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** ESPN writes a line as "AUB -48.5". "EVEN" and "OFF" carry no favorite. */
export function parseLine(details: unknown, overUnder: unknown): NcaaLine | null {
  const m = typeof details === "string" ? /^(\S+)\s+([+-]?\d+(?:\.\d+)?)$/.exec(details.trim()) : null;
  const total = numOf(overUnder);
  if (!m || total == null || total <= 0) return null;
  const n = Number(m[2]);
  if (n >= 0) return null;
  return { fav: m[1]!, spread: -n, total };
}

export function parseGame(raw: unknown): NcaaGame | null {
  if (!isObj(raw) || typeof raw.id !== "string") return null;
  const comp = Array.isArray(raw.competitions) && isObj(raw.competitions[0]) ? raw.competitions[0] : null;
  if (!comp || !Array.isArray(comp.competitors)) return null;
  const teams: unknown[] = comp.competitors;
  const side = (which: string): Obj | null => teams.find((c): c is Obj => isObj(c) && c.homeAway === which) ?? null;
  const home = side("home");
  const away = side("away");
  const code = (c: Obj | null): string => (c && isObj(c.team) && typeof c.team.abbreviation === "string" ? c.team.abbreviation : "");
  if (!home || !away || !code(home) || !code(away)) return null;
  const type = isObj(raw.status) && isObj(raw.status.type) ? raw.status.type : {};
  const state = type.state === "post" && type.completed !== false ? "post" : type.state === "in" ? "in" : "pre";
  const odds = Array.isArray(comp.odds) && isObj(comp.odds[0]) ? comp.odds[0] : null;
  return {
    id: raw.id,
    start: typeof raw.date === "string" ? raw.date : "",
    state,
    home: code(home),
    away: code(away),
    homeScore: numOf(home.score),
    awayScore: numOf(away.score),
    line: odds ? parseLine(odds.details, odds.overUnder) : null,
  };
}

/** The closing line from the core odds API: the first provider that gives both a favorite and a total. */
export function pickLine(json: unknown): NcaaLine | null {
  const items = isObj(json) && Array.isArray(json.items) ? json.items : [];
  const lines = items.filter(isObj).map((i) => ({ id: isObj(i.provider) ? String(i.provider.id) : "", line: parseLine(i.details, i.overUnder) })).filter((x) => x.line);
  return (lines.find((x) => x.id === "58") ?? lines[0])?.line ?? null;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0", accept: "application/json" } });
  if (!res.ok) throw new Error(`ESPN ${res.status} for ${url}`);
  return res.json();
}

/** Every FBS game in a date range, written as YYYYMMDD or YYYYMMDD-YYYYMMDD. */
export async function loadBoard(range: string): Promise<NcaaGame[]> {
  const json = await getJson(`${NCAA_SITE}/scoreboard?dates=${range}&groups=80&limit=400`);
  const events = isObj(json) && Array.isArray(json.events) ? json.events : [];
  return events.map(parseGame).filter((g): g is NcaaGame => g !== null);
}

export async function loadClosingLine(id: string): Promise<NcaaLine | null> {
  try {
    return pickLine(await getJson(`${NCAA_CORE}/events/${id}/competitions/${id}/odds`));
  } catch {
    return null;
  }
}
