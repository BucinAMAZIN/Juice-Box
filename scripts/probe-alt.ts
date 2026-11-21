export {};
/** Read only: looks in Linemate's public site code for the request parameter behind "Alternate Lines". */
const H = { "user-agent": "Mozilla/5.0", accept: "*/*" };
const get = async (u: string) => {
  const r = await fetch(u, { headers: H });
  return r.ok ? r.text() : "";
};
const html = await get("https://linemate.io/");
console.log("HTML bytes", html.length);
const srcs = [...html.matchAll(/(?:src|href)="([^"]+\.js[^"]*)"/g)].map((m) => new URL(m[1]!, "https://linemate.io/").href);
console.log("SCRIPTS", srcs.length);
const seen = new Set<string>();
let hits = 0;
const scan = async (u: string, depth: number) => {
  if (seen.has(u) || seen.size > 60) return;
  seen.add(u);
  const js = await get(u);
  for (const m of js.matchAll(/.{0,160}(?:alternate|lineType|line_type|isAlt)[A-Za-z_]*.{0,160}/gi)) {
    if (hits++ < 25) console.log("HIT", u.split("/").pop(), JSON.stringify(m[0]).slice(0, 360));
  }
  if (depth < 1) for (const m of js.matchAll(/["'`]([^"'`\s]{3,80}\.js)["'`]/g)) await scan(new URL(m[1]!, u).href, depth + 1);
};
for (const s of srcs) await scan(s, 0);
console.log("SCANNED", seen.size, "HITS", hits);
