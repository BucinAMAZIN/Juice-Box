export {};
/** Reads Linemate's public JSON feed (no login) and prints its shape. Read only. */
const API = "https://api.linemate.io/api";

async function get(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0", accept: "application/json", origin: "https://linemate.io", referer: "https://linemate.io/" } });
  console.log(`GET ${url} -> ${res.status}`);
  return res.ok ? res.json() : null;
}

function prune(v: unknown, depth = 0): unknown {
  if (Array.isArray(v)) return v.slice(0, 2).map((x) => prune(x, depth + 1));
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v).slice(0, 40)) {
      if (k === "player" || k === "team" || k === "opposingTeam") { o[k] = "…"; continue; }
      o[k] = depth > 7 ? "…" : prune(x, depth + 1);
    }
    return o;
  }
  return v;
}

for (const sport of ["nba", "nhl", "nfl"]) {
  console.log(`\n=== ${sport} ===`);
  for (const q of ["limit=2000", ""]) {
    const rows = (await get(`${API}/${sport}/v1/trends/straights${q ? "?" + q : ""}`)) as Array<{ market?: { name?: string; level?: string }; type?: string; gameId?: string }> | null;
    if (!Array.isArray(rows)) continue;
    const names = new Map<string, number>();
    for (const r of rows) names.set(`${r.type}/${r.market?.name}`, (names.get(`${r.type}/${r.market?.name}`) ?? 0) + 1);
    console.log(`  q="${q}": ${rows.length} rows; markets:`, JSON.stringify([...names]));
    if (q === "limit=2000" && sport === "nba" && rows[0]) {
      console.log("  SAMPLE ROW:", JSON.stringify(prune(rows[0])).slice(0, 5500));
    }
  }
}
