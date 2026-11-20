export function pct(x: number, digits = 1): string {
  return Number.isFinite(x) ? `${(x * 100).toFixed(digits)}%` : "–";
}

export function signedPct(x: number, digits = 1): string {
  if (!Number.isFinite(x)) return "–";
  return `${x >= 0 ? "+" : ""}${(x * 100).toFixed(digits)}%`;
}

export function units(x: number): string {
  if (!Number.isFinite(x)) return "–";
  return `${x >= 0 ? "+" : ""}${x.toFixed(2)}u`;
}

export function localTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}
