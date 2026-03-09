import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { MobileHostGameContext } from "../mobile/components/MobileHostControlsSheet";

interface MobileHostContextValue {
  hostGame: MobileHostGameContext | null;
  setHostGame: (game: MobileHostGameContext | null) => void;
}

const Ctx = createContext<MobileHostContextValue>({ hostGame: null, setHostGame: () => {} });

export function useMobileHost() {
  return useContext(Ctx);
}

export function MobileHostProvider({ children }: { children: ReactNode }) {
  const [hostGame, setHostGame] = useState<MobileHostGameContext | null>(null);
  return <Ctx.Provider value={{ hostGame, setHostGame }}>{children}</Ctx.Provider>;
}

/** Call from game pages to register/clear host context. Automatically cleans up on unmount. */
export function useMobileHostRegister(game: MobileHostGameContext | null) {
  const { setHostGame } = useMobileHost();
  useEffect(() => {
    setHostGame(game);
    return () => setHostGame(null);
  }, [game?.type, game?.gameId, game?.hostId]); // eslint-disable-line react-hooks/exhaustive-deps
}
