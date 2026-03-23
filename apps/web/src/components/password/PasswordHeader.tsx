import { ReactNode, useState } from "react";
import { FiCopy, FiCheck, FiTag } from "react-icons/fi";
import { gameCategoryLabels } from "@games/shared";
import { RoundCountdown } from "../shared/RoundCountdown";
import { SpectatorBadge, HostBadge } from "../shared/SpectatorBadge";

const phaseLabels: Record<string, string> = {
  lobby: "Lobby",
  submitting: "Submitting",
  playing: "Playing",
  picking: "Pick Location",
  clue1: "Clue 1",
  guess1: "Guess 1",
  clue2: "Clue 2",
  guess2: "Guess 2",
  clue3: "Clue 3",
  guess3: "Guess 3",
  clue4: "Clue 4",
  guess4: "Guess 4",
  reveal: "Reveal",
  results: "Finished",
  finished: "Finished"
};

const phaseVariants: Record<string, string> = {
  lobby: "",
  submitting: "badge-warn",
  playing: "badge-warn",
  picking: "badge-warn",
  clue1: "badge-warn",
  guess1: "badge-primary",
  clue2: "badge-warn",
  guess2: "badge-primary",
  clue3: "badge-warn",
  guess3: "badge-primary",
  clue4: "badge-warn",
  guess4: "badge-primary",
  reveal: "badge-success",
  results: "badge-success",
  finished: "badge-success"
};

const phaseTooltips: Record<string, string> = {
  lobby: "Waiting for players to join teams",
  submitting: "Players are submitting chain words",
  playing: "Active round — give clues or guess",
  picking: "Leader is choosing a location on the map",
  clue1: "Leader is writing their first clue",
  guess1: "Players are guessing the location",
  clue2: "Leader is writing their second clue",
  guess2: "Players are refining their guesses",
  clue3: "Leader is writing their third clue",
  guess3: "Players are refining their guesses",
  clue4: "Leader is writing their final clue",
  guess4: "Players are making their final guesses",
  reveal: "Showing results for this round",
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
  "Location Signal": (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
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
        {isHost && <HostBadge />}
        <button className="game-code-btn" onClick={copyCode} data-tooltip={copied ? "Copied!" : "Click to copy room code"} data-tooltip-variant="info">
        {copied ? <FiCheck size={14} /> : <FiCopy size={14} />}
        <span>{code}</span>
      </button>
      </div>
    </div>
  );
}
