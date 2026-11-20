type Child = Node | string | number | null | undefined | false;

/**
 * Tiny element builder. Text is always added as a text node, never as HTML, so a player name
 * or note typed by the user cannot inject markup.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = String(value);
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    else if (key in node) (node as unknown as Record<string, unknown>)[key] = value;
    else node.setAttribute(key, String(value));
  }
  for (const child of children) {
    if (child == null || child === false) continue;
    node.append(typeof child === "object" ? child : String(child));
  }
  return node;
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}
