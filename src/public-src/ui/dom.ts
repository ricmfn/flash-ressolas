/** Pequenos helpers de DOM para montar a UI sem framework nenhum. */

type Props = Record<string, string | boolean | ((ev: Event) => void) | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props,
  children?: (Node | string | null | undefined)[],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined) continue;
      if (key.startsWith("on") && typeof value === "function") {
        node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      } else if (key === "class") {
        node.className = String(value);
      } else if (typeof value === "boolean") {
        if (value) node.setAttribute(key, "");
        else node.removeAttribute(key);
      } else {
        node.setAttribute(key, String(value));
      }
    }
  }
  if (children) {
    for (const child of children) {
      if (child === null || child === undefined) continue;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    }
  }
  return node;
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function mount(container: Element, node: Node): void {
  clear(container);
  container.appendChild(node);
}
