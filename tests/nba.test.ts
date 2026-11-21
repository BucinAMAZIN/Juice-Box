import { describe, expect, it } from "vitest";
import { parseByAthlete, parseNbaBox, parseScoreboard, type NbaBox, type SeasonAvg } from "../src/data/espn";
import { parseOffer } from "../src/data/linemate";
import { generateNbaDay, type NbaFetchers } from "../src/engine/nbaDaily";
import { buildNbaHistories, nbaCandidates, nbaLeaders, projectNba, statOf } from "../src/engine/nba";
import { gradeDay } from "../src/engine/grade";
import type { DayFile } from "../src/engine/types";

const KEYS = ["minutes", "points", "fieldGoalsMade-fieldGoalsAttempted", "threePointFieldGoalsMade-threePointFieldGoalsAttempted", "freeThrowsMade-freeThrowsAttempted", "rebounds", "assists"];
const ath = (name: string, stats: string[], extra: object = {}) => ({ athlete: { displayName: name }, didNotPlay: false, stats, ...extra });
const boxJson = (completed = true) => ({
  header: { competitions: [{ status: { type: { completed } } }] },
  boxscore: {
    players: [
      { team: { abbreviation: "LAL" }, statistics: [{ keys: KEYS, athletes: [ath("Luka Doncic", ["36", "30", "10-20", "4-9", "6-7", "8", "9"]), ath("Bench Guy", ["0", "0", "0-0", "0-0", "0-0", "0", "0"], { didNotPlay: true })] }] },
      { team: { abbreviation: "DEN" }, statistics: [{ keys: KEYS, athletes: [ath("Nikola Jokic", ["34", "25", "9-15", "1-3", "6-6", "14", "11"])] }] },
    ],
  },
});

describe("ESPN parsing", () => {
  it("reads games, box scores and averages, skipping players who did not play", () => {
    const games = parseScoreboard({ events: [{ id: "401", date: "2026-11-21T00:00Z", status: { type: { state: "pre" } }, competitions: [{ competitors: [{ homeAway: "home", team: { abbreviation: "LAL" } }, { homeAway: "away", team: { abbreviation: "DEN" } }] }] }] });
    expect(games).toEqual([{ id: 401, startUtc: "2026-11-21T00:00Z", away: "DEN", home: "LAL", state: "pre" }]);
    const box = parseNbaBox(boxJson(), 401)!;
    expect(box.final).toBe(true);
    expect(box.players.map((p) => p.name)).toEqual(["Luka Doncic", "Nikola Jokic"]);
    expect(box.players[0]).toMatchObject({ key: "l doncic", team: "LAL", opponent: "DEN", points: 30, rebounds: 8, assists: 9, threes: 4 });
    expect(parseNbaBox(boxJson(false), 401)!.final).toBe(false);
    expect(parseNbaBox({}, 1)).toBeNull();
    const avgs = parseByAthlete({
      categories: [{ name: "general", names: ["gamesPlayed", "avgRebounds"] }, { name: "offensive", names: ["avgPoints", "avgAssists", "avgThreePointFieldGoalsMade"] }],
      athletes: [{ athlete: { displayName: "Luka Doncic" }, categories: [{ name: "general", values: [14, 7] }, { name: "offensive", values: [38.1, 9.1, 5.1] }] }],
    });
    expect(avgs[0]).toMatchObject({ key: "l doncic", games: 14, points: 38.1, rebounds: 7, assists: 9.1, threes: 5.1 });
    expect(() => parseByAthlete({ categories: [], athletes: [] })).toThrow();
  });
});

const avg = (name: string, points: number, rebounds: number, assists: number, games = 15): SeasonAvg => ({ name, key: "", team: "", games, points, rebounds, assists, threes: 2 });

describe("leaders and projections", () => {
  it("keeps the top 12 per category, requires enough games, and ranks combos by sum", () => {
    const pool = Array.from({ length: 20 }, (_, i) => avg(`Player ${String.fromCharCode(65 + i)}`, 30 - i, 5, 5));
    pool.push(avg("Rookie Few", 99, 20, 20, 2));
    const l = nbaLeaders(pool);
    expect(l.points.size).toBe(12);
    expect(l.points.has("player a")).toBe(true);
    expect(l.points.has("player m")).toBe(false);
    expect(l.pra.has("rookie few")).toBe(false);
    expect(statOf({ points: 10, rebounds: 5, assists: 3, threes: 1 }, "pra")).toBe(18);
  });

  const game = (id: number, pts: number): NbaBox => ({
    gameId: id,
    final: true,
    players: [{ name: "Luka Doncic", key: "l doncic", team: "LAL", opponent: "DEN", minutes: 35, points: pts, rebounds: 8, assists: 9, threes: 3 }],
  });
  const boxes = Array.from({ length: 8 }, (_, i) => ({ date: `2026-11-${String(10 + i).padStart(2, "0")}`, box: game(100 + i, 30) }));

  it("projects a player who has played recently and prices every Linemate rung", () => {
    const h = buildNbaHistories(boxes);
    const season = avg("Luka Doncic", 30, 8, 9);
    const proj = projectNba(h, h.players.get("luka doncic")!, season, { team: "LAL", opponent: "DEN", gameId: 7, gameStart: "2026-11-22T01:00:00Z" }, ["points", "pra"]);
    expect(proj).toHaveLength(2);
    expect(proj[0]!.mean).toBeCloseTo(30, 0);
    const offer = parseOffer(
      {
        type: "player", gameId: "g", timestamp: "t", outcome: "over",
        player: { firstName: "Luka", lastName: "Doncic", fullName: "Luka Doncic" }, team: { code: "LAL" }, opposingTeam: { code: "DEN" },
        market: { name: "POINTS", books: { dk: { over: { current: { value: 29.5, odds: { american: -115 } }, alternates: { "24.5": { value: 24.5, odds: { american: -260 } }, "34.5": { value: 34.5, odds: { american: 300 } }, "10.5": { value: 10.5, odds: { american: -5000 } } } } } } },
      },
      "nba",
    )!;
    const cands = nbaCandidates(proj, [offer]);
    const rungs = cands.map((c) => c.line).sort((a, b) => a - b);
    expect(rungs).toEqual([24.5, 29.5]); // 10.5 is near-certain, 34.5 is too unlikely
    expect(cands.find((c) => c.line === 29.5)!.price).toEqual({ american: -115, book: "dk" });
  });

  it("makes no projection for a player who missed his team's recent games", () => {
    const h = buildNbaHistories([...boxes, { date: "2026-11-20", box: { gameId: 999, final: true, players: [{ ...game(999, 20).players[0]!, name: "Someone Else", key: "s else" }] } }]);
    expect(projectNba(h, h.players.get("luka doncic")!, avg("Luka Doncic", 30, 8, 9), { team: "LAL", opponent: "DEN", gameId: 1, gameStart: "" }, ["points"])).toEqual([]);
  });
});

