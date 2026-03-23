import { FiEye } from "react-icons/fi";
import { PiCrownSimpleFill } from "react-icons/pi";

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
      <PiCrownSimpleFill size={16} />
    </span>
  );
}

export function MobileHostBadge() {
  return (
    <span className="host-crown-indicator" data-tooltip="You are the host" data-tooltip-variant="info">
      <PiCrownSimpleFill size={14} />
    </span>
  );
}
