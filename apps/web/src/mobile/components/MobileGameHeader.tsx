import { FiCopy, FiTag } from "react-icons/fi";
import { useState } from "react";
import { gameCategoryLabels } from "@games/shared";

interface MobileGameHeaderProps {
  code: string;
  gameLabel: string;
  phase: string;
  round?: number;
  totalRounds?: number;
  accent?: string;
  category?: string | null;
  children?: React.ReactNode;
}

export function MobileGameHeader({ code, gameLabel, phase, round, totalRounds, accent, category, children }: MobileGameHeaderProps) {
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="m-game-header" style={accent ? { borderBottomColor: accent } : undefined}>
      <div className="m-game-header-top">
        <span className="m-game-header-label">{gameLabel}</span>
        <button className="m-game-header-code" onClick={copyCode}>
          {copied ? "Copied!" : code}
          {!copied && <FiCopy size={12} />}
        </button>
      </div>
      <div className="m-game-header-meta">
        {category && gameCategoryLabels[category] && (
          <span className="m-badge m-badge--outline" style={{ gap: "0.25rem" }}><FiTag size={10} /> {gameCategoryLabels[category]}</span>
        )}
        <span className="m-badge">{phase}</span>
        {round != null && (
          <span className="m-badge m-badge--outline">
            Round {round}{totalRounds ? ` / ${totalRounds}` : ""}
          </span>
        )}
        {children}
      </div>
    </div>
  );
}
