import { describe, expect, it } from "vitest";
import type { Boxscore, PlayerLine } from "../src/data/nhl";
import { gradeDay, mergeGrades } from "../src/engine/grade";
import { buildReport, MIN_SAMPLE } from "../src/engine/report";
import type { DayFile, DayGrades, HandedPick } from "../src/engine/types";
import { parseClubSchedule } from "../src/data/nhl";

function pick(over: Partial<HandedPick> = {}): HandedPick {
  return {
    id: "d-1",
    createdAt: "2026-11-20T18:00:00Z",
    gameStart: "2026-11-21T00:00:00Z",
    gameId: 1,
    sport: "nhl",
    kind: "lean",
    player: "Star Winger",
    team: "DET",
    opponent: "VAN",
    market: "sog",
    line: 3.5,
    side: "over",
    modelProb: 0.6,
    limitOdds: -150,
    mean: 4,
    note: "",
    ...over,
  };
}

function day(picks: HandedPick[], tickets: DayFile["tickets"] = []): DayFile {
  return { date: "2026-11-20", generatedAt: "2026-11-20T18:00:00Z", modelVersion: "nhl-v0.1", picks, tickets, notes: [] };
}

function player(over: Partial<PlayerLine>): PlayerLine {
  return { playerId: 1, name: "Star Winger", team: "DET", opponent: "VAN", position: "R", sog: 5, goals: 0, assists: 1, points: 1, toiMinutes: 18, ...over };
}

const final = (players: PlayerLine[]): Boxscore => ({ gameId: 1, final: true, players });

describe("grading a day", () => {
  it("grades wins, losses and pushes from box scores", () => {
    const d = day([pick(), pick({ id: "d-2", player: "Cold Guy" }), pick({ id: "d-3", line: 5, market: "sog" })]);
    const boxes = new Map([[1, final([player({}), player({ name: "Cold Guy", sog: 1 })])]]);
    const { grades, open } = gradeDay(d, boxes);
    expect(grades.find((g) => g.pickId === "d-1")).toMatchObject({ outcome: "win", actual: 5 });
    expect(grades.find((g) => g.pickId === "d-2")).toMatchObject({ outcome: "loss", actual: 1, profitAtLimit: -1 });
    expect(grades.find((g) => g.pickId === "d-3")).toMatchObject({ outcome: "push", profitAtLimit: 0 });
    expect(open).toEqual([]);
  });

  it("prices a win at the limit odds", () => {
    const { grades } = gradeDay(day([pick({ limitOdds: -150 })]), new Map([[1, final([player({})])]]));
    expect(grades[0]!.profitAtLimit).toBeCloseTo(2 / 3, 6);
  });

  it("leaves picks open instead of guessing", () => {
    const d = day([pick(), pick({ id: "d-2", player: "Nobody" }), pick({ id: "d-3", gameId: 2 })]);
    const boxes = new Map<number, Boxscore | null>([
      [1, { ...final([player({})]), final: false }],
      [2, null],
    ]);
    const { grades, open } = gradeDay(d, boxes);
    expect(grades).toEqual([]);
    expect(open.map((o) => o.reason)).toEqual(["Game not final", "Game not final", "No box score"]);
    const missing = gradeDay(day([pick({ player: "Nobody" })]), new Map([[1, final([player({})])]]));
    expect(missing.open[0]!.reason).toMatch(/not in box score/);
  });

  it("never regrades and keeps grades write-once", () => {
    const d = day([pick()]);
    const boxes = new Map([[1, final([player({})])]]);
    const first = gradeDay(d, boxes);
    const merged = mergeGrades(null, d.date, first.grades, new Date("2026-11-21T13:00:00Z"));
    expect(gradeDay(d, boxes, new Set(merged.grades.map((g) => g.pickId))).grades).toEqual([]);
    const again = mergeGrades(merged, d.date, [{ ...first.grades[0]!, outcome: "loss" }], new Date());
    expect(again.grades[0]!.outcome).toBe("win");
  });
});

