import { describe, expect, it } from "vitest";
import { parseOffer } from "../src/data/linemate";
import { PRICE_MIN, appendStreaks, buildStreakPicks } from "../src/engine/streaks";

const NOW = new Date("2026-11-21T15:00:00Z");
const DATE = "2026-11-21";
const game = { id: 77, startUtc: "2026-11-21T23:00:00Z", away: "DEN", home: "LAL", state: "pre" };

function raw(over: Record<string, unknown> = {}, price = -300, hits = 8, games = 8, line = 18.5, market = "POINTS") {
  return {
    type: "player",
    outcome: "over",
    gameId: "20261121-DEN-LAL",
    timestamp: game.startUtc,
    line,
    player: { fullName: "Pat Example", firstName: "Pat", lastName: "Example" },
    team: { code: "LAL", name: "Lakers" },
    opposingTeam: { code: "DEN" },
    market: { name: market, books: { hardrock: { over: { current: { value: line, odds: { american: price }, operatorData: { selectionId: "555" } } } } } },
    signals: [{ type: "RECENT_FORM", hitRecord: { games, hits } }],
    ...over,
  };
}
const offers = (...rows: unknown[]) => rows.map((r) => parseOffer(r, "nba")!);

describe("streak list", () => {
  it("lists a streak with its Hard Rock price, link and game", () => {
    const { picks } = buildStreakPicks("nba", offers(raw()), [game], NOW, DATE);
    expect(picks).toHaveLength(1);
    expect(picks[0]).toMatchObject({ kind: "streak", streak: 8, price: -300, gameId: 77, teamName: "Lakers", sid: "555", market: "points", line: 18.5 });
    expect(picks[0]!.url).toContain("betslip/555");
  });
  it("skips short streaks, broken streaks, long prices, started games and props priced outside the window", () => {
    const rows = offers(raw({}, -300, 4, 4), raw({}, -300, 7, 8), raw({}, PRICE_MIN - 100, 9, 9));
    expect(buildStreakPicks("nba", rows, [game], NOW, DATE).picks).toHaveLength(0);
    expect(buildStreakPicks("nba", offers(raw()), [{ ...game, startUtc: "2026-11-21T15:05:00Z" }], NOW, DATE).picks).toHaveLength(0);
    expect(buildStreakPicks("nba", offers(raw()), [{ ...game, state: "in" }], NOW, DATE).picks).toHaveLength(0);
  });
  it("counts an NHL game that has not started (state FUT) as open", () => {
    expect(buildStreakPicks("nba", offers(raw()), [{ ...game, state: "FUT" }], NOW, DATE).picks).toHaveLength(1);
    expect(buildStreakPicks("nba", offers(raw()), [{ ...game, state: "LIVE" }], NOW, DATE).picks).toHaveLength(0);
  });
  it("ranks the longest streak first and never changes a saved row", () => {
    const rows = offers(raw({}, -200, 6, 6), raw({ player: { fullName: "Long Run", firstName: "Long", lastName: "Run" } }, -400, 12, 12));
    const { picks } = buildStreakPicks("nba", rows, [game], NOW, DATE);
    expect(picks.map((p) => p.streak)).toEqual([12, 6]);
    const first = appendStreaks(null, DATE, picks, [], NOW);
    expect(first.added).toBe(2);
    const changed = picks.map((p) => ({ ...p, price: -999 }));
    const again = appendStreaks(first.day, DATE, changed, [], NOW);
    expect(again.added).toBe(0);
    expect(again.day.picks[0]!.price).toBe(-400);
  });
});

import { defaultFilters, passes } from "../src/ui/filters";
describe("streak filters", () => {
  const base = { id: "a", createdAt: "", gameStart: "", gameId: 1, sport: "nba" as const, kind: "streak" as const, player: "P", team: "LAL", opponent: "DEN", market: "points" as const, line: 9.5, side: "over" as const, modelProb: 0.8, limitOdds: -300, mean: 9.5, price: -300, streak: 8, h2h: { games: 4, hits: 4 }, split: { games: 6, hits: 4 }, avg: 14, note: "" };
  it("filters by signals, price, line type and bet type", () => {
    const f = defaultFilters();
    expect(passes(base, f)).toBe(true);
    expect(passes(base, { ...f, h2h: 1 })).toBe(true);
    expect(passes(base, { ...f, split: 0.75 })).toBe(false);
    expect(passes(base, { ...f, cushion: 0.25 })).toBe(true);
    expect(passes(base, { ...f, cushion: 0.6 })).toBe(false);
    expect(passes(base, { ...f, maxJuice: -200 })).toBe(false);
    expect(passes(base, { ...f, minStreak: 10 })).toBe(false);
    expect(passes({ ...base, alt: true }, { ...f, line: "main" })).toBe(false);
    expect(passes(base, { ...f, off: new Set(["points"]) })).toBe(false);
    expect(passes({ ...base, h2h: undefined }, { ...f, h2h: 0.75 })).toBe(false);
  });
});

describe("signals on streak rows", () => {
  it("captures head-to-head, venue split, average and line type, and backfills saved rows without touching the price", () => {
    const row = raw({ home: true, alternate: true, signals: [
      { type: "RECENT_FORM", hitRecord: { games: 8, hits: 8, average: 14.5 } },
      { type: "HEAD_TO_HEAD", hitRecord: { games: 3, hits: 3 } },
      { type: "HOME_SPLIT", hitRecord: { games: 6, hits: 5 } },
      { type: "AWAY_SPLIT", hitRecord: { games: 4, hits: 1 } },
    ] });
    const { picks } = buildStreakPicks("nba", offers(row), [game], NOW, DATE);
    expect(picks[0]).toMatchObject({ home: true, alt: true, h2h: { games: 3, hits: 3 }, split: { games: 6, hits: 5 }, avg: 14.5 });
    const old = { ...picks[0]!, price: -250 } as typeof picks[0];
    delete (old as Partial<typeof old>).h2h;
    delete (old as Partial<typeof old>).split;
    const saved = { date: DATE, generatedAt: "", modelVersion: "x", picks: [old], tickets: [], notes: [] };
    const r = appendStreaks(saved, DATE, picks, [], NOW);
    expect(r.day.picks[0]).toMatchObject({ price: -250, h2h: { games: 3, hits: 3 }, split: { games: 6, hits: 5 } });
  });
});

