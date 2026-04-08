import { useEffect } from "react";
import { playHover, playPress } from "../lib/sounds";

/**
 * Global event-delegation hook that plays hover/press sounds
 * on <button> elements and elements with role="button".
 */
function isButton(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  // Skip elements inside sound-config panels (avoids race with setting update)
  if (el.closest("[data-no-sound]")) return false;
  if (el.tagName === "BUTTON") return true;
  if (el.getAttribute("role") === "button") return true;
  // Walk up to find a button parent (for icon children inside buttons)
  const btn = el.closest("button, [role='button']");
  return btn !== null;
}

export function useButtonSounds() {
  useEffect(() => {
    const onPointerEnter = (e: PointerEvent) => {
      if (e.pointerType === "touch") return; // skip touch — no hover on mobile
      if (isButton(e.target)) playHover();
    };

    const onPointerDown = (e: PointerEvent) => {
      if (isButton(e.target)) playPress();
    };

    document.addEventListener("pointerenter", onPointerEnter, true);
    document.addEventListener("pointerdown", onPointerDown, true);

    return () => {
      document.removeEventListener("pointerenter", onPointerEnter, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, []);
}