describe("report", () => {
  const mk = (n: number, hit: boolean, prob = 0.6, market: HandedPick["market"] = "sog") => ({
    pick: pick({ id: `p${n}`, modelProb: prob, market }),
    grade: { pickId: `p${n}`, actual: hit ? 5 : 1, outcome: hit ? ("win" as const) : ("loss" as const), profitAtLimit: hit ? 0.667 : -1 },
  });

  function reportFor(rows: ReturnType<typeof mk>[], tickets: DayFile["tickets"] = []) {
    const grades: DayGrades = { date: "2026-11-20", gradedAt: "x", grades: rows.map((r) => r.grade) };
    return buildReport([day(rows.map((r) => r.pick), tickets)], [grades], new Date("2026-11-22T00:00:00Z"));
  }

  it("says nothing is graded yet when that is true", () => {
    const r = buildReport([day([pick()])], [], new Date());
    expect(r.graded).toBe(0);
    expect(r.findings[0]).toMatch(/Nothing graded/);
  });

  it("summarizes record, hit rate, calibration and profit at limit", () => {
    const r = reportFor([mk(1, true), mk(2, true), mk(3, false), mk(4, true)]);
    expect(r.overall).toMatchObject({ picks: 4, wins: 3, losses: 1 });
    expect(r.overall.hitRate).toBeCloseTo(0.75, 10);
    expect(r.overall.avgModelProb).toBeCloseTo(0.6, 10);
    expect(r.overall.profitAtLimit).toBeCloseTo(0.667 * 3 - 1, 6);
    expect(r.brier).not.toBeNull();
    expect(r.calibration.length).toBeGreaterThan(0);
  });

  it("refuses to recommend changes on a small sample", () => {
    const r = reportFor([mk(1, false), mk(2, false), mk(3, false)]);
    expect(r.findings.join(" ")).toMatch(new RegExp(`Under ${MIN_SAMPLE}`));
    expect(r.findings.join(" ")).not.toMatch(/overconfident/);
  });

  it("flags overconfidence only once the sample is big enough", () => {
    const rows = Array.from({ length: MIN_SAMPLE }, (_, i) => mk(i, i % 2 === 0, 0.7));
    const r = reportFor(rows);
    expect(r.findings.join(" ")).toMatch(/overconfident/);
  });

  it("breaks results out by market and settles tickets", () => {
    const rows = [mk(1, true, 0.7, "sog"), mk(2, true, 0.7, "sog"), mk(3, false, 0.6, "points")];
    const r = reportFor(rows, [{ id: "T1", legIds: ["p1", "p2"], jointProb: 0.49, minAmerican: 100, note: "" }, { id: "T2", legIds: ["p1", "p3"], jointProb: 0.42, minAmerican: 100, note: "" }]);
    expect(r.byMarket.sog!.picks).toBe(2);
    expect(r.byMarket.points!.losses).toBe(1);
    expect(r.tickets).toEqual({ total: 2, settled: 2, won: 1 });
  });
});

describe("club schedule parser", () => {
  it("reads games and skips malformed rows", () => {
    const games = parseClubSchedule({
      games: [
        { id: 1, gameDate: "2026-11-19", gameState: "OFF", gameType: 2, awayTeam: { abbrev: "DET" }, homeTeam: { abbrev: "VAN" } },
        { id: 0, gameDate: "x", awayTeam: { abbrev: "A" }, homeTeam: { abbrev: "B" } },
        { id: 3, gameDate: "2026-11-21", awayTeam: null, homeTeam: { abbrev: "B" } },
      ],
    });
    expect(games).toEqual([{ id: 1, date: "2026-11-19", state: "OFF", type: 2, away: "DET", home: "VAN" }]);
    expect(parseClubSchedule(null)).toEqual([]);
  });
});
