export {};
const H = { "user-agent": "Mozilla/5.0" };
const j = async (u: string) => { const r = await fetch(u, { headers: H }); return r.ok ? ((await r.json()) as any) : { __status: r.status }; };
const sb = await j("https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?dates=20251115&groups=80&limit=400");
const evs: any[] = sb.events ?? [];
console.log("EVENTS", evs.length);
let shown = 0;
for (const e of evs.slice(0, 6)) {
  const id = e.id;
  const o = await j(`https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/events/${id}/competitions/${id}/odds`);
  const items: any[] = o.items ?? [];
  console.log("CORE", e.shortName, "status", o.__status ?? "ok", "items", items.length, JSON.stringify(items[0] ?? null).slice(0, 500));
  const s = await j(`https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary?event=${id}`);
  console.log("SUMMARY", e.shortName, "pickcenter", JSON.stringify(s.pickcenter ?? null).slice(0, 400), "againstTheSpread", JSON.stringify(s.againstTheSpread ?? null).slice(0, 200));
  shown++;
}
