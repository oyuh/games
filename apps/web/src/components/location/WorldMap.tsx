import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiMaximize2, FiMinus, FiPlus, FiX } from "react-icons/fi";
import { RoundCountdown } from "../shared/RoundCountdown";

export interface MapMarker {
  lat: number;
  lng: number;
  color: string;
  label?: string;
  size?: number;
  pulse?: boolean;
  ring?: boolean;
  /** When true, hide the label unless the marker is hovered */
  hideLabel?: boolean;
}

interface WorldMapProps {
  height?: number;
  onClick?: (coords: { lat: number; lng: number }) => void;
  markers?: MapMarker[];
  interactive?: boolean;
  className?: string;
  /** Show lat/lng of the last click in a bottom-left overlay */
  coordsOverlay?: { lat: number; lng: number } | null;
  /** Override default center [lat, lng]. Defaults to [25, 10]. */
  defaultCenter?: [number, number];
  /** Override default zoom level. Defaults to 2. */
  defaultZoom?: number;
  /** Controlled center for programmatic recentering. */
  center?: [number, number];
  /** Controlled zoom for programmatic recentering. */
  zoom?: number;
  /** Called when the user pans/zooms (use with center/zoom for controlled mode) */
  onBoundsChanged?: (params: { center: [number, number]; zoom: number }) => void;
  /** Show the enlarge-map control. Defaults to true. */
  expandable?: boolean;
  /** Timer shown on the expanded map. */
  timerEndsAt?: number | null;
  timerLabel?: string;
  /** Changing this value closes the expanded map. */
  closeKey?: string | number | null;
  /** Controls shown at the bottom of the expanded map. */
  expandedActions?: React.ReactNode;
}

type WorldPoint = { x: number; y: number };
type ViewportSize = { width: number; height: number };

const TILE_SIZE = 256;
const MIN_ZOOM = 2;
const MAX_ZOOM = 18;
const MERCATOR_LAT_LIMIT = 85.05112878;
const CLICK_TOLERANCE_PX = 6;
const MARKER_REPEAT_PADDING = 96;
const EMPTY_MARKERS: MapMarker[] = [];

