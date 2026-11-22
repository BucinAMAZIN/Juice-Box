import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { easternDate } from "../src/data/autograde";
import { loadTeamTrends } from "../src/data/teamtrends";
import type { LineGame } from "../src/engine/lines";
import { type TeamTrend, type TrendOutcome, canonTeam, finalFor, gradeTrend } from "../src/engine/teamtrends";

/**
 * Saves Linemate's team trends (spreads, team totals, moneylines, game totals) by game day, and grades finished games
 * against the scores the lines tracker already keeps. Failure here never blocks the rest of the run.
 */
const DIR = "public/data/team-trends";
const dry = process.argv.includes("--dry-run");
const now = new Date();
type Saved = TeamTrend & { outcome?: TrendOutcome };
const read = <T>(p: string, fb: T): T => (existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : fb);
const dayFile = (d: string) => `${DIR}/${d}.json`;

/** Linemate lists a trend on every line a team has cleared, so the pile is large. Keep ones with 5+ games and at least 80% hits. */
const worthKeeping = (t: TeamTrend): boolean => t.games >= 5 && t.hits / t.games >= 0.8;

const days = new Map<string, Map<string, Saved>>();
const load = (d: string) => {
  if (!days.has(d)) days.set(d, new Map(read<{ trends: Saved[] }>(dayFile(d), { trends: [] }).trends.map((t) => [t.id, t])));
  return days.get(d)!;
};

for (const sport of ["nba", "nfl", "nhl"] as const) {
  try {
    const fresh = (await loadTeamTrends(sport)).filter(worthKeeping);
    let added = 0;
    for (const t of fresh) {
      const day = load(easternDate(t.start));
      const prior = day.get(t.id);
      // Once a game has started the saved row is frozen, so the record graded is the one that was on offer before kickoff.
      if (prior && Date.parse(prior.start) <= now.getTime()) continue;
      if (!prior) added++;
      day.set(t.id, { ...t, ...(prior?.outcome ? { outcome: prior.outcome } : {}) });
    }
    console.log(`${sport.toUpperCase()}: ${fresh.length} team trends kept, ${added} new.`);
  } catch (err) {
    console.log(`${sport.toUpperCase()}: skipped (${err instanceof Error ? err.message : err})`);
  }
}

// Grade: any saved trend whose game finished and has not been graded yet.
if (existsSync(DIR)) for (const f of readdirSync(DIR).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) load(f.slice(0, 10));
const finals: Record<string, LineGame[]> = {};
let graded = 0, unmatched = 0;
for (const day of days.values()) {
  for (const t of day.values()) {
    if (t.outcome || Date.parse(t.start) > now.getTime() - 3 * 3_600_000) continue;
    finals[t.sport] ??= read<{ games: LineGame[] }>(`public/data/lines/${t.sport}/tracked.json`, { games: [] }).games.filter((g) => g.status === "post");
    const score = finalFor(t, finals[t.sport]!, (c) => canonTeam(t.sport, c));
    if (!score) { unmatched++; continue; }
    t.outcome = gradeTrend(t, score);
    graded++;
  }
}
console.log(`Graded ${graded} team trends, ${unmatched} not matched to a final yet.`);

if (!dry) {
  mkdirSync(DIR, { recursive: true });
  const dates: string[] = [];
  for (const [d, m] of days) {
    if (m.size === 0) continue;
    dates.push(d);
    writeFileSync(dayFile(d), JSON.stringify({ date: d, updatedAt: now.toISOString(), trends: [...m.values()].sort((a, b) => a.start.localeCompare(b.start)) }) + "\n");
  }
  const all = new Set([...dates, ...read<{ dates: string[] }>(`${DIR}/index.json`, { dates: [] }).dates]);
  writeFileSync(`${DIR}/index.json`, JSON.stringify({ dates: [...all].sort(), updatedAt: now.toISOString() }) + "\n");
}
