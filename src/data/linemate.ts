/**
 * Linemate public data adapter (api.linemate.io). The site's own pages call this JSON feed without a
 * login, so the scheduled run needs no credentials. Parsers are tolerant: odd rows are skipped.
 * The picks engine only hands out a pick when Linemate has a matching offer with a price.
 */
import { nameKey } from "./nhl";

export const LM_BASE = "https://api.linemate.io/api";
export const LM_PAGE = 50;
export const LM_MAX_PAGES = 12;

export type LmSport = "nba" | "nfl" | "nhl" | "mlb";

/** Linemate's own market names, mapped to ours. Anything not listed is ignored. */
export const LM_MARKETS: Record<string, string> = {
  SHOTS_ON_GOAL: "sog",
  POINTS: "points",
  ASSISTS: "assists",
  GOALS: "goals",
  ANYTIME_GOAL_SCORER: "goals",
};

/** Linemate team codes that differ from the league's own. */
export const LM_TEAM_ALIAS: Record<string, string> = {
  WPJ: "WPG", FLO: "FLA", BRO: "BKN", OKL: "OKC", GS: "GSW", NY: "NYK", SA: "SAS", NO: "NOP", UTAH: "UTA", WSH: "WAS",
};

export interface Rung {
  /** Over this value, for example 2.5 for "3+". */
  value: number;
  american: number;
  book: string;
  /** The book's own selection id, when Linemate gives one. Hard Rock links are built from it. */
  sid?: string;
}

/** The book the picks are priced at and linked to. */
export const PRICE_BOOK = "hardrock";

export interface Offer {
  sport: LmSport;
  gameId: string;
  startUtc: string;
  fullName: string;
  /** "k connor": first initial plus last name, for matching against box-score names. */
  key: string;
  team: string;
  opponent: string;
  /** Linemate market name, for example "SHOTS_ON_GOAL". */
  marketName: string;
  side: "over" | "under";
  /** Best price per line across books, current line and alternates together, lowest line first. */
  ladder: Rung[];
  /** Hard Rock's own price per line with its selection id, lowest line first. */
  hr: Rung[];
  /** Linemate's last-N hit record for the featured line, when it gave one. */
  recent?: { games: number; hits: number };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

export function normalizeTeam(code: string): string {
  return LM_TEAM_ALIAS[code] ?? code;
}

export function playerKey(first: string, last: string): string {
  const initial = nameKey(first).charAt(0);
  return `${initial} ${nameKey(last).replace(/ /g, "")}`;
}

/** The comparable key for a box-score style name such as "K. Connor". */
export function boxNameKey(name: string): string {
  const parts = nameKey(name).split(" ").filter(Boolean);
  if (parts.length < 2) return nameKey(name);
  return `${parts[0]!.charAt(0)} ${parts.slice(1).join("")}`;
}

function addRung(best: Map<number, Rung>, value: unknown, odds: unknown, book: string, data?: unknown) {
  const v = num(value);
  const american = isObj(odds) ? num(odds.american) : null;
  if (v == null || american == null || american === 0) return;
  const cur = best.get(v);
  const sid = isObj(data) && (typeof data.selectionId === "string" || typeof data.selectionId === "number") ? String(data.selectionId) : undefined;
  // Higher American price is better for the bettor, across the plus/minus boundary too.
  if (!cur || american > cur.american) best.set(v, { value: v, american, book, ...(sid ? { sid } : {}) });
}

export function parseOffer(raw: unknown, sport: LmSport): Offer | null {
  if (!isObj(raw) || raw.type !== "player") return null;
  const market = isObj(raw.market) ? raw.market : null;
  const marketName = market ? str(market.name) : "";
  const player = isObj(raw.player) ? raw.player : null;
  const team = isObj(raw.team) ? str(raw.team.code) : "";
  const opponent = isObj(raw.opposingTeam) ? str(raw.opposingTeam.code) : "";
  if (!market || !player || !marketName || !team) return null;
  const side = raw.outcome === "under" ? "under" : "over";
  const books = isObj(market.books) ? market.books : {};
  const best = new Map<number, Rung>();
  const hrBest = new Map<number, Rung>();
  for (const [book, entry] of Object.entries(books)) {
    const e = isObj(entry) ? entry[side] : null;
    if (!isObj(e)) continue;
    const into = book === PRICE_BOOK ? [best, hrBest] : [best];
    for (const target of into) {
      if (isObj(e.current)) addRung(target, e.current.value, e.current.odds, book, e.current.operatorData);
      if (isObj(e.alternates)) for (const alt of Object.values(e.alternates)) if (isObj(alt)) addRung(target, alt.value, alt.odds, book, alt.operatorData);
    }
  }
  if (best.size === 0) return null;
  let recent: Offer["recent"];
  if (Array.isArray(raw.signals)) {
    for (const s of raw.signals) {
      if (isObj(s) && s.type === "RECENT_FORM" && isObj(s.hitRecord)) {
        const games = num(s.hitRecord.games);
        const hits = num(s.hitRecord.hits);
        if (games != null && hits != null) recent = { games, hits };
      }
    }
  }
  const out: Offer = {
    sport,
    gameId: str(raw.gameId),
    startUtc: str(raw.timestamp),
    fullName: str(player.fullName),
    key: playerKey(str(player.firstName), str(player.lastName)),
    team: normalizeTeam(team),
    opponent: normalizeTeam(opponent),
    marketName,
    side,
    ladder: [...best.values()].sort((a, b) => a.value - b.value),
    hr: [...hrBest.values()].sort((a, b) => a.value - b.value),
  };
  if (recent) out.recent = recent;
  return out;
}

export function parseOffers(json: unknown, sport: LmSport): Offer[] {
  if (!Array.isArray(json)) throw new Error("Unexpected Linemate response");
  return json.map((r) => parseOffer(r, sport)).filter((o): o is Offer => o !== null);
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0", accept: "application/json", origin: "https://linemate.io", referer: "https://linemate.io/" },
  });
  if (!res.ok) throw new Error(`Linemate ${res.status} for ${url}`);
  return res.json();
}

