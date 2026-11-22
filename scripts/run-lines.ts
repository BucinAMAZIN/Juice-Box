import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { LEAGUES, type League, leagueById } from "../src/data/leagues";
import { loadBoard, loadClosingLine, loadExtras } from "../src/data/ncaa";
import { type LineGame, type LineRow, toLineGame, toRow } from "../src/engine/lines";

/**
 * track (default): every game with a line, in every league that has games now. Refreshes the line until kickoff and records the final score.
 * --backfill --league=nba: reads past seasons' closing lines into lines/nba/history.json. Skips games already stored.
 */
const DIR = "public/data/lines";
const backfill = process.argv.includes("--backfill");
const extras = process.argv.includes("--extras");
const dry = process.argv.includes("--dry-run");
const only = process.argv.find((a) => a.startsWith("--league="))?.slice(9);
const ymd = (d: Date): string => d.toISOString().slice(0, 10).replaceAll("-", "");
const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * 86_400_000);
const read = <T>(p: string, fallback: T): T => (existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : fallback);
const write = (league: League, name: string, body: object): void => {
  if (dry) return;
  mkdirSync(`${DIR}/${league.id}`, { recursive: true });
  writeFileSync(`${DIR}/${league.id}/${name}`, JSON.stringify({ updatedAt: new Date().toISOString(), ...body }) + "\n");
};

async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]!); } }));
  return out;
}

async function track(league: League): Promise<void> {
  const file = `${DIR}/${league.id}/tracked.json`;
  const have = new Map(read<{ games: LineGame[] }>(file, { games: [] }).games.map((g) => [g.id, g]));
  const now = new Date();
  const open = [...have.values()].filter((g) => g.status !== "post").map((g) => g.date.replaceAll("-", ""));
  const from = [ymd(addDays(now, -2)), ...open].sort()[0]!;
  const board = await loadBoard(from, ymd(addDays(now, 7)), 6, league);
  let added = 0, graded = 0;
  for (const g of board) {
    const prior = have.get(g.id);
    // A finished game loses its line on the scoreboard, so a tracked game keeps the line it had.
    const line = g.line && g.state === "pre" ? g.line : prior ? { fav: prior.fav, spread: prior.spread, total: prior.total, favHome: prior.favHome } : g.state === "post" ? await loadClosingLine(g.id, league) : g.line;
    if (!line) continue;
    const next = toLineGame(g, line);
    if (prior?.favWin != null && next.favWin == null) next.favWin = prior.favWin;
    if (prior?.dogWin != null && next.dogWin == null) next.dogWin = prior.dogWin;
    if (!prior) added++;
    if (prior?.status !== "post" && next.status === "post") graded++;
    have.set(g.id, next);
  }
  const games = [...have.values()].sort((a, b) => a.start.localeCompare(b.start));
  console.log(`${league.label}: ${board.length} games read, ${added} new with a line, ${graded} graded, ${games.length} tracked.`);
  write(league, "tracked.json", { games });
}

async function history(league: League): Promise<void> {
  const file = `${DIR}/${league.id}/history.json`;
  const rows = read<{ rows: LineRow[] }>(file, { rows: [] }).rows;
  const known = new Set(rows.map((r) => r[0]));
  const yesterday = addDays(new Date(), -1);
  for (const y of league.seasons) {
    const start = new Date(Date.UTC(y, league.start[0] - 1, league.start[1]));
    if (start > yesterday) continue;
    const endYear = league.end[0] < league.start[0] ? y + 1 : y;
    const end = new Date(Math.min(Date.UTC(endYear, league.end[0] - 1, league.end[1]), yesterday.getTime()));
    const finals = (await loadBoard(ymd(start), ymd(end), 8, league)).filter((g) => g.state === "post" && !known.has(g.id));
    const lines = await pool(finals, 8, (g) => loadClosingLine(g.id, league));
    let kept = 0;
    finals.forEach((g, i) => {
      const line = lines[i];
      const row = line ? toRow(toLineGame(g, line)) : null;
      if (row) { rows.push(row); known.add(g.id); kept++; }
    });
    console.log(`${league.label} ${y}: ${finals.length} new finished games, ${kept} with a closing line.`);
    rows.sort((a, b) => a[1].localeCompare(b[1]));
    write(league, "history.json", { rows });
  }
}

/** Opening total and the price on each side, for every game in the history. Written to extras.json as id -> [openTotal, openOver, openUnder, closeOver, closeUnder]. */
async function addExtras(league: League): Promise<void> {
  const file = `${DIR}/${league.id}/extras.json`;
  const rows = read<{ rows: Record<string, Array<number | null>> }>(file, { rows: {} }).rows;
  const ids = read<{ rows: LineRow[] }>(`${DIR}/${league.id}/history.json`, { rows: [] }).rows.map((r) => r[0]).filter((id) => !(id in rows));
  let kept = 0;
  const found = await pool(ids, 8, (id) => loadExtras(id, league));
  ids.forEach((id, i) => {
    const e = found[i];
    if (!e) return;
    rows[id] = [e.openTotal, e.openOver, e.openUnder, e.closeOver, e.closeUnder];
    kept++;
  });
  console.log(`${league.label}: ${ids.length} games asked, ${kept} with an opening line and prices.`);
  write(league, "extras.json", { rows });
}

const targets = only ? [leagueById(only)].filter((l): l is League => !!l) : LEAGUES;
for (const l of targets) {
  try {
    await (extras ? addExtras(l) : backfill ? history(l) : track(l));
  } catch (e) {
    console.log(`${l.label}: failed (${e instanceof Error ? e.message : e})`);
  }
}
