/** Discovery only: how Linemate describes team rows (spread, team total, moneyline). Prints a summary, writes nothing. */
const BASE = "https://api.linemate.io/api";
const headers = { "user-agent": "Mozilla/5.0", accept: "application/json", origin: "https://linemate.io", referer: "https://linemate.io/" };
for (const sport of ["nba", "nfl", "nhl"]) {
  for (const market of ["SPREAD", "TEAM_TOTAL", "MONEY_LINE", "GAME_TOTAL"]) {
    const res = await fetch(`${BASE}/${sport}/v1/trends/straights?limit=50&markets=${market}&lineTypes=MAIN`, { headers });
    const rows = res.ok ? ((await res.json()) as Array<Record<string, any>>) : [];
    console.log(`${sport} ${market}: HTTP ${res.status}, ${rows.length} rows`);
    const books = new Set<string>();
    for (const r of rows) for (const b of Object.keys(r.market?.books ?? {})) books.add(b);
    console.log(`  books: ${[...books].join(",")}`);
    for (const r of rows.slice(0, 4)) {
      const hr = r.market?.books?.hardrock;
      console.log("  ", JSON.stringify({ gameId: r.gameId, team: r.team?.code, opp: r.opposingTeam?.code, home: r.home, outcome: r.outcome, line: r.line, alternate: r.alternate, streak: r.streak, signals: (r.signals ?? []).map((s: any) => ({ t: s.type, h: s.hitRecord })), topKeys: Object.keys(r), hardrock: hr ? JSON.stringify(hr).slice(0, 300) : null }).slice(0, 1800));
    }
  }
}
