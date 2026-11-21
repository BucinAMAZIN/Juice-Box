export {};
const H = { "user-agent": "Mozilla/5.0", accept: "application/json" };
const base = "https://api.linemate.io/api/nba/v1/trends/straights?limit=50&offset=0&markets=POINTS";
for (const q of ["&lineTypes=ALTERNATE", "&lineTypes=MAIN", "&lineTypes=ALTERNATE&lineTypes=MAIN", "&lineTypes=ALTERNATE&overUnder=over"]) {
  const r = await fetch(base + q, { headers: H });
  const t = await r.text();
  let rows: any[] = [];
  try { const j = JSON.parse(t); rows = Array.isArray(j) ? j : j.data ?? j.trends ?? j.items ?? []; } catch {}
  const alt = rows.filter((x) => x.alternate).length;
  const mx = rows.filter((x) => /maxey/i.test(x.player ?? x.name ?? "")).map((x) => [x.outcome, x.line, x.alternate]);
  console.log("TRY", q, "status", r.status, "rows", rows.length, "alt", alt, "maxey", JSON.stringify(mx), r.ok ? "" : t.slice(0, 120));
  if (q === "&lineTypes=ALTERNATE" && rows[0]) console.log("SAMPLE", JSON.stringify(rows[0]).slice(0, 600));
}
let total = 0, offset = 0; const mx: any[] = [];
for (; offset < 3000; offset += 50) {
  const r = await fetch(`https://api.linemate.io/api/nba/v1/trends/straights?limit=50&offset=${offset}&markets=POINTS&lineTypes=ALTERNATE`, { headers: H });
  if (!r.ok) { console.log("PAGE stop", offset, r.status); break; }
  const j: any = await r.json(); const rows = Array.isArray(j) ? j : j.data ?? j.trends ?? j.items ?? [];
  if (!rows.length) break; total += rows.length;
  for (const x of rows) if (/maxey/i.test(x.player ?? "")) mx.push([x.outcome, x.line, x.alternate, x.signals?.find?.((s: any) => s.type === "RECENT_FORM")?.hitRecord?.hits + "/" + x.signals?.find?.((s: any) => s.type === "RECENT_FORM")?.hitRecord?.games]);
}
console.log("PAGED total", total, "maxey", JSON.stringify(mx));
