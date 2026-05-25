import type { FormEvent } from "react";
import { FiSend, FiSkipForward } from "react-icons/fi";
import type { PasswordLiveTypingEntry } from "../../hooks/usePasswordLiveTyping";
import { getPasswordPlayerName } from "../../lib/password-names";

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

type ActiveRound = {
  teamIndex: number;
  guesserId: string;
  roundId: string;
  word: string | null;
  encryptedWord?: string | null;
  clues: PasswordClueEntry[];
  guesses: PasswordGuessEntry[];
  guess: string | null;
  guessCount: number;
};

function formatEntryTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function scoreForNextGuess(guessCount: number) {
  const nextGuessNumber = guessCount + 1;
  if (nextGuessNumber <= 1) return 3;
  if (nextGuessNumber === 2) return 2;
  return 1;
}

function normalized(value: string) {
  return value.trim().toLowerCase();
}

type TimelineEntry =
  | ({ type: "clue"; playerName: string } & PasswordClueEntry)
  | ({ type: "guess"; playerName: string } & PasswordGuessEntry);

function ReadonlyLiveInput({
  text,
  placeholder,
}: {
  text: string;
  placeholder: string;
}) {
  return (
    <div className={`input pw-readonly-shell${text ? " pw-readonly-shell--active" : ""}`} aria-live="polite">
      <span className={`pw-readonly-shell-text${text ? "" : " pw-readonly-shell-text--placeholder"}`}>
        {text || placeholder}
      </span>
      {text ? <span className="pw-readonly-shell-caret" aria-hidden="true" /> : null}
    </div>
  );
}

