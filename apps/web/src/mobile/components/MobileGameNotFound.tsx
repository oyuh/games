import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { GameEmpty, GamePanel } from "../../components/shared/GameKit";

/** The desktop pages' empty state, with the same trip home after a moment. */
export function MobileGameNotFound({ theme }: { theme: string }) {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => navigate("/"), 3000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="game-page m-game" data-game-theme={theme}>
      <GamePanel>
        <GameEmpty title="No game here" hint="Taking you home…" />
      </GamePanel>
    </div>
  );
}
