export {};
/** Prints details of ESPN's public NBA feeds so the adapter can be written against real data. Read only. */
const SITE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const CORE = "https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba";
const COMMON = "https://site.api.espn.com/apis/common/v3/sports/basketball/nba";

async function get(url: string): Promise<any> {
  const res = await fetch(url, { headers: { "user-agent": "juice-box" } });
  console.log(`GET ${url} -> ${res.status}`);
  return res.ok ? res.json() : null;
}
const cut = (v: unknown, n = 1800) => JSON.stringify(v).slice(0, n);

const sb = await get(`${SITE}/scoreboard?dates=20261119`);
console.log("games on 20261119:", sb?.events?.length, "status:", cut(sb?.events?.[0]?.status?.type, 300));
const ev = sb?.events?.[0];
if (ev) {
  console.log("event keys:", Object.keys(ev).join(","), "date:", ev.date, "comp teams:", cut(ev.competitions?.[0]?.competitors?.map((c: any) => [c.team?.abbreviation, c.homeAway]), 300));
  const box = await get(`${SITE}/summary?event=${ev.id}`);
  const t = box?.boxscore?.players?.[0];
  console.log("box team stat blocks:", t?.statistics?.length, "keys:", cut(t?.statistics?.[0]?.keys, 400));
  console.log("first athletes:", cut(t?.statistics?.[0]?.athletes?.slice(0, 2), 1500));
}
const leaders = await get(`${CORE}/seasons/2027/types/2/leaders`);
console.log("leader categories:", cut(leaders?.categories?.map((c: any) => c.name), 600));
const ppg = leaders?.categories?.find((c: any) => c.name === "pointsPerGame");
console.log("ppg first 2:", cut(ppg?.leaders?.slice(0, 2), 1200));
const by = await get(`${COMMON}/statistics/byathlete?season=2027&seasontype=2&limit=3&sort=offensive.avgPoints%3Adesc`);
console.log("byathlete categories:", cut(by?.categories?.map((c: any) => [c.name, c.names]), 1500));
console.log("byathlete first athlete:", cut(by?.athletes?.[0]?.categories, 1800));
console.log("first 3 names:", cut(by?.athletes?.map((a: any) => a.athlete?.displayName), 300));
