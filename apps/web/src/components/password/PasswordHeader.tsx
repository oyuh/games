import { useState } from "react";
import { FiCopy, FiCheck } from "react-icons/fi";
import { PiCrownSimpleFill } from "react-icons/pi";
import { RoundCountdown } from "../shared/RoundCountdown";

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

export function PasswordHeader({
  title,
  code,
  phase,
  currentRound,
  endsAt,
  isHost
}: {
  title: string;
  code: string;
  phase?: string;
  currentRound?: number;
  endsAt?: number | null | undefined;
  isHost?: boolean;
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
        <h1 className="game-title">{title}</h1>
        {isHost && <span className="badge host-badge" data-tooltip="You created this game" data-tooltip-variant="info"><PiCrownSimpleFill size={12} /> Host</span>}
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
      <button className="game-code-btn" onClick={copyCode} data-tooltip={copied ? "Copied!" : "Click to copy room code"} data-tooltip-variant="info">
        {copied ? <FiCheck size={14} /> : <FiCopy size={14} />}
        <span>{code}</span>
      </button>
    </div>
  );
}
