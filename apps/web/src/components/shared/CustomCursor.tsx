import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useLocation } from "react-router-dom";
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

const THEME_COLORS: Record<string, string> = {
  imposter: "#7eb8ff",
  password: "#a78bfa",
  chain: "#34d399",
  shade: "#f472b6",
  location: "#f59e0b",
  shikaku: "#34d399",
};

const cursorUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;
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

function closestElement(target: EventTarget | null) {
  return target instanceof Element ? target : null;
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
  if (el.closest(".shade-grid, .shade-cell, .shikaku-grid, .shikaku-cell, [data-cursor='select']")) return "crosshair";
  if (!el.closest(".locsig-map-ui") && el.closest(".locsig-map-outer, .locsig-map-box, [data-cursor='map']")) return pressed ? "grabbing" : "map";
  if (isClickable(el)) return "pointer";
  if (el.closest("[data-tooltip]")) return "help";
  return "default";
}

function themeForPathname(pathname: string) {
  if (pathname.startsWith("/imposter/")) return "imposter";
  if (pathname.startsWith("/password/")) return "password";
  if (pathname.startsWith("/chain/")) return "chain";
  if (pathname.startsWith("/shade/")) return "shade";
  if (pathname.startsWith("/location/")) return "location";
  if (/^\/shikaku(\/|$)/.test(pathname)) return "shikaku";
  return "";
}

function themeForHomeCard(el: Element | null) {
  if (el?.closest(".home-card--imposter, .m-game-card--imposter")) return "imposter";
  if (el?.closest(".home-card--password, .m-game-card--password")) return "password";
  if (el?.closest(".home-card--chain, .m-game-card--chain")) return "chain";
  if (el?.closest(".home-card--shade, .m-game-card--shade")) return "shade";
  if (el?.closest(".home-card--location, .m-game-card--location")) return "location";
  return "";
}

function accentForTarget(el: Element | null, pathname: string) {
  const themed = el?.closest("[data-game-theme]");
  const theme = themed instanceof HTMLElement ? themed.dataset.gameTheme : "";
  const fallbackTheme = theme || themeForHomeCard(el) || themeForPathname(pathname);
  return fallbackTheme ? THEME_COLORS[fallbackTheme] ?? "#7ecbff" : "#7ecbff";
}

export function CustomCursor() {
  const { customCursor, customCursorScale } = useSettings();
  const location = useLocation();
  const [state, setState] = useState({
    x: -100,
    y: -100,
    visible: false,
    pressed: false,
    kind: "default" as CursorKind,
    accent: "#7ecbff",
  });

  useEffect(() => {
    if (!customCursor || !window.matchMedia("(pointer: fine)").matches) {
      setState((current) => ({ ...current, visible: false }));
      return;
    }

    let pressed = false;

    const update = (event: PointerEvent) => {
      const el = closestElement(event.target);
      setState({
        x: event.clientX,
        y: event.clientY,
        visible: true,
        pressed,
        kind: cursorKindForTarget(el, pressed),
        accent: accentForTarget(el, location.pathname),
      });
    };

    const onPointerDown = (event: PointerEvent) => {
      pressed = true;
      update(event);
    };
    const onPointerUp = (event: PointerEvent) => {
      pressed = false;
      update(event);
    };
    const onPointerLeave = () => setState((current) => ({ ...current, visible: false, pressed: false }));

    window.addEventListener("pointermove", update, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerLeave, { passive: true });
    return () => {
      window.removeEventListener("pointermove", update);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [customCursor, location.pathname]);

  if (!customCursor) {
    return null;
  }

  const asset = CURSOR_ASSETS[state.kind];
  const cursorStyle = {
    "--site-cursor-x": `${state.x}px`,
    "--site-cursor-y": `${state.y}px`,
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
      className={`site-cursor site-cursor--${state.kind} site-cursor--asset-${asset.name}${state.visible ? " site-cursor--visible" : ""}${state.pressed ? " site-cursor--pressed" : ""}`}
      style={cursorStyle}
      aria-hidden="true"
    >
      {asset.type === "image" ? (
        <>
          <span key={`${asset.name}-base`} className="site-cursor__asset site-cursor__asset--base" />
          <span key={`${asset.name}-tip`} className="site-cursor__asset site-cursor__asset--tip" />
        </>
      ) : asset.type === "cross" ? (
        <svg key={asset.name} className="site-cursor__cross" viewBox="0 0 104 104" role="img" aria-label="selection cursor">
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
        <svg key={asset.name} className="site-cursor__slider" viewBox="0 0 116 80" role="img" aria-label="slider cursor">
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
