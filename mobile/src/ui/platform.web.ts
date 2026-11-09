export function followAnchor(id: string) {
  const element = document.getElementById(id);
  if (element) element.tabIndex = -1;
  element?.scrollIntoView({ block: "start" });
  element?.focus();
}
export function captureFocus() {
  const element = document.activeElement as HTMLElement | null;
  return () => {
    if (element?.isConnected) element.focus();
    else document.getElementById("main-content")?.focus();
  };
}
export function modalFocus(id: string, close?: () => void) {
  const element = document.getElementById(id);
  if (!element) return () => {};
  const selector = 'a[href],button,input,select,textarea,[tabindex="0"]';
  const visible = () =>
    Array.from(element.querySelectorAll<HTMLElement>(selector)).filter(
      (n) => n.getClientRects().length && !n.hasAttribute("disabled"),
    );
  const focus = () => visible()[0]?.focus();
  // RN Web may already have focused a control before its onShow callback.
  // Never steal a user's subsequent Tab focus with delayed autofocus.
  if (!element.contains(document.activeElement)) focus();
  const handler = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close?.();
      return;
    }
    if (event.key === "Tab") {
      const nodes = visible(),
        first = nodes[0],
        last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  };
  element.addEventListener("keydown", handler);
  return () => element.removeEventListener("keydown", handler);
}
export function consumeFragment() {
  const value = window.location.hash;
  if (value)
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  return value;
}
export function listenFragments(callback: (url: string) => void) {
  const changed = () => {
    if (window.location.hash) callback(window.location.href);
  };
  window.addEventListener("hashchange", changed);
  changed();
  return () => window.removeEventListener("hashchange", changed);
}
