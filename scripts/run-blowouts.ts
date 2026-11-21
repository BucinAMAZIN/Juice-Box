import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { loadBoard, loadClosingLine } from "../src/data/ncaa";
import { type BlowoutGame, toBlowout } from "../src/engine/blowouts";

/**
 * track:    keeps every game with a favorite of 20+ from now on, refreshes its line until kickoff, and grades it once final.
 * backfill: reads past seasons' closing lines into history.json (favorites of 15+), so the over rate has a real sample.
 */
const DIR = "public/data/blowouts";
const mode = process.argv.includes("--backfill") ? "backfill" : "track";
const dry = process.argv.includes("--dry-run");
const TRACK_MIN = 20;
const HISTORY_MIN = 15;
const ymd = (d: Date): string => d.toISOString().slice(0, 10).replaceAll("-", "");
const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * 86_400_000);
const read = <T>(p: string, fallback: T): T => (existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : fallback);
const save = (name: string, games: BlowoutGame[]): void => {
  if (dry) return;
  mkdirSync(DIR, { recursive: true });
  writeFileSync(`${DIR}/${name}`, JSON.stringify({ updatedAt: new Date().toISOString(), games }, null, 1) + "\n");
};

async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]!); } }));
  return out;
}

if (mode === "track") {
  const file = `${DIR}/tracked.json`;
  const have = new Map(read<{ games: BlowoutGame[] }>(file, { games: [] }).games.map((g) => [g.id, g]));
  const now = new Date();
  const open = [...have.values()].filter((g) => g.status !== "post").map((g) => g.date.replaceAll("-", ""));
  const from = [ymd(addDays(now, -2)), ...open].sort()[0]!;
  const board = await loadBoard(from, ymd(addDays(now, 8)));
  let added = 0, graded = 0;
  for (const g of board) {
    const prior = have.get(g.id);
    // Final games lose their line on the scoreboard, so a tracked game keeps the line it had.
    const line = g.line && g.state === "pre" ? g.line : prior ? { fav: prior.fav, spread: prior.spread, total: prior.total } : g.state === "post" ? await loadClosingLine(g.id) : g.line;
    if (!line || (!prior && line.spread < TRACK_MIN)) continue;
    const next = toBlowout(g, line);
    if (!prior) added++;
    if (prior?.status !== "post" && next.status === "post") graded++;
    have.set(g.id, next);
  }
  const games = [...have.values()].sort((a, b) => a.start.localeCompare(b.start));
  console.log(`Blowouts: ${board.length} FBS games read, ${added} new favorites of ${TRACK_MIN}+, ${graded} graded, ${games.length} tracked.`);
  for (const g of games.filter((x) => x.status !== "post")) console.log(`  ${g.date} ${g.fav} -${g.spread} vs ${g.dog}, total ${g.total}`);
  save("tracked.json", games);
} else {
  const seasons = [2021, 2022, 2023, 2024, 2025];
  const all: BlowoutGame[] = [];
  for (const y of seasons) {
    const finals = (await loadBoard(`${y}0820`, `${y + 1}0114`, 8)).filter((g) => g.state === "post");
    const unique = finals;
    const lines = await pool(unique, 8, (g) => loadClosingLine(g.id));
    let withLine = 0;
    unique.forEach((g, i) => {
      const line = lines[i];
      if (!line) return;
      withLine++;
      if (line.spread >= HISTORY_MIN) all.push(toBlowout(g, line));
    });
    console.log(`${y}: ${unique.length} finished games, ${withLine} with a closing line, ${all.filter((g) => g.date.startsWith(String(y)) || g.date.startsWith(String(y + 1))).length} favorites of ${HISTORY_MIN}+ so far`);
  }
  all.sort((a, b) => a.start.localeCompare(b.start));
  save("history.json", all);
}
