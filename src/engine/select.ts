import { atLeast } from "../core/ladder";
import { americanToDecimal, decimalToAmerican, impliedProb } from "../core/odds";
import type { Projection } from "./project";
import type { DayFile, HandedPick, HandedTicket, PickKind, PickMarket } from "./types";

export const MODEL_VERSION = "nhl-v0.1";

/** Edge the limit price must still leave, so a pick taken at its limit keeps about +2% expected value. */
export const LIMIT_EDGE = 0.02;

/** Alt-line rungs per market, as "n+" thresholds. League leaders are the only players priced, so the ladders run high. */
export const THRESHOLDS: Record<PickMarket, number[]> = {
  sog: [2, 3, 4, 5, 6],
  points: [1, 2],
  goals: [1],
  assists: [1],
  rebounds: [],
  threes: [],
  pr: [],
  pa: [],
  ra: [],
  pra: [],
};

/** Play of the day: win probability in this band, so the shortest acceptable price lands near -110 to -135. */
export const POTD_BAND: [number, number] = [0.586, 0.65];
export const LEAN_BAND: [number, number] = [0.55, 0.72];
export const TICKET_LEG_BAND: [number, number] = [0.68, 0.78];
export const POTD_PRICE: [number, number] = [-135, -110];
export const MIN_EDGE = 0.02;
/** Leans never cost more than this, since ParlayBOT's heavy favorites ran well below their prices. */
export const LEAN_MAX_JUICE = -200;
/** Alt-line picks: heavy favorites on high alt lines, 3 to 4 a day. */
export const ALT_PRICE: [number, number] = [-375, -250];
export const ALT_MAX = 4;
/** Alt picks may sit a little under fair, since the user wants these shorter prices; the edge is shown on every pick. */
export const ALT_MIN_EDGE = -0.03;
export const LEAN_MIN_PROB = 0.55;
export const MAX_LEANS = 6;
export const MAX_LEANS_PER_GAME = 2;

export interface Candidate {
  projection: Projection;
  /** "n+" threshold, for example 4 for "4+ shots". */
  threshold: number;
  line: number;
  prob: number;
  /** Best Linemate price for this exact line. */
  price?: { american: number; book: string };
  /** Model probability before the history haircut, when one was applied. */
  rawProb?: number;
  /** Why the haircut was applied, in plain words. */
  adjustment?: string;
}

/** Longest American price at which the bet still carries the target edge for this win probability. */
export function limitOdds(prob: number, edge = LIMIT_EDGE): number {
  const decimal = (1 + edge) / prob;
  return decimalToAmerican(Math.max(1.01, decimal));
}

export function candidatesFrom(projections: Projection[]): Candidate[] {
  const out: Candidate[] = [];
  for (const p of projections) {
    for (const threshold of THRESHOLDS[p.market]) {
      out.push({ projection: p, threshold, line: threshold - 0.5, prob: atLeast(p.dist, threshold) });
    }
  }
  return out;
}

const within = (x: number, [lo, hi]: [number, number]) => x >= lo && x <= hi;

const WHAT: Record<PickMarket, string> = {
  sog: "shots on goal",
  points: "points",
  goals: "goals",
  assists: "assists",
  rebounds: "rebounds",
  threes: "threes",
  pr: "points + rebounds",
  pa: "points + assists",
  ra: "rebounds + assists",
  pra: "points + rebounds + assists",
};

export function describe(c: Candidate): string {
  return `${c.threshold}+ ${WHAT[c.projection.market]}`;
}

