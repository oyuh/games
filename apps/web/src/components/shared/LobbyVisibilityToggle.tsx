import { useState } from "react";
import { FiGlobe, FiLock } from "react-icons/fi";
import { mutators } from "@games/shared";
import { optimistic, useZero } from "../../lib/zero";
import { showToast } from "../../lib/toast";
import { GameButton } from "./GameKit";

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
      await optimistic(zero.mutate(mutatorMap[gameType]({ gameId, hostId: sessionId, isPublic: newValue })));
      showToast(newValue ? "Game is now public" : "Game is now private", "info");
    } catch {
      showToast("Couldn't change visibility", "error");
    } finally {
      setToggling(false);
    }
  };

  /* It is a switch, not a label, so it says what pressing it does rather than
     naming the state it is already in and hoping you work the rest out. The
     state is on the icon and in the tooltip. */
  return (
    <GameButton
      variant="secondary"
      icon={isPublic ? <FiGlobe /> : <FiLock />}
      onClick={() => void handleToggle()}
      {...(toggling ? { loading: true } : {})}
      data-tooltip={isPublic
        ? "Listed in Browse Games. Press to make it code only."
        : "Join code only. Press to list it in Browse Games."}
      data-tooltip-variant="info"
    >
      {isPublic ? "Make it private" : "Make it public"}
    </GameButton>
  );
}
