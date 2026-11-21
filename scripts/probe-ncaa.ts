export {};
const B = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard";
for (const q of ["dates=20251109-20251115&groups=80&limit=400", "dates=20251109-20251115&groups=80", "dates=20251109-20251115&limit=400", "dates=20251115&groups=80&limit=400", "dates=20251115&groups=80&limit=300", "dates=2025&seasontype=2&week=11&groups=80&limit=400"]) {
  const r = await fetch(`${B}?${q}`, { headers: { "user-agent": "Mozilla/5.0", accept: "application/json" } });
  const t = await r.text();
  let n = -1; try { n = JSON.parse(t).events.length; } catch {}
  console.log("Q", q, "status", r.status, "events", n, r.ok ? "" : t.slice(0, 160));
}
