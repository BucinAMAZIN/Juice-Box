import { describe, expect, it } from "vitest";
import { buildHistories, type DatedBox } from "../src/engine/history";
import { opponentShotFactor, playedRecently, projectPlayer, type Matchup, type Projection } from "../src/engine/project";
import { candidatesFrom, limitOdds, selectDay, type Candidate } from "../src/engine/select";
import type { Boxscore, PlayerLine } from "../src/data/nhl";

function line(over: Partial<PlayerLine> & { name: string; team: string; opponent: string }): PlayerLine {
  return { playerId: 0, position: "R", sog: 3, goals: 0, assists: 0, points: 0, toiMinutes: 18, ...over };
}

function box(gameId: number, away: string, home: string, awayLines: PlayerLine[], homeLines: PlayerLine[]): Boxscore {
  return { gameId, final: true, players: [...awayLines, ...homeLines] };
}

/** Ten games for DET at home vs rotating opponents; one star winger, plus a fixed opponent for shot totals. */
function tenGames(opts: { sog?: number; toi?: number; skip?: number[] } = {}): DatedBox[] {
  const out: DatedBox[] = [];
  for (let i = 0; i < 10; i++) {
    const date = `2026-11-${String(10 + i).padStart(2, "0")}`;
    const star = line({ playerId: 1, name: "Star Winger", team: "DET", opponent: "VAN", sog: opts.sog ?? 4, toiMinutes: opts.toi ?? 19, points: i % 2 });
    const opp = line({ playerId: 2, name: "Opp Guy", team: "VAN", opponent: "DET", sog: 2 });
    const detLines = opts.skip?.includes(i) ? [] : [star];
    const b = box(100 + i, "VAN", "DET", [opp], detLines.length ? detLines : [line({ playerId: 3, name: "Someone Else", team: "DET", opponent: "VAN" })]);
    out.push({ date, box: b });
  }
  return out;
}

const matchup: Matchup = { team: "DET", opponent: "VAN", gameId: 999, gameStart: "2026-11-21T00:00:00Z" };

describe("history", () => {
  it("builds newest-first game logs and team game lists", () => {
    const h = buildHistories(tenGames());
    const star = h.players.get("1")!;
    expect(star.games).toHaveLength(10);
    expect(star.games[0]!.date).toBe("2026-11-19");
    expect(h.teamGames.get("DET")).toHaveLength(10);
    expect(h.teamGames.get("DET")![0]).toBe(109);
  });

  it("measures shots allowed per game and the league average", () => {
    const h = buildHistories(tenGames());
    // VAN took 2 shots per game against DET; DET took 4 (star) or 3 (substitute) against VAN.
    expect(h.shotsAllowed.get("DET")).toBeCloseTo(2, 10);
    expect(h.shotsAllowed.get("VAN")).toBeCloseTo(4, 10);
    expect(h.leagueShotsPerGame).toBeCloseTo(3, 10);
  });
});

describe("projection", () => {
  it("projects shots and points for a regular", () => {
    const h = buildHistories(tenGames());
    const out = projectPlayer(h, h.players.get("1")!, matchup);
    expect(out.map((p) => p.market).sort()).toEqual(["assists", "goals", "points", "sog"]);
    const sog = out.find((p) => p.market === "sog")!;
    // Observed 4 shots in 19 minutes is about 12.6/60. The prior (6.7/60) pulls it down but not below it.
    expect(sog.mean).toBeGreaterThan(2.6);
    expect(sog.mean).toBeLessThan(4.6);
    expect(sog.dist.kind).toBe("negbin");
  });

  it("shrinks a hot sample toward the league rate", () => {
    const hot = projectPlayer(buildHistories(tenGames({ sog: 8 })), buildHistories(tenGames({ sog: 8 })).players.get("1")!, matchup);
    const raw = (8 / 19) * 19;
    expect(hot.find((p) => p.market === "sog")!.mean).toBeLessThan(raw);
  });

  it("refuses players with too little ice time, too few games, or recent absences", () => {
    const low = buildHistories(tenGames({ toi: 8 }));
    expect(projectPlayer(low, low.players.get("1")!, matchup)).toEqual([]);

    const short = buildHistories(tenGames().slice(0, 4));
    expect(projectPlayer(short, short.players.get("1")!, matchup)).toEqual([]);

    const missed = buildHistories(tenGames({ skip: [9] })); // out of the most recent game
    expect(playedRecently(missed, missed.players.get("1")!)).toBe(false);
    expect(projectPlayer(missed, missed.players.get("1")!, matchup)).toEqual([]);
  });

  it("limits how far an opponent can move a projection", () => {
    const h = buildHistories(tenGames());
    const factor = opponentShotFactor(h, "VAN"); // VAN allows 4 vs league 3
    expect(factor).toBeGreaterThan(1);
    expect(factor).toBeLessThanOrEqual(1.12);
    expect(opponentShotFactor(h, "NOPE")).toBe(1);
  });
});