describe("NBA grading and the Linemate gate", () => {
  it("grades NBA picks from the box score, combos included", () => {
    const day: DayFile = {
      date: "2026-11-20", generatedAt: "", modelVersion: "x", notes: [], tickets: [],
      picks: [{ id: "nba-1", createdAt: "", gameStart: "", gameId: 401, sport: "nba", kind: "lean", player: "Luka Doncic", team: "LAL", opponent: "DEN", market: "pra", line: 46.5, side: "over", modelProb: 0.6, limitOdds: -150, mean: 47, price: -120, note: "" }],
    };
    const box = parseNbaBox(boxJson(), 401)!;
    const out = gradeDay(day, new Map(), new Set(), new Map([[401, box]]));
    expect(out.grades[0]).toMatchObject({ actual: 47, outcome: "win" });
    expect(out.grades[0]!.profitAtLimit).toBeCloseTo(100 / 120, 3);
  });

  it("makes no NBA picks when Linemate has no data", async () => {
    const f: NbaFetchers = {
      loadScoreboard: async () => [{ id: 1, startUtc: "2026-11-22T01:00:00Z", away: "DEN", home: "LAL", state: "pre" }],
      loadBox: async () => null,
      loadAverages: async () => [],
      loadOffers: async () => [],
    };
    const { day } = await generateNbaDay(f, new Date("2026-11-21T15:00:00Z"));
    expect(day.picks).toEqual([]);
    expect(day.notes.join(" ")).toMatch(/Linemate has no data/);
  });
});

import { blendWithMarket } from "../src/engine/filter";
import type { Candidate } from "../src/engine/select";

describe("market blend", () => {
  it("moves a priced probability halfway back toward its price and keeps the original", () => {
    const c = { projection: {}, threshold: 3, line: 2.5, prob: 0.7, price: { american: -100, book: "x" } } as unknown as Candidate;
    const [out] = blendWithMarket([c]);
    expect(out!.prob).toBeCloseTo(0.6, 5);
    expect(out!.rawProb).toBe(0.7);
    const unpriced = { ...c, price: undefined } as Candidate;
    expect(blendWithMarket([unpriced])[0]!.prob).toBe(0.7);
  });
});

import { appendNew } from "../src/engine/merge";
import { selectDay } from "../src/engine/select";
import { distributionFor } from "../src/core/model";

function alt(player: string, gameId: number, prob: number, american: number): Candidate {
  return {
    projection: { key: player, sport: "nba", player, team: "T", opponent: "O", gameId, gameStart: "2026-11-21T03:00:00Z", market: "points", mean: 20, dist: distributionFor("points", 20), games: 10, avgToi: 30 },
    threshold: 20, line: 19.5, prob, price: { american, book: "fanduel" },
  };
}

describe("alt-line picks", () => {
  const NOW = new Date("2026-11-21T00:00:00Z");
  it("hands out up to 4 alt lines priced -250 to -375, at most two a game", () => {
    const day = selectDay("2026-11-20", [alt("A", 1, 0.8, -300), alt("B", 1, 0.79, -330), alt("C", 1, 0.78, -260), alt("D", 2, 0.77, -270), alt("E", 3, 0.76, -280), alt("F", 4, 0.9, -200), alt("G", 5, 0.7, -300)], NOW, undefined, { priced: true, idPrefix: "nba-" });
    const alts = day.picks.filter((p) => p.kind === "alt");
    expect(alts.length).toBe(4);
    expect(alts.every((p) => p.price! <= -250 && p.price! >= -375)).toBe(true);
    expect(alts.filter((p) => p.gameId === 1).length).toBeLessThanOrEqual(2);
    expect(alts.some((p) => p.player === "G")).toBe(false); // 70% at -300 is well under fair
  });

  it("adds new picks to a saved day without changing what was saved", () => {
    const saved = selectDay("2026-11-20", [alt("A", 1, 0.8, -300)], NOW, undefined, { priced: true, idPrefix: "nba-" });
    const fresh = selectDay("2026-11-20", [alt("A", 1, 0.8, -300), alt("B", 2, 0.79, -330)], NOW, undefined, { priced: true, idPrefix: "nba-" });
    const { day, added } = appendNew(saved, fresh);
    expect(added).toBe(1);
    expect(day.picks.slice(0, saved.picks.length)).toEqual(saved.picks);
    expect(new Set(day.picks.map((p) => p.id)).size).toBe(day.picks.length);
  });
});
