import { americanToDecimal, decimalToAmerican } from "./odds";

export interface Leg {
  id: string;
  label: string;
  /** Game key, for example "2026-11-20-CHA-ATL". Legs sharing a key are correlated. */
  game: string;
  /** Model probability that this leg wins. */
  prob: number;
  /** American odds for the leg. */
  odds: number;
}

export interface Ticket {
  legs: Leg[];
  decimal: number;
  american: number;
  /** Product of leg probabilities. Only exact when the legs are independent. */
  jointProb: number;
  /** Expected profit per unit staked, assuming independence. */
  ev: number;
  /** True when two legs share a game. The joint probability is then not trustworthy. */
  sameGame: boolean;
}

export interface TicketRules {
  /** Lowest acceptable combined price. +100 is decimal 2.0. */
  minAmerican: number;
  maxAmerican?: number;
  minLegs: number;
  maxLegs: number;
  allowSameGame: boolean;
  /** How many tickets to return. */
  top: number;
}

export const PLUS_100_RULES: TicketRules = {
  minAmerican: 100,
  minLegs: 2,
  maxLegs: 3,
  allowSameGame: false,
  top: 5,
};

export function parlayDecimal(legs: Leg[]): number {
  return legs.reduce((acc, l) => acc * americanToDecimal(l.odds), 1);
}

function makeTicket(legs: Leg[]): Ticket {
  const decimal = parlayDecimal(legs);
  const jointProb = legs.reduce((acc, l) => acc * l.prob, 1);
  const games = new Set(legs.map((l) => l.game));
  return {
    legs,
    decimal,
    american: decimalToAmerican(decimal),
    jointProb,
    ev: jointProb * (decimal - 1) - (1 - jointProb),
    sameGame: games.size < legs.length,
  };
}

/**
 * Search combinations of legs for tickets that pay at least the target price, then rank by expected value.
 * Legs from the same game are excluded by default because their outcomes are correlated.
 * Input is capped so the search stays fast.
 */
export function buildTickets(legs: Leg[], rules: TicketRules = PLUS_100_RULES, maxInput = 60): Ticket[] {
  const pool = legs.filter((l) => l.prob > 0 && l.prob < 1).slice(0, maxInput);
  const minDecimal = americanToDecimal(rules.minAmerican);
  const maxDecimal = rules.maxAmerican != null ? americanToDecimal(rules.maxAmerican) : Infinity;
  const out: Ticket[] = [];

  const walk = (start: number, chosen: Leg[]) => {
    if (chosen.length >= rules.minLegs) {
      const t = makeTicket(chosen);
      if (t.decimal >= minDecimal && t.decimal <= maxDecimal && (rules.allowSameGame || !t.sameGame)) out.push(t);
    }
    if (chosen.length === rules.maxLegs) return;
    for (let i = start; i < pool.length; i++) {
      const leg = pool[i]!;
      if (!rules.allowSameGame && chosen.some((c) => c.game === leg.game)) continue;
      walk(i + 1, [...chosen, leg]);
    }
  };
  walk(0, []);

  return out.sort((a, b) => b.ev - a.ev).slice(0, rules.top);
}
