export {};
/** Looks at ESPN NFL data shapes. Read only. */
const SITE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const COMMON = "https://site.api.espn.com/apis/common/v3/sports/football/nfl";
const cut = (v: unknown, n = 1500) => JSON.stringify(v).slice(0, n);
async function get(url: string): Promise<any> {
  const res = await fetch(url, { headers: { "user-agent": "juice-box" } });
  console.log(`GET ${url.slice(0, 150)} -> ${res.status}`);
  return res.ok ? res.json() : null;
}
const cur = await get(`${SITE}/scoreboard`);
console.log("current week:", cut(cur?.week), "games:", cur?.events?.length, "first:", cut(cur?.events?.[0] && { date: cur.events[0].date, state: cur.events[0].status?.type?.state, comp: cur.events[0].competitions?.[0]?.competitors?.map((c: any) => [c.team?.abbreviation, c.homeAway]) }));
const wk = Number(cur?.week?.number ?? 11);
const prev = await get(`${SITE}/scoreboard?seasontype=2&week=${wk - 1}`);
console.log("prev week games:", prev?.events?.length, "states:", cut([...new Set(prev?.events?.map((e: any) => e.status?.type?.state))]));
const fin = prev?.events?.find((e: any) => e.status?.type?.state === "post");
if (fin) {
  const box = await get(`${SITE}/summary?event=${fin.id}`);
  const t = box?.boxscore?.players?.[0];
  console.log("completed flag:", cut(box?.header?.competitions?.[0]?.status?.type, 300));
  console.log("stat blocks:", cut(t?.statistics?.map((s: any) => [s.name, s.keys]), 2200));
  const rec = t?.statistics?.find((s: any) => s.name === "receiving");
  console.log("receiving athletes sample:", cut(rec?.athletes?.slice(0, 2), 800));
}
const by = await get(`${COMMON}/statistics/byathlete?season=2026&seasontype=2&limit=2&sort=receiving.receivingYards%3Adesc`);
console.log("byathlete categories[receiving] first athlete:", cut(by?.athletes?.[0]?.categories?.map((c: any) => [c.name, c.values]), 900), "athlete keys:", cut(Object.keys(by?.athletes?.[0]?.athlete ?? {})));
