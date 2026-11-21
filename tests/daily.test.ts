import { describe, expect, it } from "vitest";
import type { Boxscore, ClubGame, PlayerLine, ScheduledGame } from "../src/data/nhl";
import { generateDay, gradePending, type Fetchers } from "../src/engine/daily";
import type { DayFile, DayGrades } from "../src/engine/types";

const NOW = new Date("2026-11-20T18:00:00Z"); // 1pm Eastern, Friday Nov 20

function pl(over: Partial<PlayerLine> & { name: string; team: string; opponent: string }): PlayerLine {
  return { playerId: 0, position: "R", sog: 3, goals: 0, assists: 0, points: 0, toiMinutes: 18, ...over };
}

/** DET and VAN each play ten earlier games; a steady 4-shot winger on each side. */
function world(): { fetchers: Fetchers; calls: string[] } {
  const calls: string[] = [];
  const clubGames = (team: string): ClubGame[] =>
    Array.from({ length: 12 }, (_, i) => ({
      id: team === "DET" ? 100 + i : 100 + i, // both clubs share the same ten past games
      date: `2026-11-${String(5 + i).padStart(2, "0")}`,
      state: i < 10 ? "OFF" : "FUT",
      type: 2,
      away: "VAN",
      home: "DET",
    }));
  const boxFor = (id: number): Boxscore => ({
    gameId: id,
    final: true,
    players: [
      pl({ playerId: 1, name: "Det Star", team: "DET", opponent: "VAN", sog: 5, toiMinutes: 19 }),
      pl({ playerId: 2, name: "Van Star", team: "VAN", opponent: "DET", sog: 4, toiMinutes: 19 }),
    ],
  });
  const fetchers: Fetchers = {
    loadSchedule: async (date): Promise<ScheduledGame[]> => {
      calls.push(`schedule ${date}`);
      return [
        { id: 900, startUtc: "2026-11-21T00:00:00Z", away: "VAN", home: "DET", state: "FUT" },
        { id: 901, startUtc: "2026-11-20T18:05:00Z", away: "AAA", home: "BBB", state: "FUT" }, // starts in 5 min
      ];
    },
    loadClubSchedule: async (team) => {
      calls.push(`club ${team}`);
      return clubGames(team);
    },
    loadBoxscore: async (id) => {
      calls.push(`box ${id}`);
      return boxFor(id);
    },
  };
  return { fetchers, calls };
}

describe("generateDay", () => {
  it("skips games that start too soon and reads history only for teams that can be picked", async () => {
    const { fetchers, calls } = world();
    const { day, log } = await generateDay(fetchers, NOW);
    expect(day.date).toBe("2026-11-20");
    expect(calls.filter((c) => c.startsWith("club")).sort()).toEqual(["club DET", "club VAN"]);
    expect(log[0]).toMatch(/1 games still open/);
    expect(new Set(day.picks.map((p) => p.gameId))).toEqual(new Set([900]));
  });

  it("reads each recent game once even though two clubs share it", async () => {
    const { fetchers, calls } = world();
    await generateDay(fetchers, NOW);
    const boxes = calls.filter((c) => c.startsWith("box"));
    expect(new Set(boxes).size).toBe(boxes.length);
    expect(boxes).toHaveLength(10);
  });

  it("projects players and stamps every pick before puck drop", async () => {
    const { fetchers } = world();
    const { day } = await generateDay(fetchers, NOW);
    expect(day.picks.length).toBeGreaterThan(0);
    for (const p of day.picks) expect(Date.parse(p.createdAt)).toBeLessThan(Date.parse(p.gameStart));
  });

  it("returns an empty day with a reason when nothing is left to pick", async () => {
    const { fetchers } = world();
    const quiet: Fetchers = { ...fetchers, loadSchedule: async () => [] };
    const { day, log } = await generateDay(quiet, NOW);
    expect(day.picks).toEqual([]);
    expect(log.join(" ")).toMatch(/No upcoming games/);
  });

  it("retries a flaky call and tolerates a failed box score", async () => {
    const { fetchers } = world();
    let schedFails = 1;
    const flaky: Fetchers = {
      ...fetchers,
      loadSchedule: async (d) => {
        if (schedFails-- > 0) throw new Error("503");
        return fetchers.loadSchedule(d);
      },
      loadBoxscore: async (id) => {
        if (id === 100) throw new Error("boom");
        return fetchers.loadBoxscore(id);
      },
    };
    const { log } = await generateDay(flaky, NOW);
    expect(log.join(" ")).toMatch(/9 box scores loaded, 1 failed/);
  });

  it("makes no picks and says so when no history can be read", async () => {
    const { fetchers } = world();
    const none: Fetchers = { ...fetchers, loadBoxscore: async () => null };
    const { day } = await generateDay(none, NOW);
    expect(day.picks).toEqual([]);
    expect(day.notes.join(" ")).toMatch(/No box score history/);
  });
});