describe("limit prices", () => {
  it("converts a win probability into the worst acceptable price", () => {
    expect(limitOdds(0.586)).toBe(-135);
    expect(limitOdds(0.62)).toBeLessThan(-150);
    expect(limitOdds(0.45)).toBeGreaterThan(100);
  });
});

function proj(key: string, gameId: number, market: "sog" | "points" = "sog"): Projection {
  return {
    key,
    player: `Player ${key}`,
    team: "AAA",
    opponent: "BBB",
    gameId,
    gameStart: "2026-11-21T00:00:00Z",
    market,
    mean: 3,
    dist: { kind: "poisson", mean: 3 },
    games: 10,
    avgToi: 18,
  };
}

function cand(key: string, gameId: number, prob: number, threshold = 3): Candidate {
  return { projection: proj(key, gameId), threshold, line: threshold - 0.5, prob };
}

const NOW = new Date("2026-11-20T18:00:00Z");

describe("pick selection", () => {
  it("builds candidates for every shot and point threshold", () => {
    const c = candidatesFrom([proj("a", 1, "sog"), proj("a", 1, "points")]);
    expect(c.filter((x) => x.projection.market === "sog")).toHaveLength(5);
    expect(c.filter((x) => x.projection.market === "points")).toHaveLength(2);
    const probs = c.filter((x) => x.projection.market === "sog").map((x) => x.prob);
    for (let i = 1; i < probs.length; i++) expect(probs[i]!).toBeLessThan(probs[i - 1]!);
  });

  it("picks the best play of the day inside the band and the rest as leans", () => {
    const day = selectDay("2026-11-20", [
      cand("a", 1, 0.62),
      cand("b", 1, 0.6),
      cand("c", 1, 0.58),
      cand("d", 2, 0.7),
      cand("e", 3, 0.3),
    ], NOW);
    const potd = day.picks.filter((p) => p.kind === "potd");
    expect(potd).toHaveLength(1);
    expect(potd[0]!.player).toBe("Player a");
    expect(potd[0]!.limitOdds).toBeLessThan(-135 + 1);
    const leans = day.picks.filter((p) => p.kind === "lean");
    expect(leans.map((p) => p.player)).not.toContain("Player a");
    expect(leans.every((p) => p.modelProb >= 0.55 && p.modelProb <= 0.72)).toBe(true);
  });

  it("limits leans per game and per player", () => {
    const many = ["a", "b", "c", "d", "e"].map((k, i) => cand(k, 1, 0.7 - i * 0.01));
    const day = selectDay("2026-11-20", many, NOW);
    expect(day.picks.filter((p) => p.kind === "lean").length).toBeLessThanOrEqual(2 + 0);
    const dup = selectDay("2026-11-20", [cand("a", 1, 0.66, 2), cand("a", 1, 0.6, 3)], NOW);
    expect(new Set(dup.picks.filter((p) => p.kind === "lean").map((p) => p.player)).size).toBe(dup.picks.filter((p) => p.kind === "lean").length);
  });

  it("builds +100 tickets from legs in different games", () => {
    const day = selectDay("2026-11-20", [cand("a", 1, 0.76), cand("b", 2, 0.75), cand("c", 1, 0.74), cand("d", 3, 0.73)], NOW);
    expect(day.tickets.length).toBeGreaterThan(0);
    const t = day.tickets[0]!;
    expect(t.minAmerican).toBe(100);
    expect(t.jointProb).toBeGreaterThanOrEqual(1.02 / 2);
    const legs = day.picks.filter((p) => t.legIds.includes(p.id));
    expect(legs).toHaveLength(2);
    expect(new Set(legs.map((l) => l.gameId)).size).toBe(2);
    expect(legs.every((l) => l.ticketId === t.id)).toBe(true);
  });

  it("says why when there is nothing to hand out", () => {
    const day = selectDay("2026-11-20", [cand("a", 1, 0.2)], NOW);
    expect(day.picks).toEqual([]);
    expect(day.notes.join(" ")).toMatch(/No play of the day/);
    expect(day.notes.join(" ")).toMatch(/No leans/);
    expect(day.notes.join(" ")).toMatch(/No \+100 ticket/);
  });

  it("stamps every pick with the generation time and model version", () => {
    const day = selectDay("2026-11-20", [cand("a", 1, 0.62)], NOW);
    expect(day.generatedAt).toBe(NOW.toISOString());
    expect(day.modelVersion).toMatch(/^nhl-v/);
    expect(day.picks[0]!.createdAt).toBe(NOW.toISOString());
    expect(day.picks[0]!.id).toBe("2026-11-20-1");
  });
});