export function PasswordActiveRound({
  activeRound,
  names,
  sessionId,
  teamMembers,
  clue,
  guess,
  liveEntries,
  skipsRemaining,
  onClueChange,
  onGuessChange,
  onSubmitClue,
  onSubmitGuess,
  onSkip,
  onRetryWordLoad
}: {
  activeRound: ActiveRound;
  names: Record<string, string>;
  sessionId: string;
  teamMembers: string[];
  clue: string;
  guess: string;
  liveEntries: PasswordLiveTypingEntry[];
  skipsRemaining: number;
  onClueChange: (value: string) => void;
  onGuessChange: (value: string) => void;
  onSubmitClue: (event: FormEvent) => void;
  onSubmitGuess: (event: FormEvent) => void;
  onSkip: () => void;
  onRetryWordLoad?: () => void;
}) {
  const guesserName = getPasswordPlayerName(names, activeRound.guesserId);
  const isGuesser = activeRound.guesserId === sessionId;
  const isOnTeam = teamMembers.includes(sessionId);
  const isClueGiver = isOnTeam && !isGuesser;
  const clueGiverCount = teamMembers.filter((member) => member !== activeRound.guesserId).length;
  const submittedClues = activeRound.clues ?? [];
  const submittedGuesses = activeRound.guesses ?? [];
  const clueDrafts = liveEntries.filter((entry) => entry.role === "clue" && entry.text.trim());
  const guessDraft = liveEntries.find((entry) => entry.role === "guess" && entry.text.trim());
  const clueDraftText = clueDrafts[clueDrafts.length - 1]?.text ?? "";
  const guessDraftText = guessDraft?.text ?? "";
  const draftTimeline = liveEntries.filter((entry) => entry.text.trim());
  const duplicateGuess = Boolean(
    guess.trim() &&
    submittedGuesses.some((entry) => normalized(entry.text) === normalized(guess))
  );
  const latestGuess = submittedGuesses[submittedGuesses.length - 1] ?? null;
  const timeline = [...submittedClues, ...submittedGuesses]
    .map<TimelineEntry>((entry) => {
      if ("correct" in entry) {
        return {
          ...entry,
          type: "guess",
          playerName: getPasswordPlayerName(names, entry.sessionId),
        };
      }
      return {
        ...entry,
        type: "clue",
        playerName: getPasswordPlayerName(names, entry.sessionId),
      };
    })
    .sort((a, b) => a.ts - b.ts);

  return (
    <div className="game-section pw-live-round">
      <div className="game-round-roles">
        <div className="game-round-role">
          <span className="game-round-role-label">Guesser</span>
          <span className={`game-round-role-name${isGuesser ? " game-round-role-name--me" : ""}`}>
            {guesserName}{isGuesser ? " (you)" : ""}
          </span>
        </div>
        <div className="game-round-role">
          <span className="game-round-role-label">Clue Team</span>
          <span className="game-round-role-name">
            {clueGiverCount} clue giver{clueGiverCount === 1 ? "" : "s"}
          </span>
        </div>
        <div className="game-round-role">
          <span className="game-round-role-label">Solve Value</span>
          <span className="game-round-role-name">
            {scoreForNextGuess(submittedGuesses.length)} pt{scoreForNextGuess(submittedGuesses.length) === 1 ? "" : "s"} next guess
          </span>
        </div>
      </div>

      <div className="pw-live-layout">
        <div className="pw-live-stack">
          <section className="pw-live-lane pw-live-lane--clue">
            <div className="pw-live-panel-head">
              <h3 className="pw-live-panel-title">Clues</h3>
              <span className="pw-live-panel-meta">
                {submittedClues.length} clue{submittedClues.length === 1 ? "" : "s"}
              </span>
            </div>

            {isClueGiver && activeRound.word ? (
              <>
                <div className="game-clue-reveal pw-live-secret">
                  <span className="game-clue-reveal-label">Secret Word</span>
                  <span className="game-clue-reveal-word">{activeRound.word}</span>
                </div>
                <form className="game-input-row pw-live-input" onSubmit={onSubmitClue}>
                  <input
                    className="input flex-1"
                    onFocus={(e) => e.currentTarget.select()}
                    value={clue}
                    onChange={(e) => onClueChange(e.target.value)}
                    placeholder={submittedClues.length > 0 ? "Drop another clue..." : "Enter first clue..."}
                    maxLength={80}
                  />
                  <button type="submit" className="btn btn-primary game-action-btn" disabled={!clue.trim()}>
                    <FiSend size={14} /> Send
                  </button>
                </form>
              </>
            ) : isClueGiver ? (
              <div className="game-waiting">
                <div className="game-waiting-pulse" />
                <p>Loading secret word…</p>
                <button className="btn btn-muted" type="button" onClick={onRetryWordLoad}>
                  Retry Sync
                </button>
              </div>
            ) : (
              <ReadonlyLiveInput text={clueDraftText} placeholder="Clue givers type here" />
            )}

            <div className="pw-live-feed" aria-label="Submitted clues">
              {submittedClues.length > 0 ? (
                submittedClues.map((entry) => {
                  const playerName = getPasswordPlayerName(names, entry.sessionId);
                  const repeated = entry.clueNumber > 1 || entry.repeatedText;
                  return (
                    <div key={entry.id} className={`pw-feed-chip${repeated ? " pw-feed-chip--repeat" : ""}`}>
                      <span className="pw-feed-chip-label">{playerName}</span>
                      <span className="pw-feed-chip-text">{entry.text}</span>
                      <span className="pw-feed-chip-meta">
                        {entry.clueNumber > 1 ? `Clue ${entry.clueNumber}` : "Clue"}
                      </span>
                    </div>
                  );
                })
              ) : null}
            </div>
          </section>

          <section className="pw-live-lane pw-live-lane--guess">
            <div className="pw-live-panel-head">
              <h3 className="pw-live-panel-title">Guesses</h3>
              <span className="pw-live-panel-meta">
                {submittedGuesses.length} guess{submittedGuesses.length === 1 ? "" : "es"}
              </span>
            </div>

            {latestGuess && !latestGuess.correct && (
              <div className="game-reveal-card game-reveal-card--fail pw-live-alert">
                <p className="game-reveal-title">Latest miss</p>
                <p className="game-reveal-sub">"{latestGuess.text}" was not it. Keep going.</p>
              </div>
            )}

            {isGuesser ? (
              <>
                <form className="game-input-row pw-live-input" onSubmit={onSubmitGuess}>
                  <input
                    className="input flex-1"
                    onFocus={(e) => e.currentTarget.select()}
                    value={guess}
                    onChange={(e) => onGuessChange(e.target.value)}
                    placeholder="Type your guess..."
                    maxLength={80}
                  />
                  <button
                    type="submit"
                    className="btn btn-primary game-action-btn"
                    disabled={!guess.trim() || duplicateGuess}
                  >
                    <FiSend size={14} /> Guess
                  </button>
                </form>
                {duplicateGuess && (
                  <p className="pw-live-warning">You already guessed that one. Try a new guess.</p>
                )}
              </>
            ) : (
              <ReadonlyLiveInput text={guessDraftText} placeholder={`${guesserName} types here`} />
            )}

            <div className="pw-live-feed" aria-label="Submitted guesses">
              {submittedGuesses.length > 0 ? (
                submittedGuesses.map((entry) => (
                  <div
                    key={entry.id}
                    className={`pw-feed-chip pw-feed-chip--guess${entry.correct ? " pw-feed-chip--success" : ""}`}
                  >
                    <span className="pw-feed-chip-label">
                      {getPasswordPlayerName(names, entry.sessionId)}
                    </span>
                    <span className="pw-feed-chip-text">{entry.text}</span>
                    <span className="pw-feed-chip-meta">
                      Guess {entry.guessNumber}{entry.correct ? " • solved" : ""}
                    </span>
                  </div>
                ))
              ) : null}
            </div>
          </section>
        </div>

        <aside className="pw-live-timeline-panel">
          <div className="pw-live-panel-head">
            <h3 className="pw-live-panel-title">Timeline</h3>
            <span className="pw-live-panel-meta">
              {timeline.length + draftTimeline.length} event{timeline.length + draftTimeline.length === 1 ? "" : "s"}
            </span>
          </div>

          {timeline.length > 0 || draftTimeline.length > 0 ? (
            <div className="pw-timeline">
              {timeline.map((entry) => (
                <div
                  key={entry.id}
                  className={`pw-timeline-item pw-timeline-item--${entry.type}${entry.type === "clue" && (entry.clueNumber > 1 || entry.repeatedText) ? " pw-timeline-item--repeat" : ""}${entry.type === "guess" && entry.correct ? " pw-timeline-item--success" : ""}`}
                >
                  <div className="pw-timeline-rail" />
                  <div className="pw-timeline-body">
                    <div className="pw-timeline-top">
                      <span className="pw-timeline-kind">{entry.type === "clue" ? "Clue" : "Guess"}</span>
                      <span className="pw-timeline-text">{entry.text}</span>
                      <span className="pw-timeline-time">{formatEntryTime(entry.ts)}</span>
                    </div>
                    <p className="pw-timeline-meta">
                      {entry.playerName}
                      {entry.type === "clue" && entry.clueNumber > 1 ? ` • clue ${entry.clueNumber}` : ""}
                      {entry.type === "clue" && entry.repeatedText ? " • repeated word" : ""}
                      {entry.type === "guess" ? ` • guess ${entry.guessNumber}${entry.correct ? " • correct" : ""}` : ""}
                    </p>
                  </div>
                </div>
              ))}
              {draftTimeline.map((entry) => (
                <div
                  key={`${entry.clientId ?? entry.sessionId}-${entry.role}-draft`}
                  className={`pw-timeline-item pw-timeline-item--draft pw-timeline-item--${entry.role === "clue" ? "clue" : "guess"}`}
                >
                  <div className="pw-timeline-rail" />
                  <div className="pw-timeline-body">
                    <div className="pw-timeline-top">
                      <span className="pw-timeline-kind">Draft</span>
                      <span className="pw-timeline-text">{entry.text}</span>
                      <span className="pw-timeline-time">Live</span>
                    </div>
                    <p className="pw-timeline-meta">
                      {getPasswordPlayerName(names, entry.sessionId)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="pw-live-empty pw-live-empty--timeline">Waiting...</div>
          )}
        </aside>
      </div>

      {isOnTeam && skipsRemaining > 0 && (
        <div className="pw-live-skip">
          <button className="btn btn-muted" onClick={onSkip}>
            <FiSkipForward size={14} /> Skip Word ({skipsRemaining} left)
          </button>
        </div>
      )}
    </div>
  );
}
