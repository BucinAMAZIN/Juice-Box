export {};
/** Read only: shows where Linemate keeps a streak count for each prop. */
const H = { "user-agent": "Mozilla/5.0", accept: "application/json", origin: "https://linemate.io", referer: "https://linemate.io/" };
const cut = (v: unknown, n = 1800) => JSON.stringify(v).slice(0, n);
const res = await fetch("https://api.linemate.io/api/nba/v1/trends/straights?limit=50&offset=0&markets=POINTS", { headers: H });
console.log("status", res.status);
const rows: any[] = res.ok ? await res.json() : [];
console.log("rows", rows.length, "keys", cut(Object.keys(rows[0] ?? {})));
const types = new Map<string, number>();
for (const r of rows) for (const s of r.signals ?? []) types.set(s.type, (types.get(s.type) ?? 0) + 1);
console.log("signal types", cut([...types]));
for (const r of rows.slice(0, 3)) {
  const { market, player, ...rest } = r;
  console.log("ROW", cut({ outcome: r.outcome, player: player?.fullName, marketName: market?.name, current: market?.books?.hardrock?.over?.current, rest }, 2500));
}
const sig = rows.flatMap((r) => r.signals ?? []).find((s: any) => s.type !== "RECENT_FORM");
console.log("non-recent-form signal sample", cut(sig));
