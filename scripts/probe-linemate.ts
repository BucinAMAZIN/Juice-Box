/** Loads Linemate's public NBA page logged out and prints the data calls it makes, with sample bodies. Read only. */
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
const seen = new Map<string, string>();
page.on("response", async (r) => {
  const u = r.url();
  if (!u.startsWith("https://api.linemate.io/api/nba/") || r.request().method() !== "GET") return;
  const key = u.split("?")[0]! + (u.includes("limit=") ? "" : "");
  if (seen.size > 14 && !seen.has(key)) return;
  try {
    const body = await r.text();
    if (!seen.has(key) || body.length > (seen.get(key)?.length ?? 0)) seen.set(key, `${u}\n    ${body.length} bytes: ${body.slice(0, 1400)}`);
  } catch {}
});
await page.goto("https://linemate.io/nba", { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForTimeout(3000);
for (const [k, v] of seen) console.log(`\n## ${k}\n  ${v}`);
await browser.close();
