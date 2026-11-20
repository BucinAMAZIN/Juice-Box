export type Market = "sog" | "points" | "goals" | "assists" | "saves";
export type Side = "over" | "under";
export type Outcome = "win" | "loss" | "push";

/** A play, frozen at the moment it was logged. Never edited after creation. */
export interface Pick {
  id: string;
  /** ISO time the pick was logged. Must be before gameStart for the pick to count. */
  createdAt: string;
  /** ISO time of puck drop. */
  gameStart: string;
  player: string;
  team: string;
  opponent: string;
  market: Market;
  line: number;
  side: Side;
  /** American odds taken. */
  odds: number;
  book: string;
  /** Model's probability that this side wins, at the time of the pick. */
  modelProb: number;
  /** Book's fair probability for this side after removing the vig, if both sides were priced. */
  fairProb: number | null;
  /** Staked units. */
  units: number;
  note?: string;
}

export interface Grade {
  pickId: string;
  /** Final stat total, e.g. shots on goal. */
  actual: number;
  outcome: Outcome;
  /** Profit in units, including the stake on a loss. */
  profit: number;
  /** Closing price for the same side, if known. */
  closeOdds?: number;
  gradedAt: string;
}
