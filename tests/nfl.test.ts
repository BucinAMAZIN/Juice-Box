import { describe, expect, it } from "vitest";
import { parseNflBox, parseNflByAthlete, type NflAvg, type NflBox } from "../src/data/espn";
import { parseOffer } from "../src/data/linemate";
import { gradeDay } from "../src/engine/grade";
import { buildNflHistories, distFor, nflCandidates, nflLeaders, projectNfl, statOf } from "../src/engine/nfl";
import { generateNflDay, type NflFetchers } from "../src/engine/nflDaily";
import type { DayFile } from "../src/engine/types";

const boxJson = (completed = true) => ({
  header: { competitions: [{ status: { type: { completed } } }] },
  boxscore: {
    players: [
      {
        team: { abbreviation: "HOU" },
        statistics: [
          { name: "passing", keys: ["completions/passingAttempts", "passingYards"], athletes: [{ athlete: { displayName: "C.J. Stroud" }, stats: ["20/30", "251"] }] },
          { name: "rushing", keys: ["rushingAttempts", "rushingYards"], athletes: [{ athlete: { displayName: "Joe Mixon" }, stats: ["18", "77"] }] },
          { name: "receiving", keys: ["receptions", "receivingYards"], athletes: [{ athlete: { displayName: "Joe Mixon" }, stats: ["3", "21"] }, { athlete: { displayName: "Nico Collins" }, stats: ["6", "83"] }] },
        ],
      },
      { team: { abbreviation: "IND" }, statistics: [{ name: "receiving", keys: ["receptions", "receivingYards"], athletes: [{ athlete: { displayName: "Michael Pittman Jr." }, stats: ["5", "60"] }] }] },
    ],
  },
});

describe("ESPN NFL parsing", () => {
  it("merges a player's rushing and receiving lines and ignores other stat blocks", () => {
    const box = parseNflBox(boxJson(), 9)!;
    expect(box.final).toBe(true);
    const mixon = box.players.find((p) => p.name === "Joe Mixon")!;
    expect(mixon).toMatchObject({ rushYds: 77, recYds: 21, receptions: 3, team: "HOU", opponent: "IND", key: "j mixon" });
    expect(box.players.find((p) => p.name === "C.J. Stroud")!.passYds).toBe(251);
    expect(parseNflBox(boxJson(false), 9)!.final).toBe(false);
    expect(parseNflBox({}, 1)).toBeNull();
  });

  it("reads per-game averages and divides receptions by games played", () => {
    const json = {
      categories: [
        { name: "general", names: ["gamesPlayed"] },
        { name: "passing", names: ["passingYardsPerGame"] },
        { name: "rushing", names: ["rushingYardsPerGame"] },
        { name: "receiving", names: ["receptions", "receivingYardsPerGame"] },
      ],
      athletes: [{ athlete: { displayName: "Jaxon Smith-Njigba" }, categories: [{ name: "general", values: [10] }, { name: "passing", values: [0] }, { name: "rushing", values: [2.9] }, { name: "receiving", values: [79, 120.7] }] }],
    };
    expect(parseNflByAthlete(json)[0]).toMatchObject({ games: 10, rushYds: 2.9, recYds: 120.7, receptions: 7.9 });
    expect(() => parseNflByAthlete({ categories: [], athletes: [] })).toThrow();
  });
});

const avg = (name: string, recYds: number, rushYds = 0, games = 10): NflAvg => ({ name, key: "", games, passYds: 0, rushYds, recYds, receptions: recYds / 12 });

