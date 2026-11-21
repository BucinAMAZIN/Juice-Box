import { describe, expect, it } from "vitest";
import { boxNameKey, indexOffers, parseOffer, rungAt } from "../src/data/linemate";
import { attachPrices } from "../src/engine/pricing";
import { generateDay, type Fetchers } from "../src/engine/daily";
import { candidatesFrom, selectDay, type Candidate } from "../src/engine/select";
import { distributionFor } from "../src/core/model";

const odds = (american: number) => ({ american, decimal: 2, fractional: "" });
const row = (over: object = {}) => ({
  type: "player",
  gameId: "20261121-WPJ-VGK",
  timestamp: "2026-11-22T01:00:00.000+00:00",
  player: { firstName: "Kyle", lastName: "Connor", fullName: "Kyle Connor" },
  team: { code: "WPJ" },
  opposingTeam: { code: "VGK" },
  outcome: "over",
  market: {
    name: "SHOTS_ON_GOAL",
    books: {
      hardrock: { over: { current: { value: 3.5, odds: { ...odds(-125), }, operatorData: { selectionId: "111" } }, alternates: { "2.5": { value: 2.5, odds: odds(-300), operatorData: { selectionId: "222" } } } } },
      fanduel: { over: { current: { value: 3.5, odds: odds(-118) }, alternates: { "4.5": { value: 4.5, odds: odds(240) } } } },
    },
  },
  signals: [{ type: "RECENT_FORM", hitRecord: { games: 20, hits: 12 } }],
  ...over,
});

describe("Linemate offers", () => {
  it("keeps the best price per line across books and maps team codes", () => {
    const o = parseOffer(row(), "nhl")!;
    expect(o.team).toBe("WPG");
    expect(o.key).toBe("k connor");
    expect(rungAt(o, 3.5)).toMatchObject({ american: -118, book: "fanduel" });
    expect(rungAt(o, 2.5)!.american).toBe(-300);
    expect(rungAt(o, 1.5)).toBeNull();
    expect(o.recent).toEqual({ games: 20, hits: 12 });
  });

  it("keeps Hard Rock's own price and selection id, and builds links from them", async () => {
    const o = parseOffer(row(), "nhl")!;
    expect(o.hr.map((r) => [r.value, r.american, r.sid])).toEqual([[2.5, -300, "222"], [3.5, -125, "111"]]);
    const { buildLinks } = await import("../src/engine/links");
    const day = {
      date: "2026-11-21", generatedAt: "", modelVersion: "x", notes: [], tickets: [{ id: "T", legIds: ["a", "b"], jointProb: 0.5, minAmerican: 100, note: "" }],
      picks: ["a", "b"].map((id, i) => ({ id, createdAt: "", gameStart: "", gameId: 1, sport: "nhl", kind: "ticket", player: "Kyle Connor", team: "WPG", opponent: "VGK", market: "sog", line: i === 0 ? 2.5 : 3.5, side: "over", modelProb: 0.7, limitOdds: -200, mean: 3, ticketId: "T", note: "" })),
    } as never;
    const links = buildLinks(day, [o], new Date("2026-11-21T15:00:00Z"));
    expect(links.picks.a!.url).toBe("https://share.hardrock.bet/Pt0T/bet?deep_link_value=hardrock://betslip/222");
    expect(links.picks.a!.american).toBe(-300);
    expect(links.tickets.T).toBe("https://share.hardrock.bet/Pt0T/bet?deep_link_value=hardrock://betslip/222,111");
  });

  it("skips team markets and rows without prices", () => {
    expect(parseOffer(row({ type: "team" }), "nhl")).toBeNull();
    expect(parseOffer(row({ market: { name: "POINTS", books: {} } }), "nhl")).toBeNull();
  });

  it("matches box-score names, and refuses an ambiguous name", () => {
    expect(boxNameKey("K. Connor")).toBe("k connor");
    const a = parseOffer(row(), "nhl")!;
    const b = parseOffer(row({ team: { code: "DET" } }), "nhl")!;
    const idx = indexOffers([a, b]);
    expect(idx.find("nhl", "k connor", "WPG", "SHOTS_ON_GOAL")?.team).toBe("WPG");
    expect(idx.find("nhl", "k connor", "BOS", "SHOTS_ON_GOAL")).toBeNull();
  });
});

