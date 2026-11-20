import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { autoGrade, easternDate, matchGame, statFor, type GradeDeps } from "../src/data/autograde";
import { Ledger, type KeyValueStore } from "../src/data/ledger";
import { parseBoxscore, parseSchedule } from "../src/data/nhl";

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

function store(): KeyValueStore {
  let v: string | null = null;
  return { getItem: () => v, setItem: (_k, x) => void (v = x) };
}

const deps: GradeDeps = {
  loadSchedule: async (date) => parseSchedule(fixture("schedule.sample.json"), date),
  loadBoxscore: async () => parseBoxscore(fixture("boxscore.sample.json")),
};

const base = {
  gameStart: "2026-11-21T00:00:00Z",
  player: "A. DeBrincat",
  team: "DET",
  opponent: "VAN",
  market: "sog" as const,
  line: 3.5,
  side: "over" as const,
  odds: 100,
  book: "manual",
  modelProb: 0.58,
  fairProb: null,
  units: 1,
};

describe("auto-grading", () => {
  it("maps markets to stats", () => {
    const box = parseBoxscore(fixture("boxscore.sample.json"))!;
    const p = box.players[0]!;
    expect(statFor(p, "sog")).toBe(5);
    expect(statFor(p, "points")).toBe(2);
    expect(statFor(p, "saves")).toBeNull();
  });

  it("matches a game from either side and converts to Eastern dates", () => {
    const games = parseSchedule(fixture("schedule.sample.json"), "2026-11-20");
    expect(matchGame(games, "VAN", "DET")?.id).toBe(2026020301);
    expect(matchGame(games, "TOR", "DET")).toBeUndefined();
    expect(easternDate("2026-11-21T00:00:00Z")).toBe("2026-11-20");
  });

  it("grades a final game from the boxscore and keeps the closing price", async () => {
    const ledger = new Ledger(store(), () => new Date("2026-11-20T20:00:00Z"));
    const pick = ledger.addPick(base);
    ledger.recordClose(pick.id, -120);
    const out = await autoGrade(ledger, deps, new Date("2026-11-21T04:00:00Z"));
    expect(out.graded).toBe(1);
    expect(ledger.grades[0]).toMatchObject({ actual: 5, outcome: "win", closeOdds: -120 });
  });

  it("leaves a pick alone when the game has not started, the name is wrong, or the game is not final", async () => {
    const ledger = new Ledger(store(), () => new Date("2026-11-20T20:00:00Z"));
    ledger.addPick(base);
    ledger.addPick({ ...base, player: "Nobody Real" });

    const early = await autoGrade(ledger, deps, new Date("2026-11-20T21:00:00Z"));
    expect(early.graded).toBe(0);
    expect(early.skipped[0]!.reason).toMatch(/not started/);

    const wrongName = await autoGrade(ledger, deps, new Date("2026-11-21T04:00:00Z"));
    expect(wrongName.graded).toBe(1);
    expect(wrongName.skipped[0]!.reason).toMatch(/not found in boxscore/);

    const live: GradeDeps = {
      ...deps,
      loadBoxscore: async () => ({ ...parseBoxscore(fixture("boxscore.sample.json"))!, final: false }),
    };
    const notFinal = await autoGrade(ledger, live, new Date("2026-11-21T04:00:00Z"));
    expect(notFinal.graded).toBe(0);
    expect(notFinal.skipped[0]!.reason).toMatch(/not final/);
  });

  it("reports a failed lookup instead of throwing", async () => {
    const ledger = new Ledger(store(), () => new Date("2026-11-20T20:00:00Z"));
    ledger.addPick(base);
    const broken: GradeDeps = { ...deps, loadSchedule: async () => Promise.reject(new Error("NHL API 503")) };
    const out = await autoGrade(ledger, broken, new Date("2026-11-21T04:00:00Z"));
    expect(out.graded).toBe(0);
    expect(out.skipped[0]!.reason).toBe("NHL API 503");
  });
});
