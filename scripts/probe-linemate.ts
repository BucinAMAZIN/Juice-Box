export {};
/** Looks at ESPN NFL and Linemate NFL data shapes. Read only. */
const SITE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const COMMON = "https://site.api.espn.com/apis/common/v3/sports/football/nfl";
const cut = (v: unknown, n = 1500) => JSON.stringify(v).slice(0, n);
async function get(url: string, headers: Record<string, string> = { "user-agent": "juice-box" }): Promise<any> {
  const res = await fetch(url, { headers });
  console.log(`GET ${url.slice(0, 150)} -> ${res.status}`);
  return res.ok ? res.json() : null;
}
const sb = await get(`${SITE}/scoreboard?dates=20261101-20261124`);
console.log("range games:", sb?.events?.length, "states:", cut([...new Set(sb?.events?.map((e: any) => e.status?.type?.state))]), "weeks:", cut([...new Set(sb?.events?.map((e: any) => e.week?.number))]));
const fin = sb?.events?.find((e: any) => e.status?.type?.state === "post");
if (fin) {
  const box = await get(`${SITE}/summary?event=${fin.id}`);
  const t = box?.boxscore?.players?.[0];
  console.log("stat blocks:", cut(t?.statistics?.map((s: any) => [s.name, s.keys])), 1800);
  const rec = t?.statistics?.find((s: any) => s.name === "receiving");
  console.log("receiving athletes sample:", cut(rec?.athletes?.slice(0, 2), 900));
}
const by = await get(`${COMMON}/statistics/byathlete?season=2026&seasontype=2&limit=3&sort=receiving.receivingYards%3Adesc`);
console.log("byathlete cats:", cut(by?.categories?.map((c: any) => [c.name, c.names]), 2500));
console.log("byathlete first:", cut(by?.athletes?.[0], 1500));
const H = { "user-agent": "Mozilla/5.0", accept: "application/json", origin: "https://linemate.io", referer: "https://linemate.io/" };
const rows = await get("https://api.linemate.io/api/nfl/v1/trends/straights?limit=50", H);
const names = new Map<string, number>();
let hr = 0;
for (const r of rows ?? []) {
  names.set(`${r.type}/${r.market?.name}`, (names.get(`${r.type}/${r.market?.name}`) ?? 0) + 1);
  if (r.market?.books?.hardrock) hr++;
}
console.log("NFL linemate rows", rows?.length, "with HR:", hr, "markets:", cut([...names]));
console.log("sample team codes:", cut((rows ?? []).slice(0, 6).map((r: any) => [r.team?.code, r.opposingTeam?.code, r.gameId])));