function cand(player: string, team: string, threshold: number, prob: number, american?: number): Candidate {
  return {
    projection: { key: player, player, team, opponent: "X", gameId: team.charCodeAt(0), gameStart: "2026-11-22T01:00:00Z", market: "sog", mean: 3.5, dist: distributionFor("sog", 3.5), games: 10, avgToi: 18 },
    threshold,
    line: threshold - 0.5,
    prob,
    ...(american != null ? { price: { american, book: "fanduel" } } : {}),
  };
}

describe("priced selection", () => {
  const NOW = new Date("2026-11-21T15:00:00Z");
  it("drops candidates Linemate has no price for", () => {
    const offers = [parseOffer(row(), "nhl")!];
    const { priced, dropped } = attachPrices([cand("K. Connor", "WPG", 4, 0.6), cand("A. Nobody", "WPG", 4, 0.6)], offers, "nhl");
    expect(priced).toHaveLength(1);
    expect(priced[0]!.price).toEqual({ american: -125, book: "Hard Rock" });
    expect(dropped).toBe(1);
  });

  it("picks the play of the day only from real prices between -110 and -135 with an edge", () => {
    const day = selectDay(
      "2026-11-21",
      [cand("A. One", "AAA", 3, 0.64, -125), cand("B. Two", "BBB", 3, 0.62, -300), cand("C. Three", "CCC", 3, 0.5, -120), cand("D. Four", "DDD", 3, 0.66, -105)],
      NOW,
      undefined,
      { priced: true },
    );
    const potd = day.picks.filter((p) => p.kind === "potd");
    expect(potd.map((p) => p.player)).toEqual(["A. One"]);
    expect(potd[0]!.price).toBe(-125);
    expect(potd[0]!.edge).toBeCloseTo(0.64 - 125 / 225, 5);
    // -300 is too juiced for a lean, and 50% at -120 has no edge.
    expect(day.picks.some((p) => p.player === "B. Two" || p.player === "C. Three")).toBe(false);
  });

  it("only builds a ticket when the listed prices really pay +100", () => {
    const pay = selectDay("2026-11-21", [cand("A. One", "AAA", 2, 0.75, -150), cand("B. Two", "BBB", 2, 0.74, -140)], NOW, undefined, { priced: true });
    expect(pay.tickets).toHaveLength(1); // 1.667 * 1.714 = 2.86
    expect(pay.tickets[0]!.priced).toBeGreaterThan(100);
    const short = selectDay("2026-11-21", [cand("A. One", "AAA", 2, 0.8, -500), cand("B. Two", "BBB", 2, 0.8, -500)], NOW, undefined, { priced: true });
    expect(short.tickets).toHaveLength(0); // 1.2 * 1.2 = 1.44
  });
});

describe("no Linemate data, no picks", () => {
  const base: Fetchers = {
    loadSchedule: async () => [{ id: 9, startUtc: "2026-11-22T00:00:00Z", away: "VAN", home: "DET", state: "FUT" }],
    loadClubSchedule: async () => [],
    loadBoxscore: async () => null,
  };
  const NOW = new Date("2026-11-21T15:00:00Z");
  it("makes no picks when Linemate is empty", async () => {
    const { day, log } = await generateDay({ ...base, loadOffers: async () => [] }, NOW);
    expect(day.picks).toEqual([]);
    expect(day.notes.join(" ")).toMatch(/no NHL data yet/);
    expect(log.join(" ")).toMatch(/Linemate/);
  });
  it("makes no picks when Linemate cannot be read", async () => {
    const { day } = await generateDay({ ...base, loadOffers: async () => { throw new Error("down"); } }, NOW);
    expect(day.picks).toEqual([]);
    expect(day.notes.join(" ")).toMatch(/could not be read/);
  });
});

void candidatesFrom;
