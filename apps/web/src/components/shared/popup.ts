import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

/** Gap between the trigger and its popup, and the popup and the window edge. */
const GAP = 6;

/**
 * Where a popup mounts: the body, so cards that clip their overflow can't cut
 * it off. The exception is a vaul drawer (the mobile sheets), which is modal
 * and turns the body inert, so a popup portalled there shows up but never
 * takes a tap. Inside one, the popup mounts in the drawer instead.
 */
export function popupHost(trigger: HTMLElement | null) {
  return trigger?.closest<HTMLElement>("[data-vaul-drawer]") ?? null;
}

/** The visible part of the window. On a phone with the keyboard up, that is
 *  a lot less than innerHeight says. */
function viewport() {
  const vv = window.visualViewport;
  return {
    top: vv?.offsetTop ?? 0,
    height: vv?.height ?? window.innerHeight,
    width: vv?.width ?? window.innerWidth,
  };
}

/**
 * Anchor a floating popup to its trigger. It is positioned by hand and kept in
 * place while the page scrolls, against the viewport on the body or against
 * the drawer when it mounts inside one.
 *
 * It opens below unless there is more room above, and it holds that side for
 * as long as it stays open: a searchable list shrinks as you type, and one
 * that jumped to the other side mid-word would be impossible to aim at. An
 * above popup is pinned by its bottom edge, so shrinking pulls it toward the
 * trigger rather than away. Whatever side it lands on, it is capped to the
 * room there and scrolls inside that.
 *
 * `layoutKey` is anything that changes the popup's size, like how many rows
 * are showing. `maxRem` is the height its CSS caps it at, which the room on
 * each side is weighed against. The room it lands with goes on the popup as
 * --popup-room, for the CSS to cap it with: `min(<maxRem>, var(--popup-room))`.
 */
export function useAnchoredPopup(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  popupRef: RefObject<HTMLElement | null>,
  layoutKey: unknown,
  maxRem = 15,
): CSSProperties {
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const sideRef = useRef<"below" | "above" | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      sideRef.current = null;
      return;
    }
    const place = (reconsider: boolean) => {
      const trigger = triggerRef.current;
      const popup = popupRef.current;
      if (!trigger || !popup) return;
      const rect = trigger.getBoundingClientRect();
      const view = viewport();
      const below = view.top + view.height - rect.bottom - GAP * 2;
      const above = rect.top - view.top - GAP * 2;

      // scrollHeight ignores the cap, so this is the height it wants.
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const wants = Math.min(popup.scrollHeight + 2, maxRem * rem);
      const room = (side: "below" | "above") => (side === "below" ? below : above);
      const other = sideRef.current === "below" ? "above" : "below";
      // The page scrolled the trigger to an edge with the popup open. Holding
      // the side is for a list that shrinks, not one pushed off the screen.
      const squeezed = sideRef.current !== null
        && room(sideRef.current) < Math.min(wants, 160)
        && room(other) > room(sideRef.current);

      if (reconsider || !sideRef.current || squeezed) {
        sideRef.current = below >= wants || below >= above ? "below" : "above";
      }

      const host = popupHost(trigger)?.getBoundingClientRect();
      const width = popup.offsetWidth;
      const left = Math.max(GAP, Math.min(rect.left, view.width - width - GAP));
      const space = Math.max(120, room(sideRef.current));
      const next = {
        left: left - (host?.left ?? 0),
        minWidth: rect.width,
        "--popup-room": `${space}px`,
        ...(host ? { position: "absolute" } : {}),
      } as CSSProperties;
      if (sideRef.current === "below") {
        next.top = rect.bottom + GAP - (host?.top ?? 0);
      } else {
        next.bottom = (host ? host.bottom : window.innerHeight) - rect.top + GAP;
      }
      setStyle(next);
    };

    place(false);
    const onScroll = () => place(false);
    // A resize is the keyboard coming up or the phone turning, which can
    // change which side has room, so that one gets to reconsider.
    const onResize = () => place(true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, [open, layoutKey, maxRem, triggerRef, popupRef]);

  return open && style
    ? style
    // First pass, before the layout effect has measured: off-screen so the
    // measurement is real but nothing flashes in the wrong place.
    : { top: -9999, left: 0, visibility: "hidden" };
}

/** Close on a click anywhere outside, or on escape from anywhere. */
export function useDismiss(
  open: boolean,
  close: () => void,
  triggerRef: RefObject<HTMLElement | null>,
  popupRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      close();
    };
    // On the document rather than the trigger, so escape still closes the
    // popup when focus has wandered off somewhere else.
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open, close, triggerRef, popupRef]);
}

/**
 * Scrolls a popup's list so its highlighted row shows, touching nothing but
 * the list. Not scrollIntoView: on its first pass a popup is parked
 * off-screen to be measured, and that would scroll the whole page out from
 * under the trigger. The list needs to be the rows' offsetParent.
 */
export function revealActiveRow(list: HTMLElement | null) {
  const row = list?.querySelector<HTMLElement>("[data-active]");
  if (!list || !row) return;
  if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop;
  else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) {
    list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight;
  }
}
