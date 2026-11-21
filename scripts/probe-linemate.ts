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

type Row = { market?: { name?: string }; gameId?: string };
const base = `${API}/nba/v1/trends/straights`;
for (const q of ["limit=100", "limit=50", "limit=20&offset=20", "limit=20&page=2", "markets=POINTS", "market=POINTS&limit=50", "gameId=20261120-IND-CLE", "sortBy=hitRate&limit=50", "minHitRate=0.8"]) {
  const rows = (await get(`${base}?${q}`)) as Row[] | null;
  if (Array.isArray(rows)) console.log(`  ${q}: ${rows.length} rows, first=${rows[0]?.gameId}/${rows[0]?.market?.name}, last=${rows.at(-1)?.gameId}/${rows.at(-1)?.market?.name}`);
}
const rows = (await get(base)) as Array<Record<string, unknown>> | null;
if (rows?.[0]) {
  console.log("TOP-LEVEL KEYS:", Object.keys(rows[0]).join(","));
  console.log("SAMPLE ROW:", JSON.stringify(prune(rows[0])).slice(0, 6500));
}
const games = (await get(`${API}/nba/v3/games/current`)) as Array<Record<string, unknown>> | null;
if (games?.[0]) console.log("GAME KEYS:", Object.keys(games[0]).join(","));
