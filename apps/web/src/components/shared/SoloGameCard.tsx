import type { GameSlug } from "@games/shared";
import type { CSSProperties, ReactNode } from "react";
import { FiHelpCircle } from "react-icons/fi";
import { Link } from "react-router-dom";

export interface SoloGameDef {
  id: string;
  gameSlug?: GameSlug;
  demoId?: string;
  title: string;
  description: string;
  accent: string;
  bgGradient: string;
  preview: ReactNode;
  href?: string;
  actionLabel?: string;
  comingSoon?: boolean;
}

export function SoloGameCard({ game, onDemo }: { game: SoloGameDef; onDemo?: (demoId: string) => void }) {
  const canPlay = Boolean(game.href);
  const canDemo = Boolean(game.demoId && onDemo);
  const isExternal = game.href?.startsWith("http");
  const actionLabel = game.actionLabel ?? (canPlay ? `Play ${game.title}` : undefined);
  const tooltip = game.actionLabel ?? "Press to Play";

  const openDemo = () => {
    if (game.demoId) onDemo?.(game.demoId);
  };

  return (
    <div
      className={`solo-card${canPlay ? " solo-card--playable" : " solo-card--disabled"}${game.comingSoon ? " solo-card--coming-soon" : ""}`}
      data-game-theme={game.gameSlug}
      style={{ "--solo-accent": game.accent, "--solo-bg": game.bgGradient } as CSSProperties}
    >
      {game.href && isExternal && (
        <a
          href={game.href}
          className="solo-card-hit-area"
          aria-label={actionLabel}
          data-tooltip={tooltip}
          data-tooltip-variant="game"
          target="_blank"
          rel="noreferrer"
        />
      )}
      {game.href && !isExternal && (
        <Link
          to={game.href}
          className="solo-card-hit-area"
          aria-label={actionLabel}
          data-tooltip={tooltip}
          data-tooltip-variant="game"
        />
      )}
      <div className="solo-card-body">
        <div className="solo-card-title-row">
          {game.href && isExternal ? (
            <a
              href={game.href}
              className="solo-card-title-link"
              aria-label={actionLabel}
              data-tooltip={tooltip}
              data-tooltip-variant="game"
              target="_blank"
              rel="noreferrer"
            >
              <h3 className="solo-card-title">{game.title}</h3>
            </a>
          ) : game.href ? (
            <Link
              to={game.href}
              className="solo-card-title-link"
              aria-label={actionLabel}
              data-tooltip={tooltip}
              data-tooltip-variant="game"
            >
              <h3 className="solo-card-title">{game.title}</h3>
            </Link>
          ) : (
            <span className="solo-card-title-link">
              <h3 className="solo-card-title">{game.title}</h3>
            </span>
          )}
          {canDemo && (
            <button
              className="solo-card-help"
              type="button"
              aria-label={`How to play ${game.title}`}
              data-tooltip="How to Play"
              data-tooltip-variant="info"
              onClick={openDemo}
            >
              <FiHelpCircle size={18} />
            </button>
          )}
        </div>
        <div className="solo-card-preview">{game.preview}</div>
        <p className="solo-card-desc">{game.description}</p>
      </div>
    </div>
  );
}
