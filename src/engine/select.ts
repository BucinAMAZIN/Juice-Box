import { atLeast } from "../core/ladder";
import { americanToDecimal, decimalToAmerican } from "../core/odds";
import type { Projection } from "./project";
import type { DayFile, HandedPick, HandedTicket, PickKind } from "./types";

export const MODEL_VERSION = "nhl-v0.1";

/** Edge the limit price must still leave, so a pick taken at its limit keeps about +2% expected value. */
export const LIMIT_EDGE = 0.02;

export const SOG_THRESHOLDS = [2, 3, 4, 5];
export const POINT_THRESHOLDS = [1];

/** Play of the day: win probability in this band, so the shortest acceptable price lands near -110 to -135. */
export const POTD_BAND: [number, number] = [0.586, 0.65];
export const LEAN_BAND: [number, number] = [0.55, 0.72];
export const TICKET_LEG_BAND: [number, number] = [0.68, 0.78];
export const MAX_LEANS = 6;
export const MAX_LEANS_PER_GAME = 2;

export interface Candidate {
  projection: Projection;
  /** "n+" threshold, for example 4 for "4+ shots". */
  threshold: number;
  line: number;
  prob: number;
}

/** Longest American price at which the bet still carries the target edge for this win probability. */
export function limitOdds(prob: number, edge = LIMIT_EDGE): number {
  const decimal = (1 + edge) / prob;
  return decimalToAmerican(Math.max(1.01, decimal));
}

export function candidatesFrom(projections: Projection[]): Candidate[] {
  const out: Candidate[] = [];
  for (const p of projections) {
    const thresholds = p.market === "sog" ? SOG_THRESHOLDS : POINT_THRESHOLDS;
    for (const threshold of thresholds) {
      out.push({ projection: p, threshold, line: threshold - 0.5, prob: atLeast(p.dist, threshold) });
    }
  }
  return out;
}

const within = (x: number, [lo, hi]: [number, number]) => x >= lo && x <= hi;

function describe(c: Candidate): string {
  const what = c.projection.market === "sog" ? "shots on goal" : "points";
  return `${c.threshold}+ ${what}`;
}

export function selectDay(
  date: string,
  candidates: Candidate[],
  now: Date,
  newId: (n: number) => string = (n) => `${date}-${n}`,
): DayFile {
  const notes: string[] = [];
  const picks: HandedPick[] = [];
  const tickets: HandedTicket[] = [];
  let counter = 0;

  const make = (c: Candidate, kind: PickKind, note: string, ticketId?: string): HandedPick => {
    const p = c.projection;
    const pick: HandedPick = {
      id: newId(++counter),
      createdAt: now.toISOString(),
      gameStart: p.gameStart,
      gameId: p.gameId,
      sport: "nhl",
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
      note,
    };
    if (ticketId) pick.ticketId = ticketId;
    picks.push(pick);
    return pick;
  };

  const used = new Set<string>();

  // Play of the day.
  const potdPool = candidates.filter((c) => within(c.prob, POTD_BAND)).sort((a, b) => b.prob - a.prob);
  const potd = potdPool[0];
  if (potd) {
    make(potd, "potd", `Play of the day: ${describe(potd)}. Take it at ${shortOdds(limitOdds(potd.prob))} or better.`);
    used.add(potd.projection.key);
  } else {
    notes.push("No play of the day: nothing landed in the probability band for a -110 to -135 price.");
  }

  // Leans: one per player, a couple per game.
  const perGame = new Map<number, number>();
  let leans = 0;
  const leanPool = candidates.filter((c) => within(c.prob, LEAN_BAND)).sort((a, b) => b.prob - a.prob);
  for (const c of leanPool) {
    if (leans >= MAX_LEANS) break;
    if (used.has(c.projection.key)) continue;
    const n = perGame.get(c.projection.gameId) ?? 0;
    if (n >= MAX_LEANS_PER_GAME) continue;
    make(c, "lean", `Lean: ${describe(c)}. Take it at ${shortOdds(limitOdds(c.prob))} or better.`);
    used.add(c.projection.key);
    perGame.set(c.projection.gameId, n + 1);
    leans++;
  }
  if (leans === 0) notes.push("No leans today.");

  // +100 tickets: two legs from different games, joint probability high enough that +100 still has an edge.
  const legs = candidates.filter((c) => within(c.prob, TICKET_LEG_BAND));
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
      if (joint >= (1 + LIMIT_EDGE) / americanToDecimal(100)) pairs.push([a, b, joint]);
    }
  }
  pairs.sort((x, y) => y[2] - x[2]);
  const usedLegPlayers = new Set<string>();
  for (const [a, b, joint] of pairs) {
    if (tickets.length >= 2) break;
    if (usedLegPlayers.has(a.projection.key) || usedLegPlayers.has(b.projection.key)) continue;
    const id = `${date}-T${tickets.length + 1}`;
    const legA = make(a, "ticket", `Ticket leg: ${describe(a)}.`, id);
    const legB = make(b, "ticket", `Ticket leg: ${describe(b)}.`, id);
    tickets.push({
      id,
      legIds: [legA.id, legB.id],
      jointProb: joint,
      minAmerican: 100,
      note: `Both legs must win. Take the ticket only if the book pays +100 or better.`,
    });
    usedLegPlayers.add(a.projection.key);
    usedLegPlayers.add(b.projection.key);
  }
  if (tickets.length === 0) notes.push("No +100 ticket cleared the bar today.");

  return { date, generatedAt: now.toISOString(), modelVersion: MODEL_VERSION, picks, tickets, notes };
}

export function shortOdds(american: number): string {
  return american > 0 ? `+${american}` : `${american}`;
}
