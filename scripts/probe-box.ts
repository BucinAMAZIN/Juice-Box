import { parseNflBox } from "../src/data/espn";
const id = process.argv[2]!;
const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${id}`);
const json = (await res.json()) as any;
const box = parseNflBox(json, Number(id));
console.log("status", JSON.stringify(json.header?.competitions?.[0]?.status));
for (const b of json.boxscore?.players ?? []) {
  console.log("TEAM", b.team?.abbreviation);
  for (const s of b.statistics ?? []) if (s.name === "rushing") console.log("rushing keys", JSON.stringify(s.keys), JSON.stringify((s.athletes ?? []).map((a: any) => [a.athlete?.displayName, a.stats])));
}
console.log("parsed cook", JSON.stringify(box?.players.filter((p) => p.key.includes("cook"))));
