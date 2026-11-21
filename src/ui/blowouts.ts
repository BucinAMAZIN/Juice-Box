import { type BlowoutGame, RATIO_BANDS, SPREAD_BANDS, isCoreCase, ratioOf, tally } from "../engine/blowouts";
import { clear, h } from "./dom";
import { pct } from "./format";
import { getJson } from "./picks";

export interface BlowoutSource {
  load(name: "tracked" | "history"): Promise<BlowoutGame[] | null>;
}

export const blowoutSource: BlowoutSource = {
  async load(name) {
    const file = await getJson<{ games: BlowoutGame[] }>(`blowouts/${name}.json`);
    return file ? file.games : null;
  },
};

const when = (iso: string): string => new Date(iso).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
const rateText = (games: BlowoutGame[]): string => {
  const t = tally(games);
  return t.overPct == null ? "none yet" : `${pct(t.overPct, 0)} over (${t.over}-${t.under}${t.push ? `-${t.push}` : ""})`;
};

/** Over rate by how big the favorite is and how the total compares with the spread. */
export function bandTable(title: string, games: BlowoutGame[]): HTMLElement {
  const head = h("tr", {}, h("th", {}, ""), ...RATIO_BANDS.map(([label]) => h("th", {}, label)));
  const rows = SPREAD_BANDS.map(([name, inBand]) => {
    const here = games.filter(inBand);
    return h("tr", {}, h("th", { scope: "row" }, `${name} (${tally(here).n})`), ...RATIO_BANDS.map(([, inRatio]) => {
      const cell = here.filter(inRatio);
      return h("td", {}, tally(cell).n ? `${rateText(cell)}` : "–");
    }));
  });
  return h("section", { class: "records" }, h("h3", {}, title), h("div", { class: "scroll" }, h("table", {}, h("thead", {}, head), h("tbody", {}, ...rows))));
}

function upcoming(games: BlowoutGame[]): HTMLElement {
  const open = games.filter((g) => g.status !== "post");
  const sec = h("section", {}, h("h3", {}, "Coming up: favorites of 20 or more"));
  if (open.length === 0) {
    sec.append(h("p", { class: "empty" }, "No games with a favorite of 20 or more on the board right now."));
    return sec;
  }
  for (const g of open) {
    sec.append(h("div", { class: "streak" }, h("div", { class: "s-main" }, h("strong", {}, `${g.fav} -${g.spread} vs ${g.dog}`), h("div", { class: "signals" }, `${when(g.start)} · total ${g.total} (${ratioOf(g).toFixed(2)}x the spread)${isCoreCase(g) ? " · 40+ with a 50 to 52 total" : ""}${g.status === "in" ? " · live" : ""}`))));
  }
  return sec;
}

function finished(games: BlowoutGame[]): HTMLElement {
  const done = games.filter((g) => g.status === "post").sort((a, b) => b.start.localeCompare(a.start));
  const sec = h("section", {}, h("h3", {}, `Tracked results: ${rateText(done)}`));
  if (done.length === 0) {
    sec.append(h("p", { class: "empty" }, "Nothing has finished since tracking started. Results land here after each game."));
    return sec;
  }
  sec.append(bandTable("Tracked, by favorite size and total", done));
  for (const g of done) {
    sec.append(h("div", { class: `streak ${g.result === "over" ? "won" : g.result === "under" ? "lost" : ""}` }, h("div", { class: "s-main" }, h("strong", {}, `${g.fav} ${g.favScore}-${g.dogScore} ${g.dog}`), h("div", { class: "signals" }, `${g.date} · -${g.spread}, total ${g.total} · ${g.points} points · ${g.result}`))));
  }
  return sec;
}

function history(games: BlowoutGame[] | null): HTMLElement {
  const sec = h("section", {}, h("h3", {}, "Past seasons (2021 to 2025)"));
  if (!games || games.length === 0) {
    sec.append(h("p", { class: "empty" }, "Past-season lines have not been loaded yet."));
    return sec;
  }
  const core = games.filter(isCoreCase);
  const big = games.filter((g) => g.spread >= 40);
  const totalBands: Array<[string, (g: BlowoutGame) => boolean]> = [["Total under 50", (g) => g.total < 50], ["Total 50 to 52.5", (g) => g.total >= 50 && g.total <= 52.5], ["Total over 52.5", (g) => g.total > 52.5]];
  sec.append(
    h("p", { class: "note" }, `Favored by 40+ with a total of 50 to 52.5: ${rateText(core)}, ${core.length} games. All favorites of 40+: ${rateText(big)}, ${big.length} games.`),
    h("div", { class: "scroll" }, h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "40+ favorites"), h("th", {}, "Over rate"))), h("tbody", {}, ...totalBands.map(([label, inBand]) => h("tr", {}, h("th", { scope: "row" }, label), h("td", {}, rateText(big.filter(inBand)))))))),
    bandTable("Favorite size by how the total compares with the spread", games),
    h("p", { class: "note" }, "Ratio is the total divided by the spread. A 40-point favorite with a 50 total is 1.25x."),
  );
  return sec;
}

export async function renderBlowouts(view: HTMLElement, _ledger?: unknown, source: BlowoutSource = blowoutSource): Promise<void> {
  clear(view);
  view.append(h("p", { class: "empty" }, "Loading college football lines…"));
  const [tracked, past] = await Promise.all([source.load("tracked").catch(() => null), source.load("history").catch(() => null)]);
  clear(view);
  view.append(h("p", { class: "note" }, "College football games with a big favorite, tracked from the line to the final score. Over rate counts games that finished over the total."));
  view.append(upcoming(tracked ?? []), finished(tracked ?? []), history(past));
}
