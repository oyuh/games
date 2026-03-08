import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

type Pos = "top" | "bottom" | "left" | "right";

const GAP = 8;
const PAD = 8;

function place(
  a: DOMRect,
  t: DOMRect,
  preferred: Pos,
): { pos: Pos; x: number; y: number; ax: number; ay: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const fits: Record<Pos, boolean> = {
    top: a.top - GAP - t.height > PAD,
    bottom: a.bottom + GAP + t.height < vh - PAD,
    left: a.left - GAP - t.width > PAD,
    right: a.right + GAP + t.width < vw - PAD,
  };

  const fallback: Record<Pos, Pos[]> = {
    top: ["bottom", "right", "left"],
    bottom: ["top", "right", "left"],
    left: ["right", "top", "bottom"],
    right: ["left", "top", "bottom"],
  };

  const pos = [preferred, ...fallback[preferred]].find((p) => fits[p]) ?? preferred;

  const cx = a.left + a.width / 2;
  const cy = a.top + a.height / 2;

  let x: number, y: number, ax: number, ay: number;

  if (pos === "top" || pos === "bottom") {
    x = Math.max(PAD, Math.min(cx - t.width / 2, vw - PAD - t.width));
    y = pos === "top" ? a.top - GAP - t.height : a.bottom + GAP;
    ax = cx - x;
    ay = pos === "top" ? t.height : 0;
  } else {
    y = Math.max(PAD, Math.min(cy - t.height / 2, vh - PAD - t.height));
    x = pos === "left" ? a.left - GAP - t.width : a.right + GAP;
    ax = pos === "left" ? t.width : 0;
    ay = cy - y;
  }

  return { pos, x, y, ax, ay };
}

/**
 * Pure-DOM tooltip system. Uses `mouseleave` on the actual target element
 * (never fires between child nodes) and synchronous measurement via forced
 * reflow — no requestAnimationFrame, no React state, no flicker.
 */
export function TooltipLayer() {
  const tipRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const arrowRef = useRef<HTMLSpanElement>(null);
  const activeRef = useRef<Element | null>(null);

  useEffect(() => {
    // Skip on touch-only devices
    if (window.matchMedia("(hover: none)").matches) return;

    const tip = tipRef.current!;
    const textEl = textRef.current!;
    const arrow = arrowRef.current!;

    function hideTip() {
      tip.style.display = "none";
      tip.style.visibility = "";
      if (activeRef.current) {
        activeRef.current.removeEventListener("mouseleave", hideTip);
        activeRef.current = null;
      }
    }

    function showTip(target: Element) {
      // Already showing for this exact element
      if (target === activeRef.current) return;

      const text = target.getAttribute("data-tooltip");
      if (!text) return;

      // Detach old listener if switching targets
      if (activeRef.current) {
        activeRef.current.removeEventListener("mouseleave", hideTip);
      }

      activeRef.current = target;

      // Read preferred position & variant from the target element
      const preferred = (target.getAttribute("data-tooltip-pos") || "top") as Pos;
      const variant = target.getAttribute("data-tooltip-variant") || "default";

      // Set text content
      textEl.textContent = text;

      // Set variant class
      tip.className = `tt tt--${variant}`;

      // Show invisible at 0,0 to measure — getBoundingClientRect forces
      // a synchronous layout so we get exact dimensions in the same frame
      tip.style.display = "block";
      tip.style.visibility = "hidden";
      tip.style.left = "0px";
      tip.style.top = "0px";

      const anchorRect = target.getBoundingClientRect();
      const tipRect = tip.getBoundingClientRect();
      const { pos, x, y, ax, ay } = place(anchorRect, tipRect, preferred);

      // Apply computed position and make visible
      tip.style.left = `${x}px`;
      tip.style.top = `${y}px`;
      tip.style.visibility = "visible";

      // Arrow
      arrow.className = `tt-arrow tt-arrow--${pos}`;
      if (pos === "top" || pos === "bottom") {
        arrow.style.left = `${Math.max(6, Math.min(ax, tipRect.width - 6))}px`;
        arrow.style.top = "";
      } else {
        arrow.style.top = `${Math.max(6, Math.min(ay, tipRect.height - 6))}px`;
        arrow.style.left = "";
      }

      // MOUSELEAVE on the target itself — this event does NOT bubble and
      // does NOT fire when the mouse moves between child elements (SVGs,
      // spans, paths, etc.). It only fires when the pointer truly exits
      // the target element's bounding box.
      target.addEventListener("mouseleave", hideTip, { once: true });
    }

    function onMouseOver(e: Event) {
      const el = (e.target as Element).closest?.("[data-tooltip]");
      if (el && el.getAttribute("data-tooltip")) {
        showTip(el);
      }
    }

    function onScroll() {
      if (activeRef.current) hideTip();
    }

    function onMouseDown() {
      if (activeRef.current) hideTip();
    }

    document.addEventListener("mouseover", onMouseOver, true);
    document.addEventListener("scroll", onScroll, true);
    document.addEventListener("mousedown", onMouseDown, true);

    return () => {
      document.removeEventListener("mouseover", onMouseOver, true);
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("mousedown", onMouseDown, true);
      if (activeRef.current) {
        activeRef.current.removeEventListener("mouseleave", hideTip);
      }
    };
  }, []);

  return createPortal(
    <div ref={tipRef} className="tt" style={{ display: "none" }}>
      <span ref={textRef} />
      <span ref={arrowRef} className="tt-arrow" />
    </div>,
    document.body,
  );
}
