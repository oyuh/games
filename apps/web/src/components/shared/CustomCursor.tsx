import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useLocation } from "react-router-dom";
import { GAME_META, getGameSlugFromPath, type GameSlug } from "@games/shared";
import { useSettings } from "../../lib/settings";

type CursorKind = "default" | "pointer" | "text" | "crosshair" | "slider" | "map" | "grab" | "grabbing" | "help" | "not-allowed" | "resize";
type CursorAsset =
  | {
      type: "image";
      name: string;
      base: string;
      mask: string;
      width: number;
      height: number;
      hotX: number;
      hotY: number;
    }
  | {
      type: "cross" | "slider";
      name: string;
      width: number;
      height: number;
      hotX: number;
      hotY: number;
    };

const cursorUrl = (path: string) => `${import.meta.env.BASE_URL.replace(/\/?$/, "/")}${path}`;
const cursorSize = (value: number) => Math.round(value * 0.51);
const crossCursorSize = (value: number) => Math.round(value * 0.69);

const CURSOR_ASSETS = {
  default: {
    type: "image",
    name: "default",
    base: cursorUrl("cursor/internals/cursor-default-base.png"),
    mask: cursorUrl("cursor/internals/cursor-default-tip-mask.png"),
    width: cursorSize(30),
    height: cursorSize(47),
    hotX: cursorSize(5),
    hotY: cursorSize(5),
  },
  pointer: {
    type: "image",
    name: "select-hover",
    base: cursorUrl("cursor/internals/cursor-select-hover-base.png"),
    mask: cursorUrl("cursor/internals/cursor-select-hover-tip-mask.png"),
    width: cursorSize(32),
    height: cursorSize(40),
    hotX: cursorSize(16),
    hotY: cursorSize(4),
  },
  text: {
    type: "image",
    name: "text",
    base: cursorUrl("cursor/internals/cursor-text-base.png"),
    mask: cursorUrl("cursor/internals/cursor-text-tip-mask.png"),
    width: cursorSize(20),
    height: cursorSize(38),
    hotX: cursorSize(10),
    hotY: cursorSize(19),
  },
  crosshair: {
    type: "cross",
    name: "cross",
    width: crossCursorSize(30),
    height: crossCursorSize(30),
    hotX: crossCursorSize(15),
    hotY: crossCursorSize(15),
  },
  slider: {
    type: "slider",
    name: "slider",
    width: cursorSize(54),
    height: cursorSize(37),
    hotX: cursorSize(27),
    hotY: cursorSize(18),
  },
  map: {
    type: "image",
    name: "map-pin",
    base: cursorUrl("cursor/internals/cursor-map-pin-base.png"),
    mask: cursorUrl("cursor/internals/cursor-map-pin-tip-mask.png"),
    width: cursorSize(32),
    height: cursorSize(46),
    hotX: cursorSize(16),
    hotY: cursorSize(44),
  },
  grab: {
    type: "image",
    name: "map-drag",
    base: cursorUrl("cursor/internals/cursor-map-drag-base.png"),
    mask: cursorUrl("cursor/internals/cursor-map-drag-tip-mask.png"),
    width: cursorSize(38),
    height: cursorSize(40),
    hotX: cursorSize(19),
    hotY: cursorSize(20),
  },
  grabbing: {
    type: "image",
    name: "map-drag",
    base: cursorUrl("cursor/internals/cursor-map-drag-base.png"),
    mask: cursorUrl("cursor/internals/cursor-map-drag-tip-mask.png"),
    width: cursorSize(38),
    height: cursorSize(40),
    hotX: cursorSize(19),
    hotY: cursorSize(20),
  },
  help: {
    type: "image",
    name: "help",
    base: cursorUrl("cursor/internals/cursor-help-base.png"),
    mask: cursorUrl("cursor/internals/cursor-help-tip-mask.png"),
    width: cursorSize(31),
    height: cursorSize(50),
    hotX: cursorSize(5),
    hotY: cursorSize(5),
  },
  "not-allowed": {
    type: "image",
    name: "disabled",
    base: cursorUrl("cursor/internals/cursor-disabled-base.png"),
    mask: cursorUrl("cursor/internals/cursor-disabled-tip-mask.png"),
    width: cursorSize(36),
    height: cursorSize(47),
    hotX: cursorSize(5),
    hotY: cursorSize(5),
  },
  resize: {
    type: "cross",
    name: "cross",
    width: crossCursorSize(30),
    height: crossCursorSize(30),
    hotX: crossCursorSize(15),
    hotY: crossCursorSize(15),
  },
} satisfies Record<CursorKind, CursorAsset>;

