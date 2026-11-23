import { describe, expect, it } from "vitest";
import { parseInjuries } from "../src/data/injuries";
import { injuryLevel, injuryText } from "../src/engine/injury";
import { boxNameKey } from "../src/data/linemate";

describe("injuries", () => {
  it("classifies statuses", () => {
    expect(injuryLevel("Out")).toBe("out");
    expect(injuryLevel("Day-To-Day")).toBe("flag");
    expect(injuryLevel("Questionable")).toBe("flag");
    expect(injuryLevel("Probable")).toBeNull();
  });
  it("reads ESPN's list and writes the tag", () => {
    const json = { injuries: [{ team: {}, injuries: [
      { status: "Day-To-Day", athlete: { displayName: "Shai Gilgeous-Alexander" }, details: { type: "Illness" } },
      { status: "Out", athlete: { displayName: "Giannis Antetokounmpo" }, details: { type: "Knee", detail: "Soreness" } },
    ] }] };
    const m = parseInjuries(json);
    expect(injuryText(m.get(boxNameKey("Shai Gilgeous-Alexander"))!)).toBe("! Day-To-Day · Illness");
    expect(injuryText(m.get(boxNameKey("Giannis Antetokounmpo"))!)).toBe("OUT · Knee, Soreness");
    expect(parseInjuries({}).size).toBe(0);
  });
});

import { defaultFilters, passes, setMinutes } from "../src/ui/filters";
import type { HandedPick } from "../src/engine/types";
describe("playing time filter", () => {
  const pick = (sport: string, player: string) => ({ sport, player, market: "points", line: 1.5, streak: 6 }) as unknown as HandedPick;
  it("uses each sport's own cutoffs and skips sports without a number", () => {
    setMinutes(new Map([["j tatum", 36], ["b role", 12]]), new Map([["c mcdavid", 22], ["d grind", 9]]));
    const f = { ...defaultFilters(), minutes: 2 };
    expect(passes(pick("nba", "Jayson Tatum"), f)).toBe(true);
    expect(passes(pick("nba", "Bob Role"), f)).toBe(false);
    expect(passes(pick("nhl", "Connor McDavid"), f)).toBe(true);
    expect(passes(pick("nhl", "Dan Grind"), f)).toBe(false);
    expect(passes(pick("nfl", "Anyone"), f)).toBe(true);
  });
});

import { findPlayer } from "../src/data/nhl";
describe("NHL name matching", () => {
  it("matches an abbreviated box-score name to the full book name", () => {
    const box = { players: [{ name: "S. Rinzel", points: 1 }] } as never;
    expect(findPlayer(box, "Sam Rinzel")).toBeDefined();
    expect(findPlayer(box, "Sam Other")).toBeUndefined();
  });
});

import { parseEspnNhlBox } from "../src/data/live";
describe("ESPN hockey box", () => {
  it("reads goals, assists, shots and sums points", () => {
    const json = { boxscore: { players: [{ statistics: [{ name: "forwards", keys: ["goals", "assists", "shotsTotal"], athletes: [{ athlete: { displayName: "Brock Boeser" }, stats: ["1", "1", "4"] }] }, { name: "goalies", keys: ["saves"], athletes: [{ athlete: { displayName: "G Tender" }, stats: ["20"] }] }] }] } };
    expect(parseEspnNhlBox(json)).toEqual([{ key: "b boeser", goals: 1, assists: 1, points: 2, sog: 4 }]);
  });
});
