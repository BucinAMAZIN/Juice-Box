/** Loads Linemate's public pages in a headless browser (logged out) and logs where the data comes from. Read only. */
import { chromium } from "playwright";

const browser = await chromium.launch();
for (const sport of ["nba", "nfl", "nhl"]) {
  const page = await browser.newPage();
  const seen: string[] = [];
  page.on("response", (r) => {
    const t = r.request().resourceType();
    if (t === "xhr" || t === "fetch") seen.push(`${r.status()} ${r.request().method()} ${r.url().slice(0, 160)} ${r.headers()["content-type"] ?? ""}`);
  });
  await page.goto(`https://linemate.io/${sport}`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(3000);
  const text = await page.evaluate(() => document.body.innerText);
  console.log(`\n=== ${sport}: ${text.length} chars of text, ${seen.length} data requests ===`);
  seen.slice(0, 25).forEach((s) => console.log("  " + s));
  console.log(text.slice(0, 1200).replace(/\n+/g, " | "));
  await page.close();
}
await browser.close();
