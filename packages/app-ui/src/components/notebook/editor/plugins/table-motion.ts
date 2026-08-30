export function attachTableMotion(table: HTMLTableElement) {
  const view = table.ownerDocument.defaultView;
  if (!view?.matchMedia || typeof table.animate !== "function") return () => {};

  const preference = view.matchMedia("(prefers-reduced-motion: reduce)");
  const animations = new Set<Animation>();
  const cancel = () => {
    for (const animation of animations) animation.cancel();
    animations.clear();
  };
  const reveal = (element: HTMLElement, opacity: number) => {
    if (preference.matches || !element.isConnected) return;
    const animation = element.animate([{ opacity }, { opacity: 1 }], {
      duration: 180,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    });
    animations.add(animation);
    animation.onfinish = animation.oncancel = () => animations.delete(animation);
  };

  reveal(table, 0);
  const observer = new view.MutationObserver((mutations) => {
    const added = new Set<HTMLElement>();
    let removed = false;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof view.HTMLElement && node.matches("tr, td, th"))
          added.add(node);
      }
      for (const node of mutation.removedNodes) {
        if (node instanceof view.HTMLElement && node.matches("tr, td, th"))
          removed = true;
      }
    }
    if (!added.size && !removed) return;
    cancel();
    const targets = [...added].filter(
      (element) => !element.parentElement || !added.has(element.parentElement),
    );
    if (!targets.length || targets.length > 12) reveal(table, 0.65);
    else for (const element of targets) reveal(element, 0);
  });
  observer.observe(table, { childList: true, subtree: true });
  preference.addEventListener("change", cancel);
  table.addEventListener("keydown", cancel);

  return () => {
    observer.disconnect();
    preference.removeEventListener("change", cancel);
    table.removeEventListener("keydown", cancel);
    cancel();
  };
}
