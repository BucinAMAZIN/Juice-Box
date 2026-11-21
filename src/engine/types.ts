import type { Sport } from "../core/potd";

export type PickKind = "potd" | "lean" | "alt" | "ticket";
export type NhlMarket = "sog" | "points" | "goals" | "assists";
/** Basketball markets. "pra" is points + rebounds + assists, "pr" points + rebounds, and so on. */
export type NbaMarket = "points" | "rebounds" | "assists" | "threes" | "pr" | "pa" | "ra" | "pra";
/** Football markets. "rushRecYds" is rushing plus receiving yards. */
export type NflMarket = "passYds" | "rushYds" | "recYds" | "receptions" | "rushRecYds";
export type PickMarket = NhlMarket | NbaMarket | NflMarket;
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
  /** Best price Linemate listed for this exact line when the pick was made, and the book offering it. */
  price?: number;
  book?: string;
  /** Model probability minus the price's implied probability. */
  edge?: number;
  note: string;
}

export interface HandedTicket {
  id: string;
  legIds: string[];
  /** Product of the leg probabilities. */
  jointProb: number;
  /** Take the ticket only if the book pays at least this price. */
  minAmerican: number;
  /** Combined price from the listed leg prices, when every leg had one. */
  priced?: number;
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