// Google Hybrid tiles: satellite imagery with labels/roads/place names.
// Tile indices are wrapped in both axes so the whole map repeats forever.
const hybridProvider = (x: number, y: number, z: number) => {
  const tileCount = 2 ** z;
  const wrappedX = wrapIndex(x, tileCount);
  const wrappedY = wrapIndex(y, tileCount);
  return `https://mt${(wrappedX + wrappedY) % 4}.google.com/vt/lyrs=y&x=${wrappedX}&y=${wrappedY}&z=${z}&hl=en&gl=US`;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampZoom(zoom: number): number {
  return clamp(Math.round(zoom), MIN_ZOOM, MAX_ZOOM);
}

function wrap(value: number, size: number): number {
  return ((value % size) + size) % size;
}

function wrapIndex(value: number, size: number): number {
  return ((value % size) + size) % size;
}

function normalizeLng(lng: number): number {
  return wrap(lng + 180, 360) - 180;
}

function clampLat(lat: number): number {
  return clamp(lat, -MERCATOR_LAT_LIMIT, MERCATOR_LAT_LIMIT);
}

function worldSize(zoom: number): number {
  return TILE_SIZE * 2 ** zoom;
}

function lngToUnitX(lng: number): number {
  return wrap(normalizeLng(lng) + 180, 360) / 360;
}

function latToUnitY(lat: number): number {
  const clamped = clampLat(lat);
  const rad = (clamped * Math.PI) / 180;
  return clamp((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2, 0, 1);
}

function unitXToLng(x: number): number {
  return normalizeLng(wrap(x, 1) * 360 - 180);
}

function unitYToLat(y: number): number {
  const n = Math.PI - 2 * Math.PI * wrap(y, 1);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

function latLngToWorldPoint(lat: number, lng: number, zoom: number): WorldPoint {
  const size = worldSize(zoom);
  return {
    x: lngToUnitX(lng) * size,
    y: latToUnitY(lat) * size,
  };
}

function worldPointToLatLng(point: WorldPoint, zoom: number): [number, number] {
  const size = worldSize(zoom);
  return [unitYToLat(point.y / size), unitXToLng(point.x / size)];
}

function nearestWrappedCopy(base: number, near: number, size: number): number {
  return base + Math.round((near - base) / size) * size;
}

function latLngToWorldPointNear(lat: number, lng: number, zoom: number, near: WorldPoint): WorldPoint {
  const size = worldSize(zoom);
  const base = latLngToWorldPoint(lat, lng, zoom);
  return {
    x: nearestWrappedCopy(base.x, near.x, size),
    y: nearestWrappedCopy(base.y, near.y, size),
  };
}

function isSameView(a: { center: [number, number]; zoom: number } | null, center: [number, number], zoom: number): boolean {
  if (!a) return false;
  return (
    Math.abs(a.zoom - zoom) < 0.001 &&
    Math.abs(a.center[0] - center[0]) < 0.0001 &&
    Math.abs(a.center[1] - center[1]) < 0.0001
  );
}

function getCircularInterval(values: number[]): { center: number; span: number } {
  if (values.length === 0) return { center: 0.5, span: 1 };
  if (values.length === 1) return { center: wrap(values[0]!, 1), span: 0 };

  const sorted = values.map((value) => wrap(value, 1)).sort((a, b) => a - b);
  let largestGap = -1;
  let gapIndex = 0;

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i]!;
    const next = i === sorted.length - 1 ? sorted[0]! + 1 : sorted[i + 1]!;
    const gap = next - current;
    if (gap > largestGap) {
      largestGap = gap;
      gapIndex = i;
    }
  }

  const start = sorted[(gapIndex + 1) % sorted.length]!;
  const span = clamp(1 - largestGap, 0, 1);
  return { center: wrap(start + span / 2, 1), span };
}

/** Fits points on the repeating map, including points split across any repeated edge. */
export function fitRepeatingMapBounds(
  points: { lat: number; lng: number }[],
  mapWidth: number,
  mapHeight: number,
  padding = 0.25,
): { center: [number, number]; zoom: number } {
  if (points.length === 0) return { center: [25, 10], zoom: 2 };

  const first = points[0]!;
  if (points.length === 1) {
    return { center: [clampLat(first.lat), normalizeLng(first.lng)], zoom: 5 };
  }

  const xInterval = getCircularInterval(points.map((point) => lngToUnitX(point.lng)));
  const yInterval = getCircularInterval(points.map((point) => latToUnitY(point.lat)));
  const paddedX = Math.max(xInterval.span * (1 + padding * 2), 0.01);
  const paddedY = Math.max(yInterval.span * (1 + padding * 2), 0.01);
  const safeWidth = Math.max(mapWidth, TILE_SIZE);
  const safeHeight = Math.max(mapHeight, TILE_SIZE);
  const lngZoom = Math.log2(safeWidth / (TILE_SIZE * paddedX));
  const latZoom = Math.log2(safeHeight / (TILE_SIZE * paddedY));

  return {
    center: [unitYToLat(yInterval.center), unitXToLng(xInterval.center)],
    zoom: clampZoom(Math.floor(Math.min(latZoom, lngZoom))),
  };
}

interface MapSurfaceProps {
  height: number;
  className?: string | undefined;
  centerPx: WorldPoint;
  zoom: number;
  markers: MapMarker[];
  hovered: number | null;
  interactive: boolean;
  expandable: boolean;
  showExpand: boolean;
  coordsOverlay?: { lat: number; lng: number } | null | undefined;
  onHoverMarker: (index: number | null) => void;
  onCenterChange: (centerPx: WorldPoint) => void;
  onZoomAround: (zoom: number, anchor: WorldPoint, viewport: ViewportSize) => void;
  onMapClick?: ((coords: { lat: number; lng: number }) => void) | undefined;
  onExpand: () => void;
  actionOverlay?: React.ReactNode;
}

function MapSurface({
  height,
  className,
  centerPx,
  zoom,
  markers,
  hovered,
  interactive,
  expandable,
  showExpand,
  coordsOverlay,
  onHoverMarker,
  onCenterChange,
  onZoomAround,
  onMapClick,
  onExpand,
  actionOverlay,
}: MapSurfaceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState<ViewportSize>({ width: 0, height });
  const dragRef = useRef<{ pointerId: number; start: WorldPoint; startCenter: WorldPoint; moved: boolean } | null>(null);
  const wheelDeltaRef = useRef(0);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setViewport({ width: rect.width, height: rect.height || height });
    };

    updateSize();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(updateSize);
      observer.observe(element);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, [height]);

  const topLeft = useMemo(
    () => ({
      x: centerPx.x - viewport.width / 2,
      y: centerPx.y - viewport.height / 2,
    }),
    [centerPx.x, centerPx.y, viewport.height, viewport.width],
  );

  const tiles = useMemo(() => {
    if (viewport.width <= 0 || viewport.height <= 0) return [];

    const tileMinX = Math.floor(topLeft.x / TILE_SIZE) - 1;
    const tileMaxX = Math.floor((topLeft.x + viewport.width) / TILE_SIZE) + 1;
    const tileMinY = Math.floor(topLeft.y / TILE_SIZE) - 1;
    const tileMaxY = Math.floor((topLeft.y + viewport.height) / TILE_SIZE) + 1;
    const list: Array<{ key: string; url: string; left: number; top: number }> = [];

    for (let x = tileMinX; x <= tileMaxX; x++) {
      for (let y = tileMinY; y <= tileMaxY; y++) {
        list.push({
          key: `${zoom}:${x}:${y}`,
          url: hybridProvider(x, y, zoom),
          left: x * TILE_SIZE - topLeft.x,
          top: y * TILE_SIZE - topLeft.y,
        });
      }
    }

    return list;
  }, [topLeft.x, topLeft.y, viewport.height, viewport.width, zoom]);

  const markerCopies = useMemo(() => {
    if (viewport.width <= 0 || viewport.height <= 0) return [];

    const size = worldSize(zoom);
    return markers.flatMap((marker, index) => {
      const base = latLngToWorldPoint(marker.lat, marker.lng, zoom);
      const baseLeft = base.x - topLeft.x;
      const baseTop = base.y - topLeft.y;
      const minCopyX = Math.floor((-MARKER_REPEAT_PADDING - baseLeft) / size);
      const maxCopyX = Math.ceil((viewport.width + MARKER_REPEAT_PADDING - baseLeft) / size);
      const minCopyY = Math.floor((-MARKER_REPEAT_PADDING - baseTop) / size);
      const maxCopyY = Math.ceil((viewport.height + MARKER_REPEAT_PADDING - baseTop) / size);
      const copies: Array<{ key: string; marker: MapMarker; markerIndex: number; left: number; top: number }> = [];

      for (let copyX = minCopyX; copyX <= maxCopyX; copyX++) {
        for (let copyY = minCopyY; copyY <= maxCopyY; copyY++) {
          copies.push({
            key: `${index}:${copyX}:${copyY}`,
            marker,
            markerIndex: index,
            left: baseLeft + copyX * size,
            top: baseTop + copyY * size,
          });
        }
      }

      return copies;
    });
  }, [markers, topLeft.x, topLeft.y, viewport.height, viewport.width, zoom]);

  const coordsFromScreenPoint = useCallback(
    (point: WorldPoint) => {
      const [lat, lng] = worldPointToLatLng({ x: topLeft.x + point.x, y: topLeft.y + point.y }, zoom);
      return { lat, lng };
    },
    [topLeft.x, topLeft.y, zoom],
  );

  const localPointFromEvent = useCallback((event: { clientX: number; clientY: number }): WorldPoint => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!interactive) return;
      if (event.button !== 0 && event.pointerType === "mouse") return;
      if ((event.target as Element | null)?.closest(".locsig-map-ui")) return;

      event.preventDefault();
      const point = localPointFromEvent(event);
      dragRef.current = {
        pointerId: event.pointerId,
        start: point,
        startCenter: centerPx,
        moved: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [centerPx, interactive, localPointFromEvent],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!interactive || !drag || drag.pointerId !== event.pointerId) return;

      const point = localPointFromEvent(event);
      const dx = point.x - drag.start.x;
      const dy = point.y - drag.start.y;
      if (Math.abs(dx) + Math.abs(dy) > CLICK_TOLERANCE_PX) drag.moved = true;
      onCenterChange({ x: drag.startCenter.x - dx, y: drag.startCenter.y - dy });
      event.preventDefault();
    },
    [interactive, localPointFromEvent, onCenterChange],
  );

  const handlePointerEnd = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      dragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      const point = localPointFromEvent(event);
      const dx = point.x - drag.start.x;
      const dy = point.y - drag.start.y;
      const moved = drag.moved || Math.abs(dx) + Math.abs(dy) > CLICK_TOLERANCE_PX;

      if (!moved && onMapClick) {
        onMapClick(coordsFromScreenPoint(point));
      }
    },
    [coordsFromScreenPoint, localPointFromEvent, onMapClick],
  );

  const zoomAround = useCallback(
    (nextZoom: number, anchor: WorldPoint) => {
      if (!interactive) return;
      onZoomAround(clampZoom(nextZoom), anchor, viewport);
    },
    [interactive, onZoomAround, viewport],
  );

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (!interactive) return;
      event.preventDefault();

      wheelDeltaRef.current += event.deltaY;
      if (Math.abs(wheelDeltaRef.current) < 80) return;

      const direction = wheelDeltaRef.current < 0 ? 1 : -1;
      wheelDeltaRef.current = 0;
      zoomAround(zoom + direction, localPointFromEvent(event));
    },
    [interactive, localPointFromEvent, zoom, zoomAround],
  );

  const zoomButtonAnchor = { x: viewport.width / 2, y: viewport.height / 2 };

  return (
    <div
      ref={containerRef}
      className={`locsig-map-outer${className ? ` ${className}` : ""}${interactive ? " locsig-map-outer--interactive" : ""}`}
      data-cursor={interactive ? "map" : "default"}
      role={onMapClick ? "button" : "img"}
      aria-label="Repeating world map"
      style={{ position: "relative", height, overflow: "hidden", background: "#0b1a2e" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onWheel={handleWheel}
      onDragStart={(event) => event.preventDefault()}
      onDoubleClick={(event) => {
        if (!interactive) return;
        event.preventDefault();
        zoomAround(zoom + 1, localPointFromEvent(event));
      }}
    >
      <div className="locsig-map-viewport">
        <div className="locsig-map-tiles">
          {tiles.map((tile) => (
            <img
              key={tile.key}
              className="locsig-map-tile"
              src={tile.url}
              width={TILE_SIZE}
              height={TILE_SIZE}
              loading="lazy"
              alt=""
              draggable={false}
              style={{
                position: "absolute",
                transform: `translate3d(${tile.left}px, ${tile.top}px, 0)`,
                width: TILE_SIZE,
                height: TILE_SIZE,
              }}
            />
          ))}
        </div>

        <div className="locsig-map-marker-layer">
          {markerCopies.map(({ key, marker, markerIndex, left, top }) => {
            const dotPx = (marker.size ?? 3) * 6;
            const isHovered = hovered === markerIndex;

            return (
              <div
                key={key}
                className="locsig-map-marker"
                style={{ transform: `translate3d(${left}px, ${top}px, 0)` }}
              >
                <div style={{ position: "relative", width: 0, height: 0 }}>
                  <div
                    className={`locsig-marker-dot${marker.pulse ? " locsig-marker-dot--pulse" : ""}`}
                    style={{
                      position: "absolute",
                      left: -dotPx / 2,
                      top: -dotPx / 2,
                      width: dotPx,
                      height: dotPx,
                      backgroundColor: marker.color,
                      border: marker.ring ? "2px solid rgba(255,255,255,0.7)" : "1px solid rgba(255,255,255,0.3)",
                      boxShadow: `0 0 ${isHovered ? 14 : 8}px ${marker.color}${isHovered ? "bb" : "66"}`,
                      transform: isHovered ? "scale(1.3)" : "scale(1)",
                      transition: "transform 0.15s, box-shadow 0.15s",
                      pointerEvents: "auto",
                      cursor: "default",
                      zIndex: 2,
                    }}
                    onMouseEnter={() => onHoverMarker(markerIndex)}
                    onMouseLeave={() => onHoverMarker(null)}
                  />

                  {marker.label && (!marker.hideLabel || isHovered) && (
                    <span
                      className="locsig-marker-label"
                      style={{
                        position: "absolute",
                        bottom: dotPx / 2 + 4,
                        left: "50%",
                        transform: "translateX(-50%)",
                        color: "#fff",
                        background: `${marker.color}cc`,
                        padding: "1px 6px",
                        borderRadius: "4px",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                        textShadow: "0 1px 2px rgba(0,0,0,0.9)",
                        pointerEvents: "none",
                        zIndex: 3,
                      }}
                    >
                      {marker.label}
                    </span>
                  )}

                  {isHovered && marker.label && (
                    <div
                      className="locsig-marker-tooltip"
                      style={{
                        position: "absolute",
                        top: dotPx / 2 + 6,
                        left: "50%",
                        transform: "translateX(-50%)",
                        zIndex: 10,
                      }}
                    >
                      <span>{marker.label}</span>
                      <span className="locsig-marker-tooltip-coords">
                        {marker.lat.toFixed(2)}, {marker.lng.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {interactive && (
        <div className="locsig-zoom-controls locsig-map-ui" data-cursor="default">
          <button
            type="button"
            className="locsig-zoom-btn"
            onClick={(event) => {
              event.stopPropagation();
              zoomAround(zoom + 1, zoomButtonAnchor);
            }}
            disabled={zoom >= MAX_ZOOM}
            aria-label="Zoom in"
            data-tooltip="Zoom in"
            data-tooltip-variant="info"
          >
            <FiPlus size={15} />
          </button>
          <button
            type="button"
            className="locsig-zoom-btn"
            onClick={(event) => {
              event.stopPropagation();
              zoomAround(zoom - 1, zoomButtonAnchor);
            }}
            disabled={zoom <= MIN_ZOOM}
            aria-label="Zoom out"
            data-tooltip="Zoom out"
            data-tooltip-variant="info"
          >
            <FiMinus size={15} />
          </button>
        </div>
      )}

      {showExpand && expandable && (
        <button
          type="button"
          className="locsig-map-expand-btn locsig-map-ui"
          onClick={(event) => {
            event.stopPropagation();
            onExpand();
          }}
          aria-label="Enlarge map"
          data-tooltip="Enlarge map"
          data-tooltip-variant="info"
          data-cursor="default"
        >
          <FiMaximize2 size={15} />
        </button>
      )}

      <div className="locsig-map-bottom-left" data-cursor="default">
        {coordsOverlay && (
          <div className="locsig-coords-overlay">
            {coordsOverlay.lat.toFixed(4)}, {coordsOverlay.lng.toFixed(4)}
          </div>
        )}
        <div className="locsig-map-credit">
          Map imagery &copy; Google
        </div>
      </div>

      {actionOverlay && (
        <div className="locsig-map-expanded-actions locsig-map-ui" data-cursor="default">
          {actionOverlay}
        </div>
      )}
    </div>
  );
}

export function WorldMap({
  height = 360,
  onClick,
  markers = EMPTY_MARKERS,
  interactive = true,
  className,
  coordsOverlay,
  defaultCenter = [25, 10],
  defaultZoom = 2,
  center: controlledCenter,
  zoom: controlledZoom,
  onBoundsChanged,
  expandable = true,
  timerEndsAt,
  timerLabel = "Time",
  closeKey,
  expandedActions,
}: WorldMapProps) {
  const initialZoom = clampZoom(controlledZoom ?? defaultZoom);
  const initialCenter = controlledCenter ?? defaultCenter;
  const [hovered, setHovered] = useState<number | null>(null);
  const [mapZoom, setMapZoom] = useState(initialZoom);
  const [centerPx, setCenterPx] = useState<WorldPoint>(() => latLngToWorldPoint(initialCenter[0], initialCenter[1], initialZoom));
  const [expanded, setExpanded] = useState(false);
  const [expandedHeight, setExpandedHeight] = useState(640);
  const lastEmittedViewRef = useRef<{ center: [number, number]; zoom: number } | null>(null);

  const updateView = useCallback(
    (nextCenterPx: WorldPoint, nextZoom: number, emit = true) => {
      const normalizedZoom = clampZoom(nextZoom);
      const center = worldPointToLatLng(nextCenterPx, normalizedZoom);

      setCenterPx(nextCenterPx);
      setMapZoom(normalizedZoom);

      if (emit) {
        lastEmittedViewRef.current = { center, zoom: normalizedZoom };
        onBoundsChanged?.({ center, zoom: normalizedZoom });
      }
    },
    [onBoundsChanged],
  );

  const ccLat = controlledCenter?.[0];
  const ccLng = controlledCenter?.[1];
  useEffect(() => {
    if (ccLat === undefined || ccLng === undefined) return;

    const nextZoom = clampZoom(controlledZoom ?? mapZoom);
    const nextCenter: [number, number] = [clampLat(ccLat), normalizeLng(ccLng)];
    if (isSameView(lastEmittedViewRef.current, nextCenter, nextZoom)) return;

    updateView(latLngToWorldPoint(nextCenter[0], nextCenter[1], nextZoom), nextZoom, false);
  }, [ccLat, ccLng, controlledZoom, mapZoom, updateView]);

  useEffect(() => {
    if (controlledZoom === undefined || controlledCenter !== undefined) return;

    const nextZoom = clampZoom(controlledZoom);
    if (nextZoom === mapZoom) return;
    const center = worldPointToLatLng(centerPx, mapZoom);
    updateView(latLngToWorldPoint(center[0], center[1], nextZoom), nextZoom, false);
  }, [centerPx, controlledCenter, controlledZoom, mapZoom, updateView]);

  const zoomAround = useCallback(
    (nextZoom: number, anchor: WorldPoint, viewport: ViewportSize) => {
      const normalizedZoom = clampZoom(nextZoom);
      if (normalizedZoom === mapZoom || viewport.width <= 0 || viewport.height <= 0) return;

      const oldTopLeft = {
        x: centerPx.x - viewport.width / 2,
        y: centerPx.y - viewport.height / 2,
      };
      const oldAnchor = {
        x: oldTopLeft.x + anchor.x,
        y: oldTopLeft.y + anchor.y,
      };
      const [anchorLat, anchorLng] = worldPointToLatLng(oldAnchor, mapZoom);
      const scale = worldSize(normalizedZoom) / worldSize(mapZoom);
      const newAnchor = latLngToWorldPointNear(anchorLat, anchorLng, normalizedZoom, {
        x: oldAnchor.x * scale,
        y: oldAnchor.y * scale,
      });
      const nextCenter = {
        x: newAnchor.x - (anchor.x - viewport.width / 2),
        y: newAnchor.y - (anchor.y - viewport.height / 2),
      };

      updateView(nextCenter, normalizedZoom);
    },
    [centerPx.x, centerPx.y, mapZoom, updateView],
  );

  useEffect(() => {
    setExpanded(false);
  }, [closeKey]);

  useEffect(() => {
    if (!expanded) return;

    const updateSize = () => {
      const maxHeight = Math.max(360, window.innerHeight - 72);
      setExpandedHeight(Math.min(maxHeight, Math.max(420, Math.round(window.innerHeight * 0.85))));
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    const onChromePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".sidebar, .sidebar-mobile-toggle, .app-footer")) {
        setExpanded(false);
      }
    };
    const previousOverflow = document.body.style.overflow;

    document.body.classList.add("locsig-map-expanded");
    document.body.style.overflow = "hidden";
    updateSize();
    window.addEventListener("resize", updateSize);
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onChromePointerDown, true);
    return () => {
      document.body.classList.remove("locsig-map-expanded");
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("resize", updateSize);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onChromePointerDown, true);
    };
  }, [expanded]);

  const renderMap = (mapHeight: number, showExpand: boolean) => (
    <MapSurface
      height={mapHeight}
      className={className}
      centerPx={centerPx}
      zoom={mapZoom}
      markers={markers}
      hovered={hovered}
      interactive={interactive}
      expandable={expandable}
      showExpand={showExpand}
      coordsOverlay={coordsOverlay}
      onHoverMarker={setHovered}
      onCenterChange={(nextCenterPx) => updateView(nextCenterPx, mapZoom)}
      onZoomAround={zoomAround}
      onMapClick={interactive ? onClick : undefined}
      onExpand={() => setExpanded(true)}
      actionOverlay={showExpand ? undefined : expandedActions}
    />
  );

  const expandedMap = expanded
    ? createPortal(
      <div
        className="locsig-map-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Expanded map"
        onClick={(event) => {
          if (event.target === event.currentTarget) setExpanded(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setExpanded(false);
        }}
        tabIndex={-1}
      >
        <div className="locsig-map-modal-panel">
          {timerEndsAt != null && (
            <div className="locsig-map-modal-timer" data-cursor="default">
              <RoundCountdown endsAt={timerEndsAt} label={timerLabel} />
            </div>
          )}
          <button
            type="button"
            className="locsig-map-close-btn locsig-map-ui"
            onClick={() => setExpanded(false)}
            aria-label="Close expanded map"
            data-tooltip="Close"
            data-tooltip-variant="info"
            data-cursor="default"
          >
            <FiX size={17} />
          </button>
          {renderMap(expandedHeight, false)}
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <>
      {renderMap(height, true)}
      {expandedMap}
    </>
  );
}
