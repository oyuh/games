import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { emitSolo } from "../lib/solo-bus";

/** Which game's undo Ctrl+Z means on each route. Only the solo games have moves to take back. */
const UNDO_BY_ROUTE: [RegExp, "shikaku-undo" | "pips-undo"][] = [
  [/^\/shikaku(\/|$)/, "shikaku-undo"],
  [/^\/pips(\/|$)/, "pips-undo"],
];

/**
 * Ctrl+Z (Cmd+Z on a Mac) undoes your last move, the same as pressing Undo
 * on the sidebar. It fires the same bus event, so each page's own rules about
 * when undo is allowed still decide. A focused text field keeps its own undo.
 */
export function useUndoShortcut() {
  const { pathname } = useLocation();

  useEffect(() => {
    const event = UNDO_BY_ROUTE.find(([route]) => route.test(pathname))?.[1];
    if (!event) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== "z") return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      e.preventDefault();
      emitSolo(event);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pathname]);
}
