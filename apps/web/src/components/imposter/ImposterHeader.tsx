import { useState } from "react";
import { FiCopy, FiCheck } from "react-icons/fi";
import { RoundCountdown } from "../shared/RoundCountdown";

const phaseLabels: Record<string, string> = {
  lobby: "Lobby",
  playing: "Clues",
  voting: "Voting",
  results: "Results"
};

const phaseVariants: Record<string, string> = {
  lobby: "",
  playing: "badge-warn",
  voting: "badge-danger",
  results: "badge-success"
};

export function ImposterHeader({
  code,
  phase,
  currentRound,
  totalRounds,
  phaseEndsAt
}: {
  code: string;
  phase: string;
  currentRound: number;
  totalRounds: number;
  phaseEndsAt: number | null;
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
