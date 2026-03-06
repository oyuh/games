import { useState } from "react";
import { FiCopy, FiCheck } from "react-icons/fi";
import { RoundCountdown } from "../shared/RoundCountdown";

const phaseLabels: Record<string, string> = {
  lobby: "Lobby",
  playing: "Playing",
  results: "Finished"
};

const phaseVariants: Record<string, string> = {
  lobby: "",
  playing: "badge-warn",
  results: "badge-success"
};

export function PasswordHeader({
  title,
  code,
  phase,
  currentRound,
  endsAt
}: {
  title: string;
  code: string;
  phase?: string;
  currentRound?: number;
  endsAt?: number | null | undefined;
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
        {phase && (
          <span className={`badge ${phaseVariants[phase] ?? ""}`}>
            {phaseLabels[phase] ?? phase}
          </span>
        )}
        {currentRound !== undefined && currentRound > 0 && (
          <span className="badge">Rd {currentRound}</span>
        )}
        {endsAt != null && <RoundCountdown endsAt={endsAt} label="Time" />}
      </div>
      <button className="game-code-btn" onClick={copyCode} title="Copy room code">
        {copied ? <FiCheck size={14} /> : <FiCopy size={14} />}
        <span>{code}</span>
      </button>
    </div>
  );
}
