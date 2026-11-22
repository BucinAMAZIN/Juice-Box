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
