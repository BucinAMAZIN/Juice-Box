export {};
/** Looks at what Linemate gives for Hard Rock (selection ids). Read only. */
const url = "https://api.linemate.io/api/nba/v1/trends/straights?limit=50&offset=0&markets=POINTS";
const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0", accept: "application/json", origin: "https://linemate.io", referer: "https://linemate.io/" } });
const rows = (await res.json()) as Array<any>;
console.log("rows", rows.length);
let shown = 0;
const bookNames = new Set<string>();
for (const r of rows) {
  for (const b of Object.keys(r.market?.books ?? {})) bookNames.add(b);
}
console.log("books:", [...bookNames].join(","));
for (const r of rows) {
  const hr = r.market?.books?.hardrock;
  if (!hr || shown >= 2) continue;
  shown++;
  console.log("HR entry for", r.player?.fullName, JSON.stringify(hr).slice(0, 1600));
}
console.log("featuredProvider samples:", JSON.stringify(rows.slice(0, 5).map((r) => r.featuredProvider)).slice(0, 600));
