export {};
const H = { "user-agent": "Mozilla/5.0" };
const j = async (u: string) => { const r = await fetch(u, { headers: H }); return r.ok ? ((await r.json()) as any) : { __status: r.status }; };
const tests: Array<[string, string, string]> = [["nba", "basketball/nba", "20251115"], ["nfl", "football/nfl", "20251116"], ["ncaaf", "football/college-football", "20251115"], ["mlb", "baseball/mlb", "20250715"], ["nhl", "hockey/nhl", "20251115"]];
for (const [id, path, day] of tests) {
  const [sport, league] = path.split("/");
  const sb = await j(`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${day}`);
  const e = sb.events?.[0]; if (!e) { console.log("NOEVENT", id); continue; }
  const o = await j(`https://sports.core.api.espn.com/v2/sports/${sport}/leagues/${league}/events/${e.id}/competitions/${e.id}/odds`);
  const it = o.items?.[0];
  console.log("ODDS", id, "providers", (o.items ?? []).map((x: any) => x.provider?.id + ":" + x.provider?.name).join("|"), "keys", Object.keys(it ?? {}).join(","));
  console.log("ODDSITEM", id, JSON.stringify(it).slice(0, 1400));
  const s = await j(`https://site.api.espn.com/apis/site/v2/sports/${path}/summary?event=${e.id}`);
  console.log("SUMKEYS", id, Object.keys(s).join(","), "weather", JSON.stringify(s.gameInfo?.weather ?? null), "venue", JSON.stringify(s.gameInfo?.venue?.indoor ?? null));
}
