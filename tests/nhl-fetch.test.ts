import { describe, expect, it } from "vitest";
import { fetchJsonWithRetry, MIN_GAP_MS } from "../src/data/nhl";
import { generateDay, type Fetchers } from "../src/engine/daily";

function response(status: number, body: unknown = {}, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

const noSleep = { sleep: async () => undefined };

describe("NHL fetch pacing and retries", () => {
  it("retries a 429 and then returns the data", async () => {
    const statuses = [429, 429, 200];
    let calls = 0;
    const out = await fetchJsonWithRetry("https://x/y", {
      ...noSleep,
      fetchFn: (async () => response(statuses[calls++]!, { ok: true })) as typeof fetch,
    });
    expect(out).toEqual({ ok: true });
    expect(calls).toBe(3);
  });

  it("waits as long as Retry-After asks", async () => {
    const waits: number[] = [];
    const statuses = [429, 200];
    let calls = 0;
    await fetchJsonWithRetry("https://x/y", {
      sleep: async (ms) => void waits.push(ms),
      fetchFn: (async () => response(statuses[calls++]!, {}, calls === 1 ? { "retry-after": "7" } : {})) as typeof fetch,
    });
    expect(waits).toContain(7000);
  });

  it("gives up after repeated rate limits and reports the status", async () => {
    let calls = 0;
    await expect(
      fetchJsonWithRetry("https://x/y", { ...noSleep, fetchFn: (async () => (calls++, response(429))) as typeof fetch }),
    ).rejects.toThrow(/429/);
    expect(calls).toBe(5);
  });

  it("does not retry a 404", async () => {
    let calls = 0;
    await expect(
      fetchJsonWithRetry("https://x/y", { ...noSleep, fetchFn: (async () => (calls++, response(404))) as typeof fetch }),
    ).rejects.toThrow(/404/);
    expect(calls).toBe(1);
  });

  it("spaces request starts apart even when they are fired together", async () => {
    const waits: number[] = [];
    const sleep = async (ms: number) => void waits.push(ms);
    await Promise.all(
      [1, 2, 3].map(() => fetchJsonWithRetry("https://x/y", { sleep, fetchFn: (async () => response(200, {})) as typeof fetch })),
    );
    expect(waits.filter((w) => w === MIN_GAP_MS)).toHaveLength(3);
  });
});

describe("generateDay when a team's schedule cannot be read", () => {
  it("keeps going and says which teams were skipped", async () => {
    const NOW = new Date("2026-11-20T18:00:00Z");
    const f: Fetchers = {
      loadSchedule: async () => [{ id: 9, startUtc: "2026-11-21T00:00:00Z", away: "VAN", home: "DET", state: "FUT" }],
      loadClubSchedule: async (team) => {
        if (team === "VAN") throw new Error("429");
        return [];
      },
      loadBoxscore: async () => null,
    };
    const { day, log } = await generateDay(f, NOW);
    expect(log.join(" ")).toMatch(/Could not read the schedule for VAN/);
    expect(day.picks).toEqual([]);
  });
});

describe("league leaders", () => {
  it("reads player ids in order and rejects odd shapes", async () => {
    const { parseLeaderRows, seasonId } = await import("../src/data/nhl");
    expect(parseLeaderRows({ data: [{ playerId: 8478402 }, { playerId: 8477934 }] })).toEqual(["8478402", "8477934"]);
    expect(() => parseLeaderRows({})).toThrow();
    expect(seasonId("2026-11-20")).toBe("20262027");
    expect(seasonId("2027-03-01")).toBe("20262027");
  });

  it("prices only leaders, and makes no picks if leaders cannot be read", async () => {
    const NOW = new Date("2026-11-20T18:00:00Z");
    const base: Fetchers = {
      loadSchedule: async () => [{ id: 9, startUtc: "2026-11-21T00:00:00Z", away: "VAN", home: "DET", state: "FUT" }],
      loadClubSchedule: async () => [],
      loadBoxscore: async () => null,
      loadLeaders: async () => {
        throw new Error("boom");
      },
    };
    const { day, log } = await generateDay(base, NOW);
    expect(day.picks).toEqual([]);
    expect(log.join(" ")).toMatch(/league leaders/i);
  });
});
