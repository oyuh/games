import { useState } from "react";
import { FiCopy, FiCheck } from "react-icons/fi";
import { PiCrownSimpleFill } from "react-icons/pi";
import { RoundCountdown } from "../shared/RoundCountdown";

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

export function ImposterHeader({
  code,
  phase,
  currentRound,
  totalRounds,
  phaseEndsAt,
  isHost
}: {
  code: string;
  phase: string;
  currentRound: number;
  totalRounds: number;
  phaseEndsAt: number | null;
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
        <h1 className="game-title">Imposter</h1>
        {isHost && <span className="badge host-badge" title="You are the host"><PiCrownSimpleFill size={12} /> Host</span>}
        <span className={`badge ${phaseVariants[phase] ?? ""}`}>
          {phaseLabels[phase] ?? phase}
        </span>
        {phase !== "lobby" && (
          <span className="badge">Rd {currentRound}/{totalRounds}</span>
        )}
        <RoundCountdown endsAt={phaseEndsAt} label="Time" />
      </div>
      <button className="game-code-btn" onClick={copyCode} title="Copy room code">
        {copied ? <FiCheck size={14} /> : <FiCopy size={14} />}
        <span>{code}</span>
      </button>
    </div>
  );
}
