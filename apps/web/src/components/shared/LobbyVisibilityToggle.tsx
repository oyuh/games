import { useState } from "react";
import { mutators } from "@games/shared";
import { optimistic, useZero } from "../../lib/zero";
import { showToast } from "../../lib/toast";
import { GameToggle } from "./GameKit";

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

  return (
    <GameToggle
      label="Visibility"
      detail={isPublic ? "Public" : "Code only"}
      checked={isPublic}
      onChange={() => void handleToggle()}
      disabled={toggling}
      tooltip={isPublic ? "Listed in Browse Games for anyone to join." : "Join code only. Turn on to list it in Browse Games."}
    />
  );
}
