export {};
/** Read only: finds the request parameter that makes Linemate return alternate-line rows. */
const H = { "user-agent": "Mozilla/5.0", accept: "application/json", origin: "https://linemate.io", referer: "https://linemate.io/" };
const base = "https://api.linemate.io/api/nba/v1/trends/straights?limit=50&offset=0&markets=POINTS";
const tries = ["", "&alternate=true", "&alternates=true", "&lineType=alternate", "&lineType=ALTERNATE", "&lineTypes=alternate", "&isAlternate=true", "&includeAlternates=true", "&featured=false", "&altLines=true", "&line_type=alternate", "&alt=true"];
for (const t of tries) {
  try {
    const res = await fetch(base + t, { headers: H });
    const rows: any[] = res.ok ? await res.json() : [];
    const alt = rows.filter((r) => r.alternate === true).length;
    const maxey = rows.filter((r) => /Maxey/.test(r.player?.fullName ?? "")).map((r) => `${r.outcome}@${r.line}${r.alternate ? "(alt)" : ""}`);
    console.log("TRY", JSON.stringify(t), "status", res.status, "rows", rows.length, "alt", alt, "maxey", JSON.stringify(maxey));
  } catch (e) {
    console.log("TRY", JSON.stringify(t), "error", String(e));
  }
}
// Does paging reach more rows (all pages, no extra param)?
let total = 0; const lines = new Map<string, number[]>();
for (let page = 0; page < 40; page++) {
  const res = await fetch(`${base}`.replace("offset=0", `offset=${page * 50}`), { headers: H });
  const rows: any[] = res.ok ? await res.json() : [];
  total += rows.length;
  for (const r of rows) if (/Maxey/.test(r.player?.fullName ?? "")) lines.set(r.outcome, [...(lines.get(r.outcome) ?? []), r.line]);
  if (rows.length < 50) break;
}
console.log("PAGED total", total, "maxey lines", JSON.stringify([...lines]));