describe("gradePending", () => {
  const day: DayFile = {
    date: "2026-11-20",
    generatedAt: "2026-11-20T18:00:00Z",
    modelVersion: "nhl-v0.1",
    notes: [],
    tickets: [],
    picks: [
      { id: "a", createdAt: "x", gameStart: "2026-11-21T00:00:00Z", gameId: 900, sport: "nhl", kind: "potd", player: "Det Star", team: "DET", opponent: "VAN", market: "sog", line: 3.5, side: "over", modelProb: 0.6, limitOdds: -140, mean: 4, note: "" },
      { id: "b", createdAt: "x", gameStart: "2026-11-21T04:00:00Z", gameId: 901, sport: "nhl", kind: "lean", player: "Late Guy", team: "AAA", opponent: "BBB", market: "sog", line: 2.5, side: "over", modelProb: 0.6, limitOdds: -140, mean: 3, note: "" },
    ],
  };
  const f: Fetchers = {
    loadSchedule: async () => [],
    loadClubSchedule: async () => [],
    loadBoxscore: async (id) => ({ gameId: id, final: true, players: [pl({ playerId: 1, name: "Det Star", team: "DET", opponent: "VAN", sog: 6 })] }),
  };

  it("only grades games that started more than the grace period ago", async () => {
    const { updated } = await gradePending(f, [day], new Map(), new Date("2026-11-21T04:30:00Z"));
    const g = updated.get("2026-11-20")!;
    expect(g.grades.map((x) => x.pickId)).toEqual(["a"]); // "b" started 30 minutes ago
    expect(g.grades[0]).toMatchObject({ outcome: "win", actual: 6 });
  });

  it("does not regrade picks it has already graded", async () => {
    const existing = new Map<string, DayGrades>([["2026-11-20", { date: "2026-11-20", gradedAt: "x", grades: [{ pickId: "a", actual: 1, outcome: "loss", profitAtLimit: -1 }] }]]);
    // Now the second pick is gradable too, so the day file is rewritten and both grades appear.
    const both: Fetchers = {
      ...f,
      loadBoxscore: async (id) => ({
        gameId: id,
        final: true,
        players: [
          pl({ playerId: 1, name: "Det Star", team: "DET", opponent: "VAN", sog: 6 }),
          pl({ playerId: 2, name: "Late Guy", team: "AAA", opponent: "BBB", sog: 3 }),
        ],
      }),
    };
    const { updated } = await gradePending(both, [day], existing, new Date("2026-11-22T00:00:00Z"));
    const g = updated.get("2026-11-20")!;
    expect(g.grades.find((x) => x.pickId === "a")).toMatchObject({ outcome: "loss", actual: 1 }); // original kept
    expect(g.grades.find((x) => x.pickId === "b")).toMatchObject({ outcome: "win", actual: 3 });

    // And with nothing new to grade, nothing is returned at all.
    const quiet = await gradePending(f, [day], existing, new Date("2026-11-22T00:00:00Z"));
    expect(quiet.updated.size).toBe(0);
  });

  it("leaves a game it cannot read open", async () => {
    const down: Fetchers = { ...f, loadBoxscore: async () => Promise.reject(new Error("down")) };
    const { updated, log } = await gradePending(down, [day], new Map(), new Date("2026-11-22T00:00:00Z"));
    expect(updated.size).toBe(0);
    expect(log.join(" ")).toMatch(/left 2 open/);
  });
});
