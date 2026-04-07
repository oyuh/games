import { useCallback, useEffect, useRef, useState } from "react";
import { FiX } from "react-icons/fi";

interface BottomSheetProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

/** Distance (px) the sheet must be dragged down before it dismisses */
const DISMISS_THRESHOLD = 100;
/** Max upward pull (px) with rubber-band resistance */
const RUBBER_MAX = 40;

export function BottomSheet({ title, onClose, children }: BottomSheetProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  /* ── closing animation state ── */
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);

  /* ── swipe state (refs to avoid re-renders during gesture) ── */
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);
  const currentOffsetY = useRef(0);
  const isDragging = useRef(false);

  /* Lock body scroll while open */
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  /* ── animated close ── */
  const animateClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    const duration = 250;
    setTimeout(() => onClose(), duration);
  }, [onClose]);

  /* ── backdrop click ── */
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === backdropRef.current) animateClose();
  }, [animateClose]);

  /* ── apply transform during gesture (no React state — direct DOM) ── */
  const applyTransform = useCallback((offsetY: number) => {
    const sheet = sheetRef.current;
    const backdrop = backdropRef.current;
    if (!sheet) return;

    if (offsetY <= 0) {
      const clamped = -Math.min(-offsetY, RUBBER_MAX);
      const rubber = clamped * 0.35;
      sheet.style.transform = `translateY(${rubber}px)`;
      if (backdrop) backdrop.style.opacity = "";
    } else {
      sheet.style.transform = `translateY(${offsetY}px)`;
      if (backdrop) {
        const progress = Math.min(offsetY / 300, 1);
        backdrop.style.opacity = String(1 - progress * 0.6);
      }
    }
  }, []);

  const resetTransform = useCallback(() => {
    const sheet = sheetRef.current;
    const backdrop = backdropRef.current;
    if (sheet) {
      sheet.style.transition = "transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)";
      sheet.style.transform = "";
      const cleanup = () => { sheet.style.transition = ""; sheet.removeEventListener("transitionend", cleanup); };
      sheet.addEventListener("transitionend", cleanup);
    }
    if (backdrop) {
      backdrop.style.transition = "opacity 0.3s cubic-bezier(0.25, 1, 0.5, 1)";
      backdrop.style.opacity = "";
      const cleanup = () => { backdrop.style.transition = ""; backdrop.removeEventListener("transitionend", cleanup); };
      backdrop.addEventListener("transitionend", cleanup);
    }
  }, []);

  /*
   * ── Native touch listeners (non-passive) ──
   * React's synthetic onTouchMove is passive by default in modern browsers,
   * which means e.preventDefault() is silently ignored and the page scrolls
   * behind the sheet. We attach native listeners with { passive: false }
   * so we can actually prevent scroll during the drag gesture.
   */
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;

    const onCloseRef = onClose; // capture for touchEnd

    const handleTouchStart = (e: TouchEvent) => {
      if (closingRef.current) return;
      const touch = e.touches[0];
      touchStartY.current = touch.clientY;
      touchStartTime.current = Date.now();
      currentOffsetY.current = 0;
      isDragging.current = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (closingRef.current) return;
      const touch = e.touches[0];
      const deltaY = touch.clientY - touchStartY.current;
      const bodyEl = bodyRef.current;

      /* If body is scrolled and swiping up, let native scroll handle it */
      if (bodyEl && bodyEl.scrollTop > 0 && deltaY < 0 && !isDragging.current) {
        return;
      }

      if (!isDragging.current) {
        if (deltaY > 6 && (bodyEl ? bodyEl.scrollTop <= 0 : true)) {
          isDragging.current = true;
        } else if (deltaY < -6) {
          const target = e.target as HTMLElement;
          const isHandleArea = target.closest(".m-sheet-handle") || target.closest(".m-sheet-header");
          if (isHandleArea) {
            isDragging.current = true;
          } else {
            return;
          }
        } else {
          return;
        }
      }

      /* THIS is the key fix — actually prevent the page from scrolling */
      e.preventDefault();

      currentOffsetY.current = deltaY;
      applyTransform(deltaY);
    };

    const handleTouchEnd = () => {
      if (!isDragging.current || closingRef.current) {
        isDragging.current = false;
        return;
      }
      isDragging.current = false;

      const offset = currentOffsetY.current;
      const elapsed = Date.now() - touchStartTime.current;
      const velocity = offset / Math.max(elapsed, 1);

      if (offset > DISMISS_THRESHOLD || (offset > 30 && velocity > 0.4)) {
        const s = sheetRef.current;
        const b = backdropRef.current;
        if (s) {
          s.style.transition = "transform 0.25s cubic-bezier(0.25, 1, 0.5, 1)";
          s.style.transform = "translateY(100%)";
        }
        if (b) {
          b.style.transition = "opacity 0.25s cubic-bezier(0.25, 1, 0.5, 1)";
          b.style.opacity = "0";
        }
        closingRef.current = true;
        setTimeout(() => onCloseRef(), 250);
      } else {
        resetTransform();
      }
      currentOffsetY.current = 0;
    };

    /* { passive: false } is critical — it lets preventDefault() work */
    sheet.addEventListener("touchstart", handleTouchStart, { passive: true });
    sheet.addEventListener("touchmove", handleTouchMove, { passive: false });
    sheet.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      sheet.removeEventListener("touchstart", handleTouchStart);
      sheet.removeEventListener("touchmove", handleTouchMove);
      sheet.removeEventListener("touchend", handleTouchEnd);
    };
  }, [onClose, applyTransform, resetTransform]);

  return (
    <div
      className={`m-sheet-backdrop${closing ? " m-sheet-backdrop--closing" : ""}`}
      ref={backdropRef}
      onClick={handleBackdropClick}
    >
      <div
        className={`m-sheet${closing ? " m-sheet--closing" : ""}`}
        ref={sheetRef}
      >
        <div className="m-sheet-handle" />
        <div className="m-sheet-header">
          <h2 className="m-sheet-title">{title}</h2>
          <button className="m-sheet-close" onClick={animateClose}>
            <FiX size={18} />
          </button>
        </div>
        <div className="m-sheet-body" ref={bodyRef}>
          {children}
        </div>
      </div>
    </div>
  );
}