export function selectDay(
  date: string,
  candidates: Candidate[],
  now: Date,
  newId?: (n: number) => string,
  opts: { priced?: boolean; idPrefix?: string; modelVersion?: string } = {},
): DayFile {
  const priced = opts.priced === true;
  const prefix = opts.idPrefix ?? "";
  const nextId = newId ?? ((n: number) => `${date}-${prefix}${n}`);
  if (priced) candidates = candidates.filter((c) => c.price);
  const edgeOf = (c: Candidate) => c.prob - impliedProb(c.price!.american);
  const cheap = (c: Candidate) => `Take it at ${shortOdds(c.price!.american)} on ${c.price!.book} or better.`
  const notes: string[] = [];
  const picks: HandedPick[] = [];
  const tickets: HandedTicket[] = [];
  let counter = 0;

  const make = (c: Candidate, kind: PickKind, note: string, ticketId?: string): HandedPick => {
    const p = c.projection;
    const pick: HandedPick = {
      id: nextId(++counter),
      createdAt: now.toISOString(),
      gameStart: p.gameStart,
      gameId: p.gameId,
      sport: p.sport ?? "nhl",
      kind,
      player: p.player,
      team: p.team,
      opponent: p.opponent,
      market: p.market,
      line: c.line,
      side: "over",
      modelProb: c.prob,
      limitOdds: limitOdds(c.prob),
      mean: p.mean,
      ...(c.price ? { price: c.price.american, book: c.price.book, edge: c.prob - impliedProb(c.price.american) } : {}),
      note: c.adjustment ? `${note} Model ${(c.rawProb! * 100).toFixed(0)}% cut to ${(c.prob * 100).toFixed(0)}%: ${c.adjustment}.` : note,
    };
    if (ticketId) pick.ticketId = ticketId;
    picks.push(pick);
    return pick;
  };

  const used = new Set<string>();

  // Play of the day.
  const potdPool = priced
    ? candidates
        .filter((c) => c.price!.american >= POTD_PRICE[0] && c.price!.american <= POTD_PRICE[1] && edgeOf(c) >= MIN_EDGE)
        .sort((a, b) => edgeOf(b) - edgeOf(a))
    : candidates.filter((c) => within(c.prob, POTD_BAND)).sort((a, b) => b.prob - a.prob);
  const potd = potdPool[0];
  if (potd) {
    make(potd, "potd", `Play of the day: ${describe(potd)}. ${priced ? cheap(potd) : `Take it at ${shortOdds(limitOdds(potd.prob))} or better.`}`);
    used.add(potd.projection.key);
  } else {
    notes.push(priced ? "No play of the day: nothing had a real price from -110 to -135 with an edge." : "No play of the day: nothing landed in the probability band for a -110 to -135 price.");
  }

  // Leans: one per player, a couple per game.
  const perGame = new Map<number, number>();
  let leans = 0;
  const leanPool = priced
    ? candidates.filter((c) => c.price!.american >= LEAN_MAX_JUICE && edgeOf(c) >= MIN_EDGE && c.prob >= LEAN_MIN_PROB).sort((a, b) => edgeOf(b) - edgeOf(a))
    : candidates.filter((c) => within(c.prob, LEAN_BAND)).sort((a, b) => b.prob - a.prob);
  for (const c of leanPool) {
    if (leans >= MAX_LEANS) break;
    if (used.has(c.projection.key)) continue;
    const n = perGame.get(c.projection.gameId) ?? 0;
    if (n >= MAX_LEANS_PER_GAME) continue;
    make(c, "lean", `Lean: ${describe(c)}. ${priced ? cheap(c) : `Take it at ${shortOdds(limitOdds(c.prob))} or better.`}`);
    used.add(c.projection.key);
    perGame.set(c.projection.gameId, n + 1);
    leans++;
  }
  if (leans === 0) notes.push("No leans today.");

  // Alt-line picks at -250 to -375, best edge first, one per player, at most two per game.
  if (priced) {
    const altPerGame = new Map<number, number>();
    const altPool = candidates
      .filter((c) => c.price!.american >= ALT_PRICE[0] && c.price!.american <= ALT_PRICE[1] && edgeOf(c) >= ALT_MIN_EDGE)
      .sort((a, b) => edgeOf(b) - edgeOf(a));
    let alts = 0;
    for (const c of altPool) {
      if (alts >= ALT_MAX) break;
      if (used.has(c.projection.key)) continue;
      const n = altPerGame.get(c.projection.gameId) ?? 0;
      if (n >= 2) continue;
      make(c, "alt", `Alt line: ${describe(c)}. ${cheap(c)}`);
      used.add(c.projection.key);
      altPerGame.set(c.projection.gameId, n + 1);
      alts++;
    }
    if (alts === 0) notes.push("No alt lines priced -250 to -375 held up today.");
  }

  // +100 tickets: two legs from different games, joint probability high enough that +100 still has an edge.
  const legs = priced ? candidates.filter((c) => edgeOf(c) >= 0) : candidates.filter((c) => within(c.prob, TICKET_LEG_BAND));
  const best = new Map<string, Candidate>();
  for (const c of legs) {
    const cur = best.get(c.projection.key);
    if (!cur || c.prob > cur.prob) best.set(c.projection.key, c);
  }
  const pool = [...best.values()].sort((a, b) => b.prob - a.prob).slice(0, 30);
  const pairs: Array<[Candidate, Candidate, number]> = [];
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i]!;
      const b = pool[j]!;
      if (a.projection.gameId === b.projection.gameId) continue;
      const joint = a.prob * b.prob;
      if (priced) {
        const dec = americanToDecimal(a.price!.american) * americanToDecimal(b.price!.american);
        if (dec >= 2 && joint * dec >= 1 + LIMIT_EDGE) pairs.push([a, b, joint * dec]);
      } else if (joint >= (1 + LIMIT_EDGE) / americanToDecimal(100)) pairs.push([a, b, joint]);
    }
  }
  pairs.sort((x, y) => y[2] - x[2]);
  const usedLegPlayers = new Set<string>();
  for (const [a, b, joint] of pairs) {
    if (tickets.length >= 2) break;
    if (usedLegPlayers.has(a.projection.key) || usedLegPlayers.has(b.projection.key)) continue;
    const id = `${date}-${prefix}T${tickets.length + 1}`;
    const legA = make(a, "ticket", `Ticket leg: ${describe(a)}.`, id);
    const legB = make(b, "ticket", `Ticket leg: ${describe(b)}.`, id);
    const jointProb = priced ? a.prob * b.prob : joint;
    tickets.push({
      id,
      legIds: [legA.id, legB.id],
      jointProb,
      minAmerican: 100,
      ...(priced ? { priced: decimalToAmerican(americanToDecimal(a.price!.american) * americanToDecimal(b.price!.american)) } : {}),
      note: `Both legs must win. Take the ticket only if the book pays +100 or better.`,
    });
    usedLegPlayers.add(a.projection.key);
    usedLegPlayers.add(b.projection.key);
  }
  if (tickets.length === 0) notes.push(priced ? "No +100 ticket paid +100 or better with an edge." : "No +100 ticket cleared the bar today.");

  return { date, generatedAt: now.toISOString(), modelVersion: opts.modelVersion ?? MODEL_VERSION, picks, tickets, notes };
}

export function shortOdds(american: number): string {
  return american > 0 ? `+${american}` : `${american}`;
}
