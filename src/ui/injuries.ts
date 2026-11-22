import { loadInjuries } from "../data/injuries";
import { type Injury, injuryLevel, injuryText } from "../engine/injury";
import { boxNameKey } from "../data/linemate";
import type { HandedPick } from "../engine/types";

/** The last injury list per game, so rows rebuilt by a filter change keep their tag. */
const byGame = new Map<string, Map<string, Injury>>();

function injuryFor(p: HandedPick): Injury | undefined {
  return byGame.get(`${p.sport}|${p.gameId}`)?.get(boxNameKey(p.player));
}

/** Tag a prop row if its player is listed hurt: red OUT, or a ! with the status and reason. */
export function applyInjury(row: HTMLElement, p: HandedPick): void {
  row.querySelector(".s-inj")?.remove();
  row.classList.remove("is-out");
  const inj = injuryFor(p);
  const level = inj ? injuryLevel(inj.status) : null;
  if (!inj || !level) return;
  const tag = document.createElement("span");
  tag.className = `s-inj inj-${level}`;
  tag.textContent = injuryText(inj);
  row.querySelector(".s-main")?.append(tag);
  if (level === "out") row.classList.add("is-out");
}

/** Fetch each NBA and NFL game's injury list now and every five minutes, and tag the rows. */
export function watchInjuries(root: HTMLElement, picks: () => HandedPick[], load: typeof loadInjuries = loadInjuries): () => void {
  let stopped = false;
  const tick = async (): Promise<void> => {
    if (stopped || !root.isConnected) { stop(); return; }
    if (typeof document !== "undefined" && document.hidden) return;
    const shown = picks();
    const games = new Set(shown.filter((p) => p.sport === "nba" || p.sport === "nfl").map((p) => `${p.sport}|${p.gameId}`));
    await Promise.all([...games].map(async (k) => {
      const [sport, id] = k.split("|") as ["nba" | "nfl", string];
      try { byGame.set(k, await load(sport, Number(id))); } catch { /* keep the last list */ }
    }));
    for (const p of shown) {
      const row = root.querySelector<HTMLElement>(`[data-pick-id="${p.id.replace(/"/g, "\\\"")}"]`);
      if (row) applyInjury(row, p);
    }
  };
  const timer = setInterval(() => void tick(), 300_000);
  const stop = () => { stopped = true; clearInterval(timer); };
  void tick();
  return stop;
}
