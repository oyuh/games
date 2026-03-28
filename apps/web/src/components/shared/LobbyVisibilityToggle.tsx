import { useState } from "react";
import { FiGlobe, FiLock } from "react-icons/fi";
import { mutators } from "@games/shared";
import { useZero } from "../../lib/zero";
import { showToast } from "../../lib/toast";

type GameType = "imposter" | "password" | "chain_reaction" | "shade_signal" | "location_signal";

const mutatorMap = {
  imposter: mutators.imposter.setPublic,
  password: mutators.password.setPublic,
  chain_reaction: mutators.chainReaction.setPublic,
  shade_signal: mutators.shadeSignal.setPublic,
  location_signal: mutators.locationSignal.setPublic,
};

export function LobbyVisibilityToggle({
  gameType,
  gameId,
  sessionId,
  isPublic,
}: {
  gameType: GameType;
  gameId: string;
  sessionId: string;
  isPublic: boolean;
}) {
  const zero = useZero();
  const [toggling, setToggling] = useState(false);

  const handleToggle = async () => {
    const newValue = !isPublic;
    setToggling(true);
    try {
      await zero.mutate(mutatorMap[gameType]({ gameId, hostId: sessionId, isPublic: newValue })).server;
      showToast(newValue ? "Game is now public" : "Game is now private", "info");
    } catch {
      showToast("Couldn't change visibility", "error");
    } finally {
      setToggling(false);
    }
  };

  return (
    <button
      className={`btn lobby-vis-toggle${isPublic ? " lobby-vis-toggle--public" : ""}`}
      onClick={() => void handleToggle()}
      disabled={toggling}
      data-tooltip={isPublic ? "Anyone can find and join · Click to make private" : "Only players with code can join · Click to make public"}
      data-tooltip-variant="info"
    >
      {toggling
        ? "Updating…"
        : isPublic
          ? <><FiGlobe size={14} /> Public</>
          : <><FiLock size={14} /> Private</>}
    </button>
  );
}
