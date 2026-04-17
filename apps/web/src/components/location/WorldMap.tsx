import { Map, Overlay, ZoomControl } from "pigeon-maps";
import { useCallback, useEffect, useState } from "react";

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
  /** Controlled center — overrides defaultCenter and enables controlled mode */
  center?: [number, number];
  /** Controlled zoom — overrides defaultZoom and enables controlled mode */
  zoom?: number;
  /** Called when the user pans/zooms (use with center/zoom for controlled mode) */
  onBoundsChanged?: (params: { center: [number, number]; zoom: number }) => void;
}

// Google Hybrid tiles — satellite imagery with labels/roads/place names.
// Force label language/region so names stay in English across zoom levels.
// Wrap x so the map repeats horizontally instead of showing white edges
const hybridProvider = (x: number, y: number, z: number) => {
  const maxTile = 1 << z;
  const wrappedX = ((x % maxTile) + maxTile) % maxTile;
  return `https://mt${(wrappedX + y) % 4}.google.com/vt/lyrs=y&x=${wrappedX}&y=${y}&z=${z}&hl=en&gl=US`;
};

export function WorldMap({
  height = 360,
  onClick,
  markers = [],
  interactive = true,
  className,
  coordsOverlay,
  defaultCenter = [25, 10],
  defaultZoom = 2,
  center: controlledCenter,
  zoom: controlledZoom,
  onBoundsChanged,
}: WorldMapProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(controlledCenter ?? defaultCenter);
  const [mapZoom, setMapZoom] = useState(controlledZoom ?? defaultZoom);

  // Sync controlled center into internal state
  const ccLat = controlledCenter?.[0];
  const ccLng = controlledCenter?.[1];
  useEffect(() => {
    if (ccLat !== undefined && ccLng !== undefined) setMapCenter([ccLat, ccLng]);
  }, [ccLat, ccLng]);

  // Sync controlled zoom into internal state
  useEffect(() => {
    if (controlledZoom !== undefined) setMapZoom(controlledZoom);
  }, [controlledZoom]);

  const handleBoundsChanged = useCallback(
    ({ center: c, zoom: z }: { center: [number, number]; zoom: number }) => {
      setMapCenter(c);
      setMapZoom(z);
      onBoundsChanged?.({ center: c, zoom: z });
    },
    [onBoundsChanged],
  );

  return (
    <div className={`locsig-map-outer${className ? ` ${className}` : ""}`} style={{ position: "relative", height, overflow: "hidden", background: "#0b1a2e" }}>
      <Map
        center={mapCenter}
        zoom={mapZoom}
        minZoom={2}
        maxZoom={18}
        height={height}
        limitBounds="edge"
        onClick={
          interactive && onClick
            ? ({ latLng }) => onClick({ lat: latLng[0], lng: latLng[1] })
            : () => {}
        }
        provider={hybridProvider}
        dprs={[1, 2]}
        mouseEvents={interactive}
        touchEvents={interactive}
        animate
        attribution={false}
        boxClassname="locsig-map-box"
        onBoundsChanged={handleBoundsChanged}
      >
        {interactive && <ZoomControl />}

        {markers.map((m, i) => {
          const dotPx = (m.size ?? 3) * 6;
          const isHovered = hovered === i;

          return (
            <Overlay
              key={i}
              anchor={[m.lat, m.lng]}
              offset={[0, 0]}
            >
              {/* Zero-size anchor at the exact lat/lng; everything positioned absolutely from here */}
              <div style={{ position: "relative", width: 0, height: 0 }}>
                {/* Dot — centered on anchor */}
                <div
                  className={`locsig-marker-dot${m.pulse ? " locsig-marker-dot--pulse" : ""}`}
                  style={{
                    position: "absolute",
                    left: -dotPx / 2,
                    top: -dotPx / 2,
                    width: dotPx,
                    height: dotPx,
                    backgroundColor: m.color,
                    border: m.ring ? "2px solid rgba(255,255,255,0.7)" : "1px solid rgba(255,255,255,0.3)",
                    boxShadow: `0 0 ${isHovered ? 14 : 8}px ${m.color}${isHovered ? "bb" : "66"}`,
                    transform: isHovered ? "scale(1.3)" : "scale(1)",
                    transition: "transform 0.15s, box-shadow 0.15s",
                    pointerEvents: "auto",
                    cursor: "default",
                    zIndex: 2,
                  }}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                />

                {/* Label — above the dot (hidden until hover when hideLabel is set) */}
                {m.label && (!m.hideLabel || isHovered) && (
                  <span
                    className="locsig-marker-label"
                    style={{
                      position: "absolute",
                      bottom: dotPx / 2 + 4,
                      left: "50%",
                      transform: "translateX(-50%)",
                      color: "#fff",
                      background: `${m.color}cc`,
                      padding: "1px 6px",
                      borderRadius: "4px",
                      fontSize: "0.62rem",
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                      textShadow: "0 1px 2px rgba(0,0,0,0.9)",
                      pointerEvents: "none",
                      zIndex: 3,
                    }}
                  >
                    {m.label}
                  </span>
                )}

                {/* Tooltip — below the dot on hover */}
                {isHovered && m.label && (
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
                    <span>{m.label}</span>
                    <span className="locsig-marker-tooltip-coords">
                      {m.lat.toFixed(2)}, {m.lng.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </Overlay>
          );
        })}
      </Map>

      {/* Coordinates overlay — bottom-left inside the map */}
      {coordsOverlay && (
        <div className="locsig-coords-overlay">
          📍 {coordsOverlay.lat.toFixed(4)}, {coordsOverlay.lng.toFixed(4)}
        </div>
      )}
    </div>
  );
}
