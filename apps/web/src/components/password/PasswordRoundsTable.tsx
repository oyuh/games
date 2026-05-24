import { useMemo, useState, type CSSProperties } from "react";
import { FiChevronDown, FiChevronUp } from "react-icons/fi";
import { getDisplayName } from "../../lib/session";

type PasswordClueEntry = {
  id: string;
  sessionId: string;
  text: string;
  ts: number;
  clueNumber: number;
  repeatedText?: boolean;
};

type PasswordGuessEntry = {
  id: string;
  sessionId: string;
  text: string;
  ts: number;
  correct: boolean;
  guessNumber: number;
};

type Round = {
  round: number;
  teamIndex: number;
  guesserId: string;
  roundId: string;
  word: string;
  clues: PasswordClueEntry[];
  guesses: PasswordGuessEntry[];
  guess: string | null;
  guessCount: number;
  points: number;
  correct: boolean;
};

type Team = { name: string };

const teamColors = ["#7ecbff", "#a78bfa", "#4ade80", "#f59e0b", "#f87171", "#ec4899"];

function formatEntryTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function PasswordRoundsTable({
  rounds,
  teams,
  names,
  defaultOpen
}: {
  rounds: Round[];
  teams: Team[];
  names: Record<string, string>;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  const roundsWithTimeline = useMemo(() => {
    return [...rounds].reverse().map((round) => {
      const timeline = [...(round.clues ?? []), ...(round.guesses ?? [])]
        .map((entry) => {
          if ("correct" in entry) {
            return {
              ...entry,
              type: "guess" as const,
              playerName: names[entry.sessionId] ?? getDisplayName(null, entry.sessionId),
            };
          }
          return {
            ...entry,
            type: "clue" as const,
            playerName: names[entry.sessionId] ?? getDisplayName(null, entry.sessionId),
          };
        })
        .sort((a, b) => a.ts - b.ts);

      return { round, timeline };
    });
  }, [names, rounds]);

  if (!rounds.length) {
    return null;
  }

  return (
    <div className="game-section">
      <button
        className="pw-history-toggle"
        onClick={() => setOpen(!open)}
      >
        <h3 className="game-section-label" style={{ margin: 0 }}>Round History</h3>
        <span className="pw-history-toggle-meta">
          {rounds.length} round{rounds.length !== 1 ? "s" : ""}
          {open ? <FiChevronUp size={16} /> : <FiChevronDown size={16} />}
        </span>
      </button>

      {open && (
        <div className="pw-history-list">
          {roundsWithTimeline.map(({ round, timeline }) => {
            const teamName = teams[round.teamIndex]?.name ?? `Team ${round.teamIndex + 1}`;
            const teamColor = teamColors[round.teamIndex % teamColors.length]!;
            const guesserName = names[round.guesserId] ?? getDisplayName(null, round.guesserId);

            return (
              <div
                key={round.roundId}
                className={`pw-history-card ${round.correct ? "pw-history-card--correct" : "pw-history-card--wrong"}`}
                style={{ "--pw-team-color": teamColor } as CSSProperties}
              >
                <div className="pw-history-card-top">
                  <span className="pw-history-team" style={{ color: teamColor }}>{teamName}</span>
                  <span className={`pw-history-result ${round.correct ? "pw-history-result--correct" : "pw-history-result--wrong"}`}>
                    {round.correct ? `+${round.points}` : "✗"}
                  </span>
                </div>

                <div className="pw-history-word-row">
                  <span className="pw-history-word">{round.word}</span>
                  <span className="pw-history-arrow">→</span>
                  <span className={`pw-history-guess ${round.correct ? "pw-history-guess--correct" : "pw-history-guess--wrong"}`}>
                    {round.guess ?? "No solve"}
                  </span>
                </div>

                <div className="pw-history-details">
                  <div className="pw-history-detail">
                    <span className="pw-history-detail-label">Guesser</span>
                    <span className="pw-history-detail-value">{guesserName}</span>
                  </div>
                  <div className="pw-history-detail">
                    <span className="pw-history-detail-label">Attempts</span>
                    <span className="pw-history-detail-value">{round.guessCount}</span>
                  </div>
                  <div className="pw-history-detail">
                    <span className="pw-history-detail-label">Score</span>
                    <span className="pw-history-detail-value">{round.points} pt{round.points === 1 ? "" : "s"}</span>
                  </div>
                </div>

                <div className="pw-history-timeline">
                  {timeline.map((entry) => (
                    <div
                      key={entry.id}
                      className={`pw-history-event pw-history-event--${entry.type}${entry.type === "clue" && (entry.clueNumber > 1 || entry.repeatedText) ? " pw-history-event--repeat" : ""}${entry.type === "guess" && entry.correct ? " pw-history-event--success" : ""}`}
                    >
                      <div className="pw-history-event-top">
                        <span className="pw-history-event-kind">{entry.type === "clue" ? "Clue" : "Guess"}</span>
                        <span className="pw-history-event-time">{formatEntryTime(entry.ts)}</span>
                      </div>
                      <p className="pw-history-event-text">{entry.text}</p>
                      <p className="pw-history-event-meta">
                        {entry.playerName}
                        {entry.type === "clue" && entry.clueNumber > 1 ? ` • clue ${entry.clueNumber}` : ""}
                        {entry.type === "clue" && entry.repeatedText ? " • repeated word" : ""}
                        {entry.type === "guess" ? ` • guess ${entry.guessNumber}${entry.correct ? " • correct" : ""}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
