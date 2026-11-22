import { NFL_SITE, SITE } from "./espn";
import { boxNameKey } from "./linemate";
import type { Injury } from "../engine/injury";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Every listed injury in an ESPN game summary, by player key (the same key box scores use). */
export function parseInjuries(json: unknown): Map<string, Injury> {
  const out = new Map<string, Injury>();
  const teams = isObj(json) && Array.isArray(json.injuries) ? json.injuries : [];
  for (const t of teams) {
    const list = isObj(t) && Array.isArray(t.injuries) ? t.injuries : [];
    for (const e of list) {
      if (!isObj(e) || !isObj(e.athlete)) continue;
      const name = text(e.athlete.displayName) || text(e.athlete.fullName);
      const status = text(e.status) || (isObj(e.type) ? text(e.type.description) : "");
      if (!name || !status) continue;
      const d = isObj(e.details) ? e.details : {};
      const parts = [text(d.type), text(d.detail)].filter((x, i, a) => x && a.indexOf(x) === i && x.toLowerCase() !== "not injury related");
      const reason = parts.length ? parts.join(", ") : text(e.shortComment).slice(0, 60);
      out.set(boxNameKey(name), { status, reason });
    }
  }
  return out;
}

export async function loadInjuries(sport: "nba" | "nfl", gameId: number): Promise<Map<string, Injury>> {
  const base = sport === "nba" ? SITE : NFL_SITE;
  const res = await fetch(`${base}/summary?event=${gameId}&_=${Date.now()}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseInjuries(await res.json());
}
