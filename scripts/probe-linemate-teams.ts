/** Discovery only: which row types and market names does Linemate's trends feed carry beyond player props? Prints a summary, writes nothing. */
const BASE = "https://api.linemate.io/api";
const headers = { "user-agent": "Mozilla/5.0", accept: "application/json", origin: "https://linemate.io", referer: "https://linemate.io/" };
const get = async (url: string) => {
  const r = await fetch(url, { headers });
  return { status: r.status, body: r.ok ? ((await r.json()) as unknown) : null };
};
for (const sport of ["nba", "nfl", "nhl", "mlb"]) {
  const types = new Map<string, number>();
  const markets = new Map<string, number>();
  let sample: unknown = null;
  for (let page = 0; page < 12; page++) {
    const { status, body } = await get(`${BASE}/${sport}/v1/trends/straights?limit=50&offset=${page * 50}&lineTypes=MAIN`);
    if (status !== 200 || !Array.isArray(body) || body.length === 0) { if (page === 0) console.log(`${sport}: HTTP ${status}`); break; }
    for (const r of body as Array<Record<string, any>>) {
      types.set(String(r.type), (types.get(String(r.type)) ?? 0) + 1);
      const m = `${r.type}:${r.market?.name}`;
      markets.set(m, (markets.get(m) ?? 0) + 1);
      if (r.type !== "player" && !sample) sample = r;
    }
  }
  console.log(`${sport} types`, JSON.stringify([...types]));
  console.log(`${sport} markets`, JSON.stringify([...markets]));
  if (sample) console.log(`${sport} non-player sample`, JSON.stringify(sample).slice(0, 2500));
  // Try explicit market names that a spread or team feed might use.
  for (const m of ["SPREAD", "POINT_SPREAD", "TOTAL", "GAME_TOTAL", "MONEYLINE", "TEAM_TOTAL", "TEAM_POINTS", "ALTERNATE_SPREAD"]) {
    const { status, body } = await get(`${BASE}/${sport}/v1/trends/straights?limit=3&markets=${m}`);
    console.log(`${sport} markets=${m}: HTTP ${status}, ${Array.isArray(body) ? body.length : "-"} rows${Array.isArray(body) && body[0] ? ` type=${(body[0] as any).type}` : ""}`);
  }
  for (const path of ["trends/teams", "trends/team", "team-trends", "trends/games", "trends/spreads"]) {
    const { status } = await get(`${BASE}/${sport}/v1/${path}?limit=3`);
    console.log(`${sport} /${path}: HTTP ${status}`);
  }
}