describe("props Hard Rock does not list", () => {
  it("shows them with another book's price and no Hard Rock link", () => {
    const row = raw({ market: { name: "POINTS", books: { fanduel: { over: { current: { value: 18.5, odds: { american: -220 } } } } } } });
    const { picks } = buildStreakPicks("nba", offers(row), [game], NOW, DATE);
    expect(picks).toHaveLength(1);
    expect(picks[0]).toMatchObject({ price: -220, book: "Fanduel" });
    expect(picks[0]!.url).toBeUndefined();
    expect(passes(picks[0]!, { ...defaultFilters(), hrOnly: true })).toBe(false);
  });
});

describe("grading systems", () => {
  const pick = (over: object = {}) => ({ id: "x", sport: "nba", market: "assists", line: 4.5, modelProb: 0.7, limitOdds: -250, price: -250, streak: 6, gameStart: "2026-01-01T00:00Z", ...over }) as never;

  it("grades Linemate's own numbers at face value, weighted by games", async () => {
    const { linemateChance, letter } = await import("../src/ui/grading");
    const long = linemateChance(pick({ streak: 14, split: { games: 8, hits: 8 } }));
    const short = linemateChance(pick({ streak: 5 }));
    expect(long).toBeGreaterThan(short);
    expect(short).toBeCloseTo(6 / 7, 5);
    expect(letter(0.82)).toBe("A");
    expect(letter(0.45)).toBe("F");
  });

  it("learns a sport's hit rates from its own graded props and says nothing without enough", async () => {
    const { fit, ourChance, MIN_GRADED } = await import("../src/ui/grading");
    const rows = (n: number, sport: string, won: (i: number) => boolean, over: object) =>
      Array.from({ length: n }, (_, i) => ({ date: "2026-01-01", pick: pick({ sport, ...over }), won: won(i), units: 0 }));
    const nba = [...rows(40, "nba", (i) => i < 36, { price: -400, limitOdds: -400 }), ...rows(40, "nba", (i) => i < 16, { price: -120, limitOdds: -120 })];
    const models = fit([...nba, ...rows(MIN_GRADED - 1, "nfl", () => true, {})]);
    expect(models.has("nfl")).toBe(false);
    expect(ourChance(pick({ sport: "nfl" }), models)).toBeNull();
    const short = ourChance(pick({ price: -400, limitOdds: -400 }), models)!;
    const long = ourChance(pick({ price: -120, limitOdds: -120 }), models)!;
    expect(short).toBeGreaterThan(0.7);
    expect(long).toBeLessThan(0.6);
    expect(short).toBeGreaterThan(long + 0.15);
  });

  it("scores each day from a model fit on the other days", async () => {
    const { outOfDay } = await import("../src/ui/grading");
    const one = Array.from({ length: 40 }, () => ({ date: "d1", pick: pick(), won: true, units: 0 }));
    expect(outOfDay(one).every((r) => r.ours == null)).toBe(true);
    const two = [...one, ...one.map((r) => ({ ...r, date: "d2" }))];
    expect(outOfDay(two).every((r) => r.ours != null)).toBe(true);
  });
});

describe("our tab evidence", () => {
  it("lists the records behind a prop's grade", async () => {
    const { fit, evidence } = await import("../src/ui/grading");
    const p = { id: "x", sport: "nba", market: "assists", line: 4.5, modelProb: 0.7, limitOdds: -400, price: -400, streak: 12, gameStart: "2026-01-01T00:00Z" } as never;
    const rows = Array.from({ length: 40 }, (_, i) => ({ date: "d", pick: p, won: i < 38, units: 0 }));
    expect(evidence(p, fit(rows))).toEqual(["10+ straight 38-2", "-300 or shorter 38-2"]);
    expect(evidence({ ...(p as object), sport: "nfl" } as never, fit(rows))).toEqual([]);
  });
});

import { sortStreaks } from "../src/ui/streaks";
import type { HandedPick } from "../src/engine/types";
describe("streak sort", () => {
  const mk = (id: string, streak: number, price: number, start: string) => ({ id, streak, price, gameStart: start }) as unknown as HandedPick;
  const rows = [mk("a", 8, -300, "2026-11-21T23:00:00Z"), mk("b", 10, -200, "2026-11-21T20:00:00Z"), mk("c", 8, -150, "2026-11-21T22:00:00Z")];
  const ids = (l: HandedPick[]) => l.map((p) => p.id);
  it("sorts by streak, payout, start time and grade, with streak breaking ties", () => {
    const chance = (p: HandedPick) => ({ a: 0.9, b: null, c: 0.9 })[p.id as "a" | "b" | "c"];
    expect(ids(sortStreaks(rows, "streak", chance))).toEqual(["b", "c", "a"]);
    expect(ids(sortStreaks(rows, "price", chance))).toEqual(["c", "b", "a"]);
    expect(ids(sortStreaks(rows, "time", chance))).toEqual(["b", "c", "a"]);
    expect(ids(sortStreaks(rows, "grade", chance))).toEqual(["c", "a", "b"]);
  });
});
