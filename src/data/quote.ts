import type { PropQuote } from "../core/evaluate";

export interface ParsedQuote extends PropQuote {
  player: string;
  line: number;
}

const PRICE = "[+-]\\d{3,4}";
const QUOTE = new RegExp(
  `^(.+?)\\s+(\\d+(?:\\.\\d)?)\\s+(?:(?:o|over)\\s*(${PRICE}))?\\s*(?:(?:u|under)\\s*(${PRICE}))?$`,
  "i",
);

/**
 * Parse a hand-entered prop line, for example:
 *   "Alex DeBrincat 3.5 o+100 u-130"
 *   "Kyle Connor 2.5 over -140"
 * At least one side must have a price.
 */
export function parseQuote(text: string): ParsedQuote | null {
  const m = QUOTE.exec(text.trim());
  if (!m) return null;
  const [, player, line, over, under] = m;
  if (!over && !under) return null;
  const quote: ParsedQuote = { player: player!.trim(), line: Number(line) };
  if (over) quote.overOdds = Number(over);
  if (under) quote.underOdds = Number(under);
  return quote;
}

export function parseQuotes(text: string): { quotes: ParsedQuote[]; rejected: string[] } {
  const quotes: ParsedQuote[] = [];
  const rejected: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const q = parseQuote(line);
    if (q) quotes.push(q);
    else rejected.push(line);
  }
  return { quotes, rejected };
}
