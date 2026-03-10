import { ReactNode, useState } from "react";
import { FiCopy, FiCheck, FiTag } from "react-icons/fi";
import { PiCrownSimpleFill } from "react-icons/pi";
import { gameCategoryLabels } from "@games/shared";
import { RoundCountdown } from "../shared/RoundCountdown";
import { SpectatorBadge } from "../shared/SpectatorBadge";

const phaseLabels: Record<string, string> = {
  lobby: "Lobby",
  submitting: "Submitting",
  playing: "Playing",
  results: "Finished",
  finished: "Finished"
};

const phaseVariants: Record<string, string> = {
  lobby: "",
  submitting: "badge-warn",
  playing: "badge-warn",
  results: "badge-success",
  finished: "badge-success"
};

const phaseTooltips: Record<string, string> = {
  lobby: "Waiting for players to join teams",
  submitting: "Players are submitting chain words",
  playing: "Active round — give clues or guess",
  results: "Game complete — see final scores",
  finished: "Game complete — see final scores"
};

const headerIcons: Record<string, ReactNode> = {
  Password: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  "Chain Reaction": (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
};

export function PasswordHeader({
  title,
  code,
  phase,
  currentRound,
  endsAt,
  isHost,
  isSpectator,
  category
}: {
  title: string;
  code: string;
  phase?: string;
  currentRound?: number;
  endsAt?: number | null | undefined;
  isHost?: boolean;
  isSpectator?: boolean;
  category?: string | null;
}) {
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="game-header">
      <div className="game-header-left">
        {headerIcons[title] && <div className="game-header-icon">{headerIcons[title]}</div>}
        <h1 className="game-title">{title}</h1>
        {isHost && <span className="badge host-badge" data-tooltip="You created this game" data-tooltip-variant="info"><PiCrownSimpleFill size={12} /> Host</span>}
        {category && gameCategoryLabels[category] && (
          <span className="badge badge-category" data-tooltip="Word bank category" data-tooltip-variant="info"><FiTag size={10} /> {gameCategoryLabels[category]}</span>
        )}
        {phase && (
          <span className={`badge ${phaseVariants[phase] ?? ""}`} data-tooltip={phaseTooltips[phase]} data-tooltip-variant="game">
            {phaseLabels[phase] ?? phase}
          </span>
        )}
        {currentRound !== undefined && currentRound > 0 && (
          <span className="badge" data-tooltip="Current round number" data-tooltip-variant="info">Rd {currentRound}</span>
        )}
        {endsAt != null && <RoundCountdown endsAt={endsAt} label="Time" />}
      </div>
      <div className="game-header-right">
        {isSpectator && <SpectatorBadge />}
        <button className="game-code-btn" onClick={copyCode} data-tooltip={copied ? "Copied!" : "Click to copy room code"} data-tooltip-variant="info">
        {copied ? <FiCheck size={14} /> : <FiCopy size={14} />}
        <span>{code}</span>
      </button>
      </div>
    </div>
  );
}