type CursorPosition = {
  x: number;
  y: number;
};

type CursorState = {
  visible: boolean;
  pressed: boolean;
  kind: CursorKind;
  accent: string;
};

const INITIAL_CURSOR_POSITION: CursorPosition = {
  x: -100,
  y: -100,
};

const INITIAL_CURSOR_STATE: CursorState = {
  visible: false,
  pressed: false,
  kind: "default",
  accent: "#7ecbff",
};

const CURSOR_IMAGE_URLS = Array.from(
  new Set(
    Object.values(CURSOR_ASSETS).flatMap((asset) => (asset.type === "image" ? [asset.base, asset.mask] : [])),
  ),
);

function setCustomCursorRuntime(value: "ready" | "fallback" | null) {
  if (value) {
    document.documentElement.setAttribute("data-custom-cursor-runtime", value);
  } else {
    document.documentElement.removeAttribute("data-custom-cursor-runtime");
  }
}

function closestElement(target: EventTarget | null) {
  return target instanceof Element ? target : null;
}

function cursorTargetForPoint(event: PointerEvent) {
  return closestElement(document.elementFromPoint(event.clientX, event.clientY) ?? event.target);
}

function isVisiblePointerEvent(event: PointerEvent) {
  return event.pointerType === "mouse" || event.pointerType === "pen" || event.pointerType === "";
}

function loadCursorImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load cursor image: ${src}`));
    image.src = src;

    if (image.decode) {
      void image.decode().then(() => resolve(image), reject);
    }
  });
}

function preloadCursorImages() {
  return Promise.all(CURSOR_IMAGE_URLS.map(loadCursorImage));
}

function isClickable(el: Element) {
  return Boolean(el.closest("button, a, select, summary, label, [role='button'], [role='switch'], [tabindex]:not([tabindex='-1'])"));
}

function cursorKindForTarget(el: Element | null, pressed: boolean): CursorKind {
  if (!el) return "default";
  if (el.closest("[disabled], [aria-disabled='true'], .hc-join-input--disabled")) return "not-allowed";
  if (el.closest("input[type='range'], [role='slider'], [data-cursor='slider']")) return "slider";
  if (el.closest("input, textarea, [contenteditable='true']")) return "text";
  if (el.closest(".chat-resize-handle, [data-cursor='resize']")) return "resize";
  if (el.closest(".chat-titlebar, [data-cursor='drag']")) return pressed ? "grabbing" : "grab";
  if (el.closest(".hc-help-btn, [data-cursor='help']")) return "help";
  if (el.closest(".shade-grid, .shade-cell, .shikaku-grid, .shikaku-cell, .pips-board, .pips-cell, [data-cursor='select']")) return "crosshair";
  if (!el.closest(".locsig-map-ui") && el.closest(".locsig-map-outer, .locsig-map-box, [data-cursor='map']")) return pressed ? "grabbing" : "map";
  if (isClickable(el)) return "pointer";
  if (el.closest("[data-tooltip]")) return "help";
  return "default";
}

function isGameSlug(value: string | undefined): value is GameSlug {
  return Boolean(value && value in GAME_META);
}

function themeForPathname(pathname: string): GameSlug | "" {
  const slug = getGameSlugFromPath(pathname);
  return slug === "home" ? "" : slug;
}

function themeForHomeCard(el: Element | null): GameSlug | "" {
  if (el?.closest(".home-card--imposter, .m-game-card--imposter")) return "imposter";
  if (el?.closest(".home-card--password, .m-game-card--password")) return "password";
  if (el?.closest(".home-card--chain, .m-game-card--chain")) return "chain";
  if (el?.closest(".home-card--shade, .m-game-card--shade")) return "shade";
  if (el?.closest(".home-card--location, .m-game-card--location")) return "location";
  if (el?.closest(".m-solo-card--pips")) return "pips";
  return "";
}

function accentForTarget(el: Element | null, pathname: string) {
  const themed = el?.closest("[data-game-theme]");
  const theme = themed instanceof HTMLElement ? themed.dataset.gameTheme : "";
  const fallbackTheme = theme || themeForHomeCard(el) || themeForPathname(pathname);
  return isGameSlug(fallbackTheme) ? GAME_META[fallbackTheme].accent : GAME_META.home.accent;
}

export function CustomCursor() {
  const { customCursor, customCursorScale } = useSettings();
  const { pathname } = useLocation();
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const positionRef = useRef<CursorPosition>(INITIAL_CURSOR_POSITION);
  const stateRef = useRef<CursorState>(INITIAL_CURSOR_STATE);
  const [state, setState] = useState<CursorState>(INITIAL_CURSOR_STATE);
  const [runtimeReady, setRuntimeReady] = useState(false);

  useEffect(() => {
    if (!customCursor || !window.matchMedia("(pointer: fine)").matches) {
      const hiddenState = { ...stateRef.current, visible: false, pressed: false };
      stateRef.current = hiddenState;
      setState(hiddenState);
      setRuntimeReady(false);
      setCustomCursorRuntime(customCursor ? "fallback" : null);
      return;
    }

    let cancelled = false;
    setRuntimeReady(false);
    setCustomCursorRuntime("fallback");

    void preloadCursorImages()
      .then(() => {
        if (cancelled) return;
        setCustomCursorRuntime("ready");
        setRuntimeReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        const hiddenState = { ...stateRef.current, visible: false, pressed: false };
        stateRef.current = hiddenState;
        setState(hiddenState);
        setRuntimeReady(false);
        setCustomCursorRuntime("fallback");
      });

    return () => {
      cancelled = true;
      setRuntimeReady(false);
      setCustomCursorRuntime(null);
    };
  }, [customCursor]);

  useEffect(() => {
    if (!customCursor || !runtimeReady) {
      const hiddenState = { ...stateRef.current, visible: false, pressed: false };
      stateRef.current = hiddenState;
      setState(hiddenState);
      return;
    }

    let pressed = false;

    const applyPosition = () => {
      frameRef.current = null;
      const cursor = cursorRef.current;
      if (!cursor) return;

      cursor.style.setProperty("--site-cursor-x", `${positionRef.current.x}px`);
      cursor.style.setProperty("--site-cursor-y", `${positionRef.current.y}px`);
    };

    const queuePosition = (x: number, y: number) => {
      positionRef.current = { x, y };
      if (frameRef.current === null) {
        frameRef.current = window.requestAnimationFrame(applyPosition);
      }
    };

    const setCursorState = (nextState: CursorState) => {
      const current = stateRef.current;
      if (
        current.visible === nextState.visible &&
        current.pressed === nextState.pressed &&
        current.kind === nextState.kind &&
        current.accent === nextState.accent
      ) {
        return;
      }

      stateRef.current = nextState;
      setState(nextState);
    };

    const update = (event: PointerEvent) => {
      if (!isVisiblePointerEvent(event)) return;

      setCustomCursorRuntime("ready");
      queuePosition(event.clientX, event.clientY);
      const el = cursorTargetForPoint(event);
      setCursorState({
        visible: true,
        pressed,
        kind: cursorKindForTarget(el, pressed),
        accent: accentForTarget(el, pathname),
      });
    };

    const hide = (fallbackToNative = false) => {
      pressed = false;
      setCursorState({ ...stateRef.current, visible: false, pressed: false });
      if (fallbackToNative) {
        setCustomCursorRuntime("fallback");
      }
    };
    const hideToNative = () => hide(true);
    const onPointerDown = (event: PointerEvent) => {
      if (!isVisiblePointerEvent(event)) return;
      if (event.button !== 0) {
        hideToNative();
        return;
      }
      pressed = true;
      update(event);
    };
    const onPointerUp = (event: PointerEvent) => {
      pressed = false;
      update(event);
    };
    const onPointerOut = (event: PointerEvent) => {
      const outsideViewport =
        event.clientX <= 0 ||
        event.clientY <= 0 ||
        event.clientX >= window.innerWidth ||
        event.clientY >= window.innerHeight;

      if (!event.relatedTarget || outsideViewport) {
        hideToNative();
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        hideToNative();
      }
    };

    window.addEventListener("pointermove", update, { passive: true });
    window.addEventListener("pointerover", update, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", hideToNative, { passive: true });
    window.addEventListener("pointerout", onPointerOut, { passive: true });
    window.addEventListener("contextmenu", hideToNative, { passive: true });
    window.addEventListener("blur", hideToNative);
    window.addEventListener("mouseleave", hideToNative, { passive: true });
    window.addEventListener("dragstart", hideToNative, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    document.documentElement.addEventListener("pointerleave", hideToNative, { passive: true });
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      window.removeEventListener("pointermove", update);
      window.removeEventListener("pointerover", update);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", hideToNative);
      window.removeEventListener("pointerout", onPointerOut);
      window.removeEventListener("contextmenu", hideToNative);
      window.removeEventListener("blur", hideToNative);
      window.removeEventListener("mouseleave", hideToNative);
      window.removeEventListener("dragstart", hideToNative);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.documentElement.removeEventListener("pointerleave", hideToNative);
    };
  }, [customCursor, pathname, runtimeReady]);

  if (!customCursor || !runtimeReady) {
    return null;
  }

  const asset = CURSOR_ASSETS[state.kind];
  const cursorStyle = {
    "--site-cursor-x": `${positionRef.current.x}px`,
    "--site-cursor-y": `${positionRef.current.y}px`,
    "--site-cursor-accent": state.accent,
    "--tip-color": state.accent,
    "--cursor-w": `${asset.width * customCursorScale}px`,
    "--cursor-h": `${asset.height * customCursorScale}px`,
    "--cursor-hot-x": `${asset.hotX * customCursorScale}px`,
    "--cursor-hot-y": `${asset.hotY * customCursorScale}px`,
    ...(asset.type === "image"
      ? {
          "--cursor-base": `url("${asset.base}")`,
          "--cursor-tip-mask": `url("${asset.mask}")`,
        }
      : {}),
  } as CSSProperties;

  return (
    <div
      ref={cursorRef}
      className={`site-cursor site-cursor--${state.kind} site-cursor--asset-${asset.name}${state.visible ? " site-cursor--visible" : ""}${state.pressed ? " site-cursor--pressed" : ""}`}
      style={cursorStyle}
      aria-hidden="true"
    >
      {asset.type === "image" ? (
        <>
          <span className="site-cursor__asset site-cursor__asset--base" />
          <span className="site-cursor__asset site-cursor__asset--tip" />
        </>
      ) : asset.type === "cross" ? (
        <svg className="site-cursor__cross" viewBox="0 0 104 104" role="img" aria-label="selection cursor">
          <defs>
            <linearGradient id="site-cursor-cross-body" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--cursor-body-start)" />
              <stop offset="100%" stopColor="var(--cursor-body-end)" />
            </linearGradient>
            <filter id="site-cursor-cross-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1.2" stdDeviation="1.1" floodColor="#0f1c2b" floodOpacity="0.18" />
            </filter>
          </defs>
          <g filter="url(#site-cursor-cross-shadow)">
            <path
              d="M46 12 C46 9.2 48.2 7 51 7 H53 C55.8 7 58 9.2 58 12 V46 H92 C94.8 46 97 48.2 97 51 V53 C97 55.8 94.8 58 92 58 H58 V92 C58 94.8 55.8 97 53 97 H51 C48.2 97 46 94.8 46 92 V58 H12 C9.2 58 7 55.8 7 53 V51 C7 48.2 9.2 46 12 46 H46 Z"
              fill="url(#site-cursor-cross-body)"
              stroke="var(--cursor-outline)"
              strokeWidth="5"
              strokeLinejoin="round"
            />
            <rect x="47" y="10" width="10" height="14" rx="2.5" fill="var(--tip-color)" />
            <rect x="47" y="80" width="10" height="14" rx="2.5" fill="var(--tip-color)" />
            <rect x="10" y="47" width="14" height="10" rx="2.5" fill="var(--tip-color)" />
            <rect x="80" y="47" width="14" height="10" rx="2.5" fill="var(--tip-color)" />
          </g>
        </svg>
      ) : (
        <svg className="site-cursor__slider" viewBox="0 0 116 80" role="img" aria-label="slider cursor">
          <defs>
            <linearGradient id="site-cursor-slider-body" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--cursor-body-start)" />
              <stop offset="100%" stopColor="var(--cursor-body-end)" />
            </linearGradient>
            <filter id="site-cursor-slider-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1.2" stdDeviation="1.1" floodColor="#0f1c2b" floodOpacity="0.18" />
            </filter>
          </defs>
          <g filter="url(#site-cursor-slider-shadow)">
            <path
              d="M36 35 H80 C82.8 35 85 37.2 85 40 C85 42.8 82.8 45 80 45 H36 C33.2 45 31 42.8 31 40 C31 37.2 33.2 35 36 35 Z"
              fill="url(#site-cursor-slider-body)"
              stroke="var(--cursor-outline)"
              strokeWidth="5"
              strokeLinejoin="round"
            />
            <path
              d="M14 40 L29 28.5 C31.2 26.8 34.5 28.4 34.5 31.2 V48.8 C34.5 51.6 31.2 53.2 29 51.5 Z"
              fill="var(--tip-color)"
              stroke="var(--cursor-outline)"
              strokeWidth="4"
              strokeLinejoin="round"
            />
            <path
              d="M102 40 L87 28.5 C84.8 26.8 81.5 28.4 81.5 31.2 V48.8 C81.5 51.6 84.8 53.2 87 51.5 Z"
              fill="var(--tip-color)"
              stroke="var(--cursor-outline)"
              strokeWidth="4"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      )}
    </div>
  );
}
