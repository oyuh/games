import type { GameSlug } from "@games/shared";
import type { ReactNode } from "react";
import { FiPlay } from "react-icons/fi";
import { Link } from "react-router-dom";
import { GameIcon } from "./GameIcon";

export interface SoloGameDef {
  id: string;
  gameSlug?: GameSlug;
  title: string;
  description: string;
  accent: string;
  bgGradient: string;
  preview: ReactNode;
  href?: string;
}

export function SoloGameCard({ game }: { game: SoloGameDef }) {
  return (
    <div
      className="solo-card"
      data-game-theme={game.gameSlug}
      style={{ "--solo-accent": game.accent, "--solo-bg": game.bgGradient } as React.CSSProperties}
    >
      <div className="solo-card-body">
        <div className="solo-card-title-row">
          {game.gameSlug && <GameIcon game={game.gameSlug} size={18} />}
          <h3 className="solo-card-title">{game.title}</h3>
        </div>
        <p className="solo-card-desc">{game.description}</p>
        <div className="solo-card-preview">{game.preview}</div>
        {game.href ? (
          <Link to={game.href} className="btn solo-card-play">
            <FiPlay size={16} />
            <span>Play</span>
          </Link>
        ) : (
          <button className="btn solo-card-play" disabled>
            <FiPlay size={16} />
            <span>Coming Soon</span>
          </button>
        )}
      </div>
    </div>
  );
}
