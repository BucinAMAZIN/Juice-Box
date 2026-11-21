export {};
const H = { "user-agent": "Mozilla/5.0", accept: "application/json", origin: "https://linemate.io", referer: "https://linemate.io/" };
const seenBooks = new Set<string>();
for (const lt of ["ALTERNATE", "MAIN"]) {
  for (let off = 0; off < 1500; off += 50) {
    const r = await fetch(`https://api.linemate.io/api/nba/v1/trends/straights?limit=50&offset=${off}&markets=ASSISTS_PLUS_REBOUNDS&lineTypes=${lt}`, { headers: H });
    if (!r.ok) break;
    const rows: any[] = (await r.json()) as any[];
    if (!rows.length) break;
    for (const x of rows) {
      for (const b of Object.keys(x.market?.books ?? {})) seenBooks.add(b);
      if (!/martin/i.test(x.player?.fullName ?? "") || !/caleb/i.test(x.player?.fullName ?? "")) continue;
      const books: any = x.market?.books ?? {};
      const summ = Object.entries(books).map(([b, v]: any) => `${b}:${v.over?.current?.value}@${v.over?.current?.odds?.american}|alts=${Object.values(v.over?.alternates ?? {}).map((a: any) => a.value + "@" + a.odds?.american).join(",")}`);
      console.log("ROW", lt, x.outcome, "line", x.line, "alt", x.alternate, "streak", x.signals?.find((s: any) => s.type === "RECENT_FORM")?.hitRecord?.hits, JSON.stringify(summ).slice(0, 900));
    }
  }
}
console.log("BOOKS", [...seenBooks].join(","));
