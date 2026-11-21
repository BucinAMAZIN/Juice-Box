export {};
const B = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard";
const get = async (q: string) => { const r = await fetch(`${B}?${q}`, { headers: { "user-agent": "Mozilla/5.0" } }); return r.ok ? ((await r.json()) as any) : { status: r.status, events: [] }; };
for (const q of ["dates=20261121&groups=80&limit=400", "dates=20251115&groups=80&limit=400", "dates=20241109&groups=80&limit=400", "dates=20261122&groups=80&limit=400"]) {
  const j = await get(q);
  const ev: any[] = j.events ?? [];
  let withOdds = 0, big = 0;
  for (const e of ev) {
    const c = e.competitions?.[0]; const o = c?.odds?.[0];
    if (o && (o.spread != null || o.overUnder != null)) withOdds++;
    if (o && Math.abs(o.spread ?? 0) >= 40) { big++; console.log("BIG", q, e.shortName, e.status?.type?.state, "spread", o.spread, "details", o.details, "ou", o.overUnder, "scores", c.competitors?.map((t: any) => t.score).join("-")); }
  }
  console.log("Q", q, "events", ev.length, "withOdds", withOdds, "big", big, j.status ?? "", ev[0] ? JSON.stringify(ev[0].competitions?.[0]?.odds?.[0] ?? null).slice(0, 400) : "");
}
