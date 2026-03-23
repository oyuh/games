import { useState } from "react";
import { FiCopy, FiCheck } from "react-icons/fi";
import { FiTag } from "react-icons/fi";
import { gameCategoryLabels } from "@games/shared";
import { RoundCountdown } from "../shared/RoundCountdown";
import { SpectatorBadge, HostBadge } from "../shared/SpectatorBadge";

const phaseLabels: Record<string, string> = {
  lobby: "Lobby",
  playing: "Clues",
  voting: "Voting",
  results: "Results",
  finished: "Finished"
};

const phaseVariants: Record<string, string> = {
  lobby: "",
  playing: "badge-warn",
  voting: "badge-danger",
  results: "badge-success",
  finished: "badge-success"
};

const phaseTooltips: Record<string, string> = {
  lobby: "Waiting for players to join",
  playing: "Players are submitting clues",
  voting: "Vote for who you think is the imposter",
  results: "See who the imposter was",
  finished: "Game over — all rounds complete"
};

export function ImposterHeader({
  code,
  phase,
  currentRound,
  totalRounds,
  phaseEndsAt,
  isHost,
  isSpectator,
  category
}: {
  code: string;
  phase: string;
  currentRound: number;
  totalRounds: number;
  phaseEndsAt: number | null;
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
        <div className="game-header-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </div>
        <h1 className="game-title">Imposter</h1>
        {category && gameCategoryLabels[category] && (
          <span className="badge badge-category" data-tooltip="Word bank category" data-tooltip-variant="info"><FiTag size={10} /> {gameCategoryLabels[category]}</span>
        )}
        <span className={`badge ${phaseVariants[phase] ?? ""}`} data-tooltip={phaseTooltips[phase]} data-tooltip-variant="game">
          {phaseLabels[phase] ?? phase}
        </span>
        {phase !== "lobby" && (
          <span className="badge" data-tooltip="Current round out of total" data-tooltip-variant="info">Rd {currentRound}/{totalRounds}</span>
        )}
        <RoundCountdown endsAt={phaseEndsAt} label="Time" />
      </div>
      <div className="game-header-right">
        {isSpectator && <SpectatorBadge />}
        {isHost && <HostBadge />}
        <button className="game-code-btn" onClick={copyCode} data-tooltip={copied ? "Copied!" : "Click to copy room code"} data-tooltip-variant="info">
        {copied ? <FiCheck size={14} /> : <FiCopy size={14} />}
        <span>{code}</span>
      </button>
      </div>
    </div>
  );
}
