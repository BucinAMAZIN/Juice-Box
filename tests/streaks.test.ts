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
  it("skips short streaks, broken streaks, long prices, started games and props with no Hard Rock price", () => {
    const rows = offers(raw({}, -300, 4, 4), raw({}, -300, 7, 8), raw({}, PRICE_MIN - 100, 9, 9), raw({ player: { fullName: "No Price", firstName: "No", lastName: "Price" }, market: { name: "POINTS", books: { fanduel: { over: { current: { value: 18.5, odds: { american: -200 } } } } } } }));
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
