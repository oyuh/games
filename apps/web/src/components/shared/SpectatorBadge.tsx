import { FiEye } from "react-icons/fi";

export function SpectatorBadge() {
  return (
    <span className="spectator-indicator" data-tooltip="You're spectating this game" data-tooltip-variant="info">
      <FiEye size={14} />
    </span>
  );
}

export function MobileSpectatorBadge() {
  return (
    <span className="spectator-indicator" data-tooltip="You're spectating this game" data-tooltip-variant="info">
      <FiEye size={12} />
    </span>
  );
}
