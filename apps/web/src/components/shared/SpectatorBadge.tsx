import { FiEye } from "react-icons/fi";

export function SpectatorBadge() {
  return (
    <span className="badge badge-muted" data-tooltip="You are watching this game as a spectator" data-tooltip-variant="info">
      <FiEye size={12} /> Spectating
    </span>
  );
}

export function MobileSpectatorBadge() {
  return (
    <span className="m-badge m-badge--muted">
      <FiEye size={10} /> Spectating
    </span>
  );
}
