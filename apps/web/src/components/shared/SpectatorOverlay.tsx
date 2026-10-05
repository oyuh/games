import { FiEye, FiLogOut } from "react-icons/fi";
import { Button } from "./Button";

interface SpectatorOverlayProps {
  phase: string;
  playerCount: number;
  onLeave: () => void;
}

export function SpectatorOverlay({ phase, playerCount, onLeave }: SpectatorOverlayProps) {
  return (
    <div className="game-section spectator-overlay">
      <div className="game-waiting">
        <FiEye size={20} style={{ opacity: 0.6 }} />
        <p className="spectator-overlay-text">
          You are spectating this game
        </p>
        <p className="spectator-overlay-sub meta-parts">
          <span>{playerCount} player{playerCount !== 1 ? "s" : ""}</span>
          <span>{phase}</span>
        </p>
        <Button size="sm" icon={<FiLogOut />} onClick={onLeave} style={{ marginTop: "0.5rem" }}>
          Leave
        </Button>
      </div>
    </div>
  );
}
