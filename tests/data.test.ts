import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gradePick } from "../src/core/grade";
import { Ledger, type KeyValueStore } from "../src/data/ledger";
import { findPlayer, nameKey, parseBoxscore, parseSchedule, toiToMinutes } from "../src/data/nhl";
import { parseQuote, parseQuotes } from "../src/data/quote";

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

function memoryStore(): KeyValueStore & { dump(): string | null } {
  let value: string | null = null;
  return {
    getItem: () => value,
    setItem: (_k, v) => {
      value = v;
    },
    dump: () => value,
  };
}

describe("NHL parsers", () => {
  it("reads the games for one date and skips malformed rows", () => {
    const games = parseSchedule(fixture("schedule.sample.json"), "2026-11-20");
    expect(games.map((g) => g.id)).toEqual([2026020301, 2026020302]);
    expect(games[0]).toMatchObject({ away: "DET", home: "VAN", state: "FUT" });
    expect(parseSchedule(fixture("schedule.sample.json"), "2026-12-25")).toEqual([]);
  });

  it("returns nothing for garbage instead of throwing", () => {
    expect(parseSchedule(null, "2026-11-20")).toEqual([]);
    expect(parseSchedule({ gameWeek: "nope" }, "2026-11-20")).toEqual([]);
    expect(parseBoxscore(null)).toBeNull();
    expect(parseBoxscore({ id: 1 })).toBeNull();
  });

  it("reads player lines, skips goalies and nameless rows", () => {
    const box = parseBoxscore(fixture("boxscore.sample.json"))!;
    expect(box.final).toBe(true);
    expect(box.players).toHaveLength(4);
    const dbc = findPlayer(box, "a. debrincat")!;
    expect(dbc).toMatchObject({ team: "DET", opponent: "VAN", sog: 5, points: 2 });
    expect(dbc.toiMinutes).toBeCloseTo(19.2, 5);
    expect(box.players.some((p) => p.position === "G")).toBe(false);
  });

  it("converts time on ice and normalizes names", () => {
    expect(toiToMinutes("18:30")).toBe(18.5);
    expect(toiToMinutes("--")).toBe(0);
    expect(nameKey("  Tomáš  Hertl ")).toBe("tomas hertl");
  });
});

describe("quote parser", () => {
  it("parses two-sided and one-sided quotes", () => {
    expect(parseQuote("Alex DeBrincat 3.5 o+100 u-130")).toEqual({ player: "Alex DeBrincat", line: 3.5, overOdds: 100, underOdds: -130 });
    expect(parseQuote("Kyle Connor 2.5 over -140")).toEqual({ player: "Kyle Connor", line: 2.5, overOdds: -140 });
    expect(parseQuote("Matt Boldy 3.5 u-105")).toEqual({ player: "Matt Boldy", line: 3.5, underOdds: -105 });
  });

  it("rejects lines with no price", () => {
    expect(parseQuote("Matt Boldy 3.5")).toBeNull();
    expect(parseQuote("hello")).toBeNull();
  });

  it("parses a pasted block and reports what it could not read", () => {
    const { quotes, rejected } = parseQuotes("Kyle Connor 2.5 o-140 u+115\n\nnot a line\nDylan Guenther 3 o+110");
    expect(quotes).toHaveLength(2);
    expect(rejected).toEqual(["not a line"]);
  });
});

describe("ledger", () => {
  const base = {
    gameStart: "2026-11-21T00:00:00Z",
    player: "Alex DeBrincat",
    team: "DET",
    opponent: "VAN",
    market: "sog" as const,
    line: 3.5,
    side: "over" as const,
    odds: 100,
    book: "manual",
    modelProb: 0.58,
    fairProb: 0.5,
    units: 1,
  };

  it("logs a pick with a timestamp and freezes it", () => {
    const ledger = new Ledger(memoryStore(), () => new Date("2026-11-20T20:00:00Z"));
    const pick = ledger.addPick(base);
    expect(pick.createdAt).toBe("2026-11-20T20:00:00.000Z");
    expect(Object.isFrozen(pick)).toBe(true);
    expect(() => {
      (pick as { odds: number }).odds = 500;
    }).toThrow();
  });

  it("refuses a pick after puck drop", () => {
    const ledger = new Ledger(memoryStore(), () => new Date("2026-11-21T00:00:01Z"));
    expect(() => ledger.addPick(base)).toThrow(/already started/);
  });

  it("makes grades write-once and blocks closing prices after grading", () => {
    const ledger = new Ledger(memoryStore(), () => new Date("2026-11-20T20:00:00Z"));
    const pick = ledger.addPick(base);
    ledger.recordClose(pick.id, -110);
    ledger.addGrade(gradePick(pick, 5, ledger.closeFor(pick.id)));
    expect(ledger.ungraded()).toHaveLength(0);
    expect(() => ledger.addGrade(gradePick(pick, 0, undefined))).toThrow(/already graded/);
    expect(() => ledger.recordClose(pick.id, -200)).toThrow(/already graded/);
    expect(ledger.grades[0]).toMatchObject({ outcome: "win", closeOdds: -110 });
  });

  it("persists and reloads, and survives corrupt storage", () => {
    const store = memoryStore();
    const a = new Ledger(store, () => new Date("2026-11-20T20:00:00Z"));
    a.addPick(base);
    expect(new Ledger(store).picks).toHaveLength(1);
    const broken: KeyValueStore = { getItem: () => "{not json", setItem: () => undefined };
    expect(new Ledger(broken).picks).toHaveLength(0);
  });

  it("rejects unknown pick ids", () => {
    const ledger = new Ledger(memoryStore());
    expect(() => ledger.recordClose("nope", -110)).toThrow(/Unknown pick/);
  });
});
