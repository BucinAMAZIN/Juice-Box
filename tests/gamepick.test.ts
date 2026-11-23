// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { clearGames, gamePicker, gameSelected, matchKey, selectedCount } from "../src/ui/gamepick";

describe("game picker", () => {
  beforeEach(() => clearGames());

  it("keys a game the same from props (Linemate codes) and lines (ESPN codes)", () => {
    expect(matchKey("nba", "NY", "POR")).toBe(matchKey("nba", "POR", "NYK"));
    expect(matchKey("nhl", "WSH", "BOS")).toBe(matchKey("nhl", "BOS", "WSH"));
  });

  it("shows everything until games are ticked, then only those", () => {
    const a = matchKey("nba", "NY", "POR");
    const b = matchKey("nba", "SA", "NO");
    const c = matchKey("nba", "BOS", "SAC");
    expect(gameSelected(a)).toBe(true);
    let changes = 0;
    const box = gamePicker([[a, "POR @ NY"], [b, "NO @ SA"], [c, "SAC @ BOS"]], () => changes++);
    document.body.append(box);
    const inputs = [...box.querySelectorAll("input")] as HTMLInputElement[];
    inputs[1]!.click();
    inputs[3]!.click();
    expect(selectedCount()).toBe(2);
    expect(gameSelected(a)).toBe(true);
    expect(gameSelected(b)).toBe(false);
    expect(gameSelected(c)).toBe(true);
    expect(box.querySelector("summary")!.textContent).toBe("2 games");
    inputs[0]!.click();
    expect(selectedCount()).toBe(0);
    expect(gameSelected(b)).toBe(true);
    expect(changes).toBe(3);
  });
});
