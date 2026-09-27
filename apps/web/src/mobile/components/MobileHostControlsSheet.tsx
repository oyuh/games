import { HostControls, type GameContext } from "../../components/shared/HostControlsModal";
import { BottomSheet } from "./BottomSheet";

export function MobileHostControlsSheet({
  game,
  sessionId,
  onClose,
}: {
  game: GameContext;
  sessionId: string;
  onClose: () => void;
}) {
  return (
    <BottomSheet title="Host Controls" onClose={onClose}>
      <HostControls game={game} sessionId={sessionId} onClose={onClose} />
    </BottomSheet>
  );
}
