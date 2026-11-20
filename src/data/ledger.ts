import type { Grade, Pick } from "../core/types";

/** The slice of Storage we use, so tests can pass a plain in-memory object. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface LedgerData {
  version: 1;
  picks: Pick[];
  grades: Grade[];
  /** Closing prices captured near puck drop, by pick id. */
  closes: Record<string, number>;
}

const KEY = "juice-box:ledger";

function empty(): LedgerData {
  return { version: 1, picks: [], grades: [], closes: {} };
}

/**
 * Append-only record of picks and grades. A pick cannot be edited or removed once logged, and it
 * cannot be logged after its game has started. That is the whole point: the record is checkable.
 */
export class Ledger {
  private data: LedgerData;

  constructor(
    private readonly store: KeyValueStore,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.data = this.load();
  }

  private load(): LedgerData {
    try {
      const raw = this.store.getItem(KEY);
      if (!raw) return empty();
      const parsed = JSON.parse(raw) as Partial<LedgerData>;
      if (parsed.version !== 1 || !Array.isArray(parsed.picks) || !Array.isArray(parsed.grades)) return empty();
      return { version: 1, picks: parsed.picks, grades: parsed.grades, closes: parsed.closes ?? {} };
    } catch {
      return empty();
    }
  }

  private save(): void {
    this.store.setItem(KEY, JSON.stringify(this.data));
  }

  get picks(): readonly Pick[] {
    return this.data.picks;
  }

  get grades(): readonly Grade[] {
    return this.data.grades;
  }

  ungraded(): Pick[] {
    const done = new Set(this.data.grades.map((g) => g.pickId));
    return this.data.picks.filter((p) => !done.has(p.id));
  }

  closeFor(pickId: string): number | undefined {
    return this.data.closes[pickId];
  }

  /** Log a pick. Stamps createdAt now, and refuses a game that has already started. */
  addPick(input: Omit<Pick, "id" | "createdAt">): Pick {
    const now = this.now();
    if (now.getTime() >= Date.parse(input.gameStart)) {
      throw new Error("Game has already started. Picks must be logged before puck drop.");
    }
    const pick: Pick = Object.freeze({
      ...input,
      id: `${now.getTime().toString(36)}-${this.data.picks.length + 1}`,
      createdAt: now.toISOString(),
    });
    this.data.picks.push(pick);
    this.save();
    return pick;
  }

  /** Capture the closing price. Allowed any time before the pick is graded. */
  recordClose(pickId: string, american: number): void {
    if (!this.data.picks.some((p) => p.id === pickId)) throw new Error(`Unknown pick ${pickId}`);
    if (this.data.grades.some((g) => g.pickId === pickId)) throw new Error("Pick is already graded.");
    this.data.closes[pickId] = american;
    this.save();
  }

  /** Grades are write-once. */
  addGrade(grade: Grade): void {
    if (!this.data.picks.some((p) => p.id === grade.pickId)) throw new Error(`Unknown pick ${grade.pickId}`);
    if (this.data.grades.some((g) => g.pickId === grade.pickId)) throw new Error("Pick is already graded.");
    this.data.grades.push(Object.freeze({ ...grade }));
    this.save();
  }

  /** Full backup as JSON text. */
  exportJson(): string {
    return JSON.stringify(this.data, null, 2);
  }
}
