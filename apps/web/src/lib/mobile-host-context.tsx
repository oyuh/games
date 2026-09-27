import { createContext, use, useState, useEffect, type ReactNode } from "react";
import type { GameContext as MobileHostGameContext } from "../components/shared/HostControlsModal";

interface MobileHostContextValue {
  hostGame: MobileHostGameContext | null;
  setHostGame: (game: MobileHostGameContext | null) => void;
}

const Ctx = createContext<MobileHostContextValue>({ hostGame: null, setHostGame: () => {} });

export function useMobileHost() {
  return use(Ctx);
}

export function MobileHostProvider({ children }: { children: ReactNode }) {
  const [hostGame, setHostGame] = useState<MobileHostGameContext | null>(null);
  return <Ctx.Provider value={{ hostGame, setHostGame }}>{children}</Ctx.Provider>;
}

/** Call from game pages to register/clear host context. Automatically cleans up on unmount. */
export function useMobileHostRegister(game: MobileHostGameContext | null) {
  const { setHostGame } = useMobileHost();
  // Pages build a fresh object every render, so key on its contents. Keying on
  // the game id alone left the kick list frozen at whoever was there when the
  // host arrived.
  const key = game ? JSON.stringify(game) : "";
  useEffect(() => {
    setHostGame(game);
    return () => setHostGame(null);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}
