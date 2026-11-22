// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { showProp } from "../src/ui/live";

describe("showProp", () => {
  it("fills the live strip with text and a bar", () => {
    const row = document.createElement("article");
    row.innerHTML = '<div class="s-live" hidden></div>';
    const pick = { side: "over", line: 29.5, market: "recYds", id: "x" } as never;
    showProp(row, pick, { status: { state: "in", detail: "9:46 - 1st", frac: 0.1 }, stat: () => 10 });
    const box = row.querySelector<HTMLElement>(".s-live")!;
    expect(box.hidden).toBe(false);
    expect(box.querySelector(".s-bar i")).not.toBeNull();
    expect(box.textContent).toContain("LIVE");
  });
});
