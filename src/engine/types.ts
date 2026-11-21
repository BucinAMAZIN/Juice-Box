import type { Sport } from "../core/potd";

export type PickKind = "potd" | "lean" | "ticket";
export type PickMarket = "sog" | "points" | "goals" | "assists";
export type PickOutcome = "win" | "loss" | "push";

/** A pick the engine hands out. Frozen when written to the day file. */
export interface HandedPick {
  id: string;
  createdAt: string;
  gameStart: string;
  gameId: number;
  sport: Sport;
  kind: PickKind;
  player: string;
  team: string;
  opponent: string;
  market: PickMarket;
  /** Half-point line, for example 3.5. The pick is always the over, which is the same as "4+". */
  line: number;
  side: "over";
  modelProb: number;
  /** Worst American price worth taking. At a shorter price the bet has no edge by the model. */
  limitOdds: number;
  /** Projected count the probability came from. */
  mean: number;
  ticketId?: string;
  note: string;
}

export interface HandedTicket {
  id: string;
  legIds: string[];
  /** Product of the leg probabilities. */
  jointProb: number;
  /** Take the ticket only if the book pays at least this price. */
  minAmerican: number;
  note: string;
}

export interface DayFile {
  date: string;
  generatedAt: string;
  modelVersion: string;
  picks: HandedPick[];
  tickets: HandedTicket[];
  /** Why there is no play of the day or no picks, in plain words. */
  notes: string[];
}

export interface GradedPick {
  pickId: string;
  actual: number;
  outcome: PickOutcome;
  /** Profit in units at the limit price, as a stand-in for the price you took. */
  profitAtLimit: number;
}

export interface DayGrades {
  date: string;
  gradedAt: string;
  grades: GradedPick[];
}
