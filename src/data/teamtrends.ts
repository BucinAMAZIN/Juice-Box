import { normalizeTeam } from "./linemate";
import { type TeamTrend, type TrendMarket, TREND_MARKETS } from "../engine/teamtrends";

const BASE = "https://api.linemate.io/api";
const PAGE = 50;
const MAX_PAGES = 20;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Price at exactly this line for one book and side, or null. */
function priceAt(books: unknown, book: string, side: string, line: number): { american: number; sid?: string } | null {
  const b = isObj(books) && isObj(books[book]) ? (books[book] as Obj)[side] : null;
  if (!isObj(b)) return null;
  const rungs = [b.current, ...(isObj(b.alternates) ? Object.values(b.alternates) : [])];
  for (const r of rungs) {
    if (!isObj(r) || num(r.value) == null || Math.abs((r.value as number) - line) > 1e-9) continue;
    const american = isObj(r.odds) ? num(r.odds.american) : null;
    if (american == null || american === 0) continue;
    const sid = isObj(r.operatorData) && (typeof r.operatorData.selectionId === "string" || typeof r.operatorData.selectionId === "number") ? String(r.operatorData.selectionId) : undefined;
    return { american, ...(sid ? { sid } : {}) };
  }
  return null;
}

export function parseTeamRow(raw: unknown, sport: TeamTrend["sport"]): TeamTrend | null {
  if (!isObj(raw) || raw.type !== "team") return null;
  const market = isObj(raw.market) ? raw.market : null;
  const name = market && typeof market.name === "string" ? market.name : "";
  if (!(TREND_MARKETS as string[]).includes(name)) return null;
  const team = isObj(raw.team) && typeof raw.team.code === "string" ? raw.team.code : "";
  const opponent = isObj(raw.opposingTeam) && typeof raw.opposingTeam.code === "string" ? raw.opposingTeam.code : "";
  const outcome = raw.outcome;
  const line = num(raw.line);
  if (!team || !opponent || (outcome !== "cover" && outcome !== "over" && outcome !== "under") || line == null || typeof raw.gameId !== "string" || typeof raw.timestamp !== "string") return null;
  let hits = 0, games = 0;
  let h2h: TeamTrend["h2h"], split: TeamTrend["split"];
  const atHome = raw.home === true;
  for (const s of Array.isArray(raw.signals) ? raw.signals : []) {
    if (!isObj(s) || !isObj(s.hitRecord)) continue;
    const g = num(s.hitRecord.games), h = num(s.hitRecord.hits);
    if (g == null || h == null) continue;
    if (s.type === "RECENT_FORM") { games = g; hits = h; }
    else if (s.type === "HEAD_TO_HEAD") h2h = { games: g, hits: h };
    else if (s.type === (atHome ? "HOME_SPLIT" : "AWAY_SPLIT")) split = { games: g, hits: h };
  }
  const side = outcome;
  const books = market!.books;
  const hr = priceAt(books, "hardrock", side, line);
  let best: { american: number; book: string } | null = null;
  if (!hr && isObj(books)) {
    for (const book of Object.keys(books)) {
      const p = priceAt(books, book, side, line);
      if (p && (!best || p.american > best.american)) best = { american: p.american, book };
    }
  }
  const t: TeamTrend = {
    id: `${raw.gameId}|${team}|${name}|${side}|${line}`,
    sport,
    gameId: raw.gameId,
    start: raw.timestamp,
    team: normalizeTeam(team),
    opponent: normalizeTeam(opponent),
    home: atHome,
    market: name as TrendMarket,
    side,
    line,
    hits,
    games,
  };
  if (isObj(raw.team) && typeof raw.team.name === "string") t.teamName = raw.team.name;
  if (h2h) t.h2h = h2h;
  if (split) t.split = split;
  if (hr) { t.price = hr.american; t.book = "Hard Rock"; if (hr.sid) t.sid = hr.sid; }
  else if (best) { t.price = best.american; t.book = best.book; }
  return t;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0", accept: "application/json", origin: "https://linemate.io", referer: "https://linemate.io/" } });
  if (!res.ok) throw new Error(`Linemate ${res.status}`);
  return res.json();
}

/** Every team trend Linemate lists for a sport, main and alternate lines, one row per team, market, side and line. */
export async function loadTeamTrends(sport: TeamTrend["sport"]): Promise<TeamTrend[]> {
  const out = new Map<string, TeamTrend>();
  let failures = 0;
  for (const market of TREND_MARKETS) {
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const json = await getJson(`${BASE}/${sport}/v1/trends/straights?limit=${PAGE}&offset=${page * PAGE}&markets=${market}&lineTypes=ALTERNATE&lineTypes=MAIN`);
        const rows = Array.isArray(json) ? json : [];
        for (const r of rows) {
          const t = parseTeamRow(r, sport);
          if (t) out.set(t.id, t);
        }
        if (rows.length < PAGE) break;
      }
    } catch {
      failures++;
    }
  }
  if (failures === TREND_MARKETS.length) throw new Error("every market request failed");
  return [...out.values()];
}
