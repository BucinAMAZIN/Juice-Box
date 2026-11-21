export {};
/** Read only: prints one sample of every signal type Linemate attaches, so filters can read them. */
const H = { "user-agent": "Mozilla/5.0", accept: "application/json", origin: "https://linemate.io", referer: "https://linemate.io/" };
const seen = new Map<string, unknown>();
const counts = new Map<string, number>();
for (const sport of ["nba", "nhl", "nfl"]) {
  for (const market of sport === "nba" ? ["POINTS", "ASSISTS"] : sport === "nhl" ? ["SHOTS_ON_GOAL"] : ["RECEIVING_YARDS"]) {
    const res = await fetch(`https://api.linemate.io/api/${sport}/v1/trends/straights?limit=50&offset=0&markets=${market}`, { headers: H });
    const rows: any[] = res.ok ? await res.json() : [];
    for (const r of rows) for (const s of r.signals ?? []) {
      const k = `${sport}:${s.type}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
      if (!seen.has(k)) seen.set(k, s);
    }
    if (rows[0]) console.log("ROWKEYS", sport, JSON.stringify(Object.keys(rows[0])), "side-ish", JSON.stringify({ outcome: rows[0].outcome, line: rows[0].line, isAlt: rows[0].isAlt, alternate: rows[0].alternate, lineType: rows[0].lineType }));
  }
}
console.log("COUNTS", JSON.stringify([...counts]));
for (const [k, v] of seen) console.log("SIGNAL", k, JSON.stringify(v).slice(0, 700));
