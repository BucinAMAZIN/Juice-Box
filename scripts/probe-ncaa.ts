export {};
const H = { "user-agent": "Mozilla/5.0" };
const j = async (u: string) => { const r = await fetch(u, { headers: H }); return r.ok ? ((await r.json()) as any) : { __status: r.status }; };
for (const [id, path, day] of [["nba", "basketball/nba", "20251115"], ["nfl", "football/nfl", "20251116"], ["mlb", "baseball/mlb", "20250715"], ["ncaaf", "football/college-football", "20251115"]] as const) {
  const [sport, league] = path.split("/");
  const sb = await j(`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${day}`);
  for (const e of (sb.events ?? []).slice(0, 2)) {
    const o = await j(`https://sports.core.api.espn.com/v2/sports/${sport}/leagues/${league}/events/${e.id}/competitions/${e.id}/odds`);
    const it = o.items?.[0] ?? {};
    console.log("TOP", id, e.id, "ou", it.overUnder, "overOdds", it.overOdds, "underOdds", it.underOdds, "spread", it.spread, "initOU", it.initialOverUnder, "initSp", it.initialSpread);
    console.log("OPEN", id, JSON.stringify(it.open)?.slice(0, 700));
    console.log("CLOSE", id, JSON.stringify(it.close)?.slice(0, 700));
  }
}
