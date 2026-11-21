import "./styles.css";
import { Ledger } from "./data/ledger";
import { h } from "./ui/dom";
import { renderPicks } from "./ui/picks";
import { renderResults } from "./ui/results";
import { renderStats } from "./ui/stats";
import { renderToday } from "./ui/today";

const ledger = new Ledger(localStorage);
const root = document.getElementById("app")!;

const TABS = [
  ["picks", "Picks", renderPicks],
  ["today", "Price a play", renderToday],
  ["results", "Results", renderResults],
  ["stats", "Stats", renderStats],
] as const;

const view = h("main", { class: "view" });
const nav = h("nav", { class: "tabs", "aria-label": "Sections" });

function current(): (typeof TABS)[number] {
  const key = location.hash.replace("#", "");
  return TABS.find((t) => t[0] === key) ?? TABS[0];
}

function draw(): void {
  const active = current();
  nav.replaceChildren(
    ...TABS.map(([key, label]) =>
      h("a", { href: `#${key}`, class: key === active[0] ? "tab on" : "tab", "aria-current": key === active[0] ? "page" : null }, label),
    ),
  );
  active[2](view, ledger);
}

root.append(h("header", { class: "bar" }, h("h1", {}, "Juice Box"), h("span", { class: "tag" }, "price it before it drops")), view, nav);
window.addEventListener("hashchange", draw);
draw();
