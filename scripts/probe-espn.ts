/** Prints the shape of ESPN's public feeds so the NBA and NFL adapters can be written against real data. Read only. */
export {};
const BASE = "https://site.api.espn.com/apis/site/v2/sports";
const CORE = "https://sports.core.api.espn.com/v2/sports";

async function get(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { "user-agent": "juice-box" } });
  console.log(`GET ${url} -> ${res.status}`);
  if (!res.ok) return null;
  return res.json();
}

function shape(v: unknown, depth = 0, max = 3): string {
  if (Array.isArray(v)) return `[${v.length}] ` + (v.length ? shape(v[0], depth + 1, max) : "");
  if (v && typeof v === "object") {
    if (depth >= max) return "{…}";
    return "{" + Object.entries(v).slice(0, 14).map(([k, x]) => `${k}: ${shape(x, depth + 1, max)}`).join(", ") + "}";
  }
  return typeof v === "string" ? JSON.stringify(v.slice(0, 40)) : String(v);
}

for (const [sport, league, season] of [["basketball", "nba", 2027], ["football", "nfl", 2026]] as const) {
  console.log(`\n=== ${league} ===`);
  const sb = (await get(`${BASE}/${sport}/${league}/scoreboard`)) as { events?: Array<{ id: string; date: string; status?: unknown }> } | null;
  console.log("scoreboard:", shape(sb, 0, 2));
  const ev = sb?.events?.[0];
  if (ev) {
    const box = await get(`${BASE}/${sport}/${league}/summary?event=${ev.id}`);
    const b = box as { boxscore?: { players?: unknown[] } } | null;
    console.log("boxscore players:", shape(b?.boxscore?.players, 0, 6));
  }
  const leaders = await get(`${CORE}/${sport}/leagues/${league}/seasons/${season}/types/2/leaders`);
  console.log("leaders:", shape(leaders, 0, 4));
  const byAth = await get(`${BASE.replace("/apis/site/v2", "/apis/common/v3")}/${sport}/${league}/statistics/byathlete?season=${season}&seasontype=2&limit=5`);
  console.log("byathlete:", shape(byAth, 0, 4));
}
