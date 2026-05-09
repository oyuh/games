import { FiEye } from "react-icons/fi";
import { FaCrown } from "react-icons/fa";

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

export function HostBadge() {
  return (
    <span className="host-crown-indicator" data-tooltip="You are the host" data-tooltip-variant="info">
      <FaCrown size={15} />
    </span>
  );
}

export function MobileHostBadge() {
  return (
    <span className="host-crown-indicator" data-tooltip="You are the host" data-tooltip-variant="info">
      <FaCrown size={13} />
    </span>
  );
}