export function mergeLadders(a: Rung[], b: Rung[]): Rung[] {
  const best = new Map<number, Rung>();
  for (const r of [...a, ...b]) {
    const cur = best.get(r.value);
    if (!cur || r.american > cur.american) best.set(r.value, r);
  }
  return [...best.values()].sort((x, y) => x.value - y.value);
}

/** Every offer Linemate lists for a sport, paging through its trends feed. */
export async function loadOffers(sport: LmSport, markets: string[]): Promise<Offer[]> {
  const out: Offer[] = [];
  const seen = new Map<string, Offer>();
  let failures = 0;
  for (const market of markets) {
    try {
      for (let page = 0; page < LM_MAX_PAGES; page++) {
        const url = `${LM_BASE}/${sport}/v1/trends/straights?limit=${LM_PAGE}&offset=${page * LM_PAGE}&markets=${market}`;
        const json = await getJson(url);
        const rows = Array.isArray(json) ? json : [];
        for (const o of parseOffers(rows, sport)) {
          const id = `${o.gameId}|${o.key}|${o.marketName}|${o.side}`;
          const prior = seen.get(id);
          if (!prior) {
            seen.set(id, o);
            out.push(o);
          } else {
            prior.ladder = mergeLadders(prior.ladder, o.ladder);
            prior.hr = mergeLadders(prior.hr, o.hr);
            prior.recent ??= o.recent;
          }
        }
        if (rows.length < LM_PAGE) break;
      }
    } catch {
      failures++;
    }
  }
  if (failures === markets.length) throw new Error("every market request failed");
  return out;
}

/** The best price for "value or more" at exactly this line, or null when Linemate has no such rung. */
export function rungAt(offer: Offer, line: number): Rung | null {
  return offer.ladder.find((r) => Math.abs(r.value - line) < 1e-9) ?? null;
}

/** Hard Rock's price for "over this line", or null when Hard Rock does not list it. */
export function hrRungAt(offer: Offer, line: number): Rung | null {
  return offer.hr.find((r) => Math.abs(r.value - line) < 1e-9) ?? null;
}

export interface OfferIndex {
  find(sport: LmSport, key: string, team: string, marketName: string): Offer | null;
  size: number;
}

/** Look offers up by player, market and team. Without a team match, a single unambiguous name still counts. */
export function indexOffers(offers: Offer[]): OfferIndex {
  const byKey = new Map<string, Offer[]>();
  for (const o of offers) {
    if (o.side !== "over") continue;
    const k = `${o.sport}|${o.key}|${o.marketName}`;
    byKey.set(k, [...(byKey.get(k) ?? []), o]);
  }
  return {
    size: offers.length,
    find(sport, key, team, marketName) {
      const list = byKey.get(`${sport}|${key}|${marketName}`) ?? [];
      const exact = list.filter((o) => o.team === normalizeTeam(team));
      if (exact.length === 1) return exact[0]!;
      if (exact.length === 0 && list.length === 1) return list[0]!;
      return null;
    },
  };
}
