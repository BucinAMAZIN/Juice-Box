import { type League, coreUrl, leagueById, siteUrl } from "./leagues";

/** College football lines and scores from ESPN: the scoreboard for games ahead, the core odds API for lines on games already played. */
export const NCAA_SITE = "https://site.api.espn.com/apis/site/v2/sports/football/college-football";
export const NCAA_CORE = "https://sports.core.api.espn.com/v2/sports/football/leagues/college-football";

export interface NcaaLine {
  /** The favorite's team code. */
  fav: string;
  /** Points the favorite gives, as a positive number. */
  spread: number;
  total: number;
  /** Whether the home team is the favorite, from ESPN's own flags when it gives them. Team codes in the line text do not always match the scoreboard's. */
  favHome?: boolean;
}

export interface NcaaGame {
  id: string;
  start: string;
  state: "pre" | "in" | "post";
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  /** Win share of each team's record on the scoreboard, as of the game's feed. */
  homeWin?: number;
  awayWin?: number;
  line: NcaaLine | null;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const numOf = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** ESPN writes a line as "AUB -48.5". "EVEN" and "OFF" carry no favorite. */
export function parseLine(details: unknown, overUnder: unknown, odds?: unknown): NcaaLine | null {
  const m = typeof details === "string" ? /^(\S+)\s+([+-]?\d+(?:\.\d+)?)$/.exec(details.trim()) : null;
  const total = numOf(overUnder);
  if (!m || total == null || total <= 0) return null;
  const n = Number(m[2]);
  if (n >= 0) return null;
  const line: NcaaLine = { fav: m[1]!, spread: -n, total };
  if (isObj(odds)) {
    const home = isObj(odds.homeTeamOdds) ? odds.homeTeamOdds.favorite : undefined;
    const away = isObj(odds.awayTeamOdds) ? odds.awayTeamOdds.favorite : undefined;
    if (home === true && away !== true) line.favHome = true;
    else if (away === true && home !== true) line.favHome = false;
  }
  return line;
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
  const winShare = (c: Obj): number | undefined => {
    const rec = Array.isArray(c.records) && isObj(c.records[0]) && typeof c.records[0].summary === "string" ? /^(\d+)-(\d+)/.exec(c.records[0].summary) : null;
    const w = rec ? Number(rec[1]) : 0;
    const l = rec ? Number(rec[2]) : 0;
    return rec && w + l > 0 ? w / (w + l) : undefined;
  };
  const hw = winShare(home);
  const aw = winShare(away);
  return {
    ...(hw != null ? { homeWin: hw } : {}),
    ...(aw != null ? { awayWin: aw } : {}),
    id: raw.id,
    start: typeof raw.date === "string" ? raw.date : "",
    state,
    home: code(home),
    away: code(away),
    homeScore: numOf(home.score),
    awayScore: numOf(away.score),
    line: odds ? parseLine(odds.details, odds.overUnder, odds) : null,
  };
}

/** The closing line from the core odds API: the first provider that gives both a favorite and a total. */
export function pickLine(json: unknown): NcaaLine | null {
  const items = isObj(json) && Array.isArray(json.items) ? json.items : [];
  const lines = items.filter(isObj).map((i) => ({ id: isObj(i.provider) ? String(i.provider.id) : "", line: parseLine(i.details, i.overUnder, i) })).filter((x) => x.line);
  return (lines.find((x) => x.id === "58") ?? lines[0])?.line ?? null;
}

const FBS: League = leagueById("ncaaf")!;

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0", accept: "application/json" } });
  if (!res.ok) throw new Error(`ESPN ${res.status} for ${url}`);
  return res.json();
}

/** Every FBS game on one day, written YYYYMMDD. ESPN refuses date ranges, so a span is read a day at a time. */
export async function loadDay(day: string, league: League = FBS): Promise<NcaaGame[]> {
  const json = await getJson(`${siteUrl(league)}/scoreboard?dates=${day}${league.groups ? `&groups=${league.groups}` : ""}&limit=400`);
  const events = isObj(json) && Array.isArray(json.events) ? json.events : [];
  return events.map(parseGame).filter((g): g is NcaaGame => g !== null);
}

/** Every FBS game from one day to another (YYYYMMDD each, inclusive). A day that fails is skipped. */
export async function loadBoard(from: string, to: string, size = 6, league: League = FBS): Promise<NcaaGame[]> {
  const days: string[] = [];
  for (let t = Date.UTC(+from.slice(0, 4), +from.slice(4, 6) - 1, +from.slice(6, 8)); t <= Date.UTC(+to.slice(0, 4), +to.slice(4, 6) - 1, +to.slice(6, 8)); t += 86_400_000) days.push(new Date(t).toISOString().slice(0, 10).replaceAll("-", ""));
  const out: NcaaGame[][] = [];
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => { while (next < days.length) { const k = next++; out[k] = await loadDay(days[k]!, league).catch(() => []); } }));
  const byId = new Map<string, NcaaGame>();
  for (const g of out.flat()) byId.set(g.id, g);
  return [...byId.values()];
}

export async function loadClosingLine(id: string, league: League = FBS): Promise<NcaaLine | null> {
  try {
    return pickLine(await getJson(`${coreUrl(league)}/events/${id}/competitions/${id}/odds`));
  } catch {
    return null;
  }
}

/** What the book did around the total: where it opened, and the price on each side at open and close (American odds). */
export interface TotalExtras {
  openTotal: number | null;
  openOver: number | null;
  openUnder: number | null;
  closeOver: number | null;
  closeUnder: number | null;
}

const american = (v: unknown): number | null => {
  const a = isObj(v) ? v.american : v;
  const n = typeof a === "string" ? Number(a.replace("+", "")) : typeof a === "number" ? a : NaN;
  return Number.isFinite(n) ? n : null;
};

export function pickExtras(json: unknown): TotalExtras | null {
  const items = isObj(json) && Array.isArray(json.items) ? json.items.filter(isObj) : [];
  const item = items.find((i) => isObj(i.provider) && String(i.provider.id) === "58") ?? items[0];
  if (!item || !isObj(item.open) || !isObj(item.close)) return null;
  return {
    openTotal: isObj(item.open.total) ? american(item.open.total) : null,
    openOver: american(item.open.over),
    openUnder: american(item.open.under),
    closeOver: american(item.close.over),
    closeUnder: american(item.close.under),
  };
}

export async function loadExtras(id: string, league: League = FBS): Promise<TotalExtras | null> {
  try {
    return pickExtras(await getJson(`${coreUrl(league)}/events/${id}/competitions/${id}/odds`));
  } catch {
    return null;
  }
}
