import { useCallback, useLayoutEffect, useRef, useState } from "react";

/**
 * Tracks a scrolling list's edges: whether anything is hidden above, and how
 * many of its children still sit below the fold. Drives the fade-at-the-edges
 * lists on the home cards (`data-fade-top` / `data-fade-bottom`).
 *
 * Children are measured by offsetTop, so the list must be their offsetParent
 * (give it `position: relative`). Pass whatever changes the children as
 * `deps` so a new row is counted without waiting for a scroll.
 */
export function useScrollEdges<T extends HTMLElement>(deps: unknown[] = []) {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState({ above: false, below: 0 });

  const measure = useCallback(() => {
    const list = ref.current;
    if (!list) return;
    const viewBottom = list.scrollTop + list.clientHeight;
    const above = list.scrollTop > 1;
    let below = 0;
    for (const child of list.children) {
      const el = child as HTMLElement;
      if (el.offsetTop + el.offsetHeight > viewBottom + 1) below++;
    }
    setEdges((prev) => (prev.above === above && prev.below === below ? prev : { above, below }));
  }, []);

  useLayoutEffect(() => {
    const list = ref.current;
    if (!list) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, ...deps]);

  const fadeProps = {
    ref,
    onScroll: measure,
    "data-fade-top": edges.above ? "" : undefined,
    "data-fade-bottom": edges.below > 0 ? "" : undefined,
  };

  return { ...edges, fadeProps };
}