describe("NFL leaders, projections and prices", () => {
  it("keeps top 12 per category and ranks rush+rec by the sum", () => {
    const pool = Array.from({ length: 16 }, (_, i) => avg(`Wr ${String.fromCharCode(65 + i)}`, 100 - i * 3));
    pool.push(avg("Back Both", 20, 90));
    const l = nflLeaders(pool);
    expect(l.recYds.size).toBe(12);
    expect(l.recYds.has("wr a")).toBe(true);
    expect(l.recYds.has("wr p")).toBe(false);
    expect(l.rushRecYds.has("back both")).toBe(true); // 110 combined
    expect(statOf({ passYds: 0, rushYds: 40, recYds: 30, receptions: 3 }, "rushRecYds")).toBe(70);
  });

  it("builds a right-skewed distribution for receivers", () => {
    const d = distFor(70, 0.75);
    expect(d.kind).toBe("negbin");
    expect(d.mean).toBe(70);
  });

  const game = (id: number, rec: number): NflBox => ({ gameId: id, final: true, players: [{ name: "Nico Collins", key: "n collins", team: "HOU", opponent: "IND", passYds: 0, rushYds: 0, recYds: rec, receptions: 6 }] });
  const boxes = Array.from({ length: 6 }, (_, i) => ({ date: `2026-10-${String(10 + i * 3).padStart(2, "0")}`, box: game(100 + i, 80) }));

  it("projects a leader who played his team's recent games and prices only Hard Rock rungs", () => {
    const h = buildNflHistories(boxes);
    const proj = projectNfl(h, h.players.get("nico collins")!, avg("Nico Collins", 80), { team: "HOU", opponent: "IND", gameId: 7, gameStart: "2026-11-22T18:00:00Z" }, ["recYds"]);
    expect(proj).toHaveLength(1);
    expect(proj[0]!.sport).toBe("nfl");
    expect(proj[0]!.mean).toBeCloseTo(80, 0);
    const offer = parseOffer(
      {
        type: "player", gameId: "g", timestamp: "t", outcome: "over",
        player: { firstName: "Nico", lastName: "Collins", fullName: "Nico Collins" }, team: { code: "HOU" }, opposingTeam: { code: "IND" },
        market: { name: "RECEIVING_YARDS", books: { hardrock: { over: { current: { value: 79.5, odds: { american: -110 } }, alternates: { "49.5": { value: 49.5, odds: { american: -300 } }, "119.5": { value: 119.5, odds: { american: 400 } } } } }, fanduel: { over: { current: { value: 79.5, odds: { american: 100 } }, alternates: { "59.5": { value: 59.5, odds: { american: -200 } } } } } } },
      },
      "nfl",
    )!;
    const cands = nflCandidates(proj, [offer]);
    expect(cands.map((c) => c.line).sort((a, b) => a - b)).toEqual([49.5, 79.5]); // 59.5 is not on Hard Rock; 119.5 is too unlikely
    expect(cands.every((c) => c.price!.book === "Hard Rock")).toBe(true);
  });

  it("makes no projection for a player who missed his team's last game", () => {
    const h = buildNflHistories([...boxes, { date: "2026-11-15", box: { gameId: 999, final: true, players: [{ ...game(999, 0).players[0]!, name: "Other Guy", key: "o guy" }] } }]);
    expect(projectNfl(h, h.players.get("nico collins")!, avg("Nico Collins", 80), { team: "HOU", opponent: "IND", gameId: 1, gameStart: "" }, ["recYds"])).toEqual([]);
  });
});

describe("NFL grading and the Linemate gate", () => {
  it("grades NFL picks, counting a missing line as zero yards", () => {
    const day: DayFile = {
      date: "2026-11-22", generatedAt: "", modelVersion: "x", notes: [], tickets: [],
      picks: [
        { id: "nfl-1", createdAt: "", gameStart: "", gameId: 9, sport: "nfl", kind: "alt", player: "Nico Collins", team: "HOU", opponent: "IND", market: "recYds", line: 69.5, side: "over", modelProb: 0.7, limitOdds: -250, mean: 80, price: -300, note: "" },
        { id: "nfl-2", createdAt: "", gameId: 9, gameStart: "", sport: "nfl", kind: "lean", player: "Not Listed", team: "HOU", opponent: "IND", market: "rushRecYds", line: 9.5, side: "over", modelProb: 0.7, limitOdds: -250, mean: 20, note: "" },
      ],
    };
    const box = parseNflBox(boxJson(), 9)!;
    const out = gradeDay(day, new Map(), new Set(), new Map(), new Map([[9, box]]));
    expect(out.grades.find((g) => g.pickId === "nfl-1")).toMatchObject({ actual: 83, outcome: "win" });
    expect(out.grades.find((g) => g.pickId === "nfl-2")).toMatchObject({ actual: 0, outcome: "loss" });
  });

  it("makes no NFL picks when Linemate has no data, and only for today's games", async () => {
    const f: NflFetchers = {
      loadWeek: async () => ({ week: 11, games: [{ id: 1, startUtc: "2026-11-22T18:00:00Z", away: "IND", home: "HOU", state: "pre" }] }),
      loadBox: async () => null,
      loadAverages: async () => [],
      loadOffers: async () => [],
    };
    const { day } = await generateNflDay(f, new Date("2026-11-22T14:00:00Z"));
    expect(day.picks).toEqual([]);
    expect(day.notes.join(" ")).toMatch(/Linemate has no data/);
    const notToday = await generateNflDay(f, new Date("2026-11-20T14:00:00Z"));
    expect(notToday.day.notes.join(" ")).toMatch(/no games left/);
  });
});
