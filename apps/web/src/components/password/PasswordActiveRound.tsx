import type { FormEvent } from "react";
import { FiSend, FiSkipForward } from "react-icons/fi";
import type { PasswordLiveTypingEntry } from "../../hooks/usePasswordLiveTyping";
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

function DraftLine({
  entry,
  names,
}: {
  entry: PasswordLiveTypingEntry;
  names: Record<string, string>;
}) {
  const playerName = names[entry.sessionId] ?? getDisplayName(null, entry.sessionId);
  return (
    <div className={`pw-draft-line pw-draft-line--${entry.role}`}>
      <span className="pw-draft-line-name">{playerName}</span>
      <span className="pw-draft-line-text">{entry.text}</span>
      <span className="pw-draft-line-caret" aria-hidden="true" />
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
  const guesserName = names[activeRound.guesserId] ?? getDisplayName(null, activeRound.guesserId);
  const isGuesser = activeRound.guesserId === sessionId;
  const isOnTeam = teamMembers.includes(sessionId);
  const isClueGiver = isOnTeam && !isGuesser;
  const clueGiverCount = teamMembers.filter((member) => member !== activeRound.guesserId).length;
  const submittedClues = activeRound.clues ?? [];
  const submittedGuesses = activeRound.guesses ?? [];
  const clueDrafts = liveEntries.filter((entry) => entry.role === "clue" && entry.text.trim());
  const guessDraft = liveEntries.find((entry) => entry.role === "guess" && entry.text.trim());
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
          playerName: names[entry.sessionId] ?? getDisplayName(null, entry.sessionId),
        };
      }
      return {
        ...entry,
        type: "clue",
        playerName: names[entry.sessionId] ?? getDisplayName(null, entry.sessionId),
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
              <div>
                <p className="pw-live-panel-label">Clue Givers</p>
                <h3 className="pw-live-panel-title">Clues in motion</h3>
              </div>
              <span className="pw-live-panel-meta">
                {submittedClues.length} clue{submittedClues.length === 1 ? "" : "s"}
              </span>
            </div>

            {clueDrafts.length > 0 && (
              <div className="pw-draft-strip" aria-live="polite">
                {clueDrafts.map((entry) => (
                  <DraftLine key={entry.clientId ?? `${entry.sessionId}-${entry.role}`} entry={entry} names={names} />
                ))}
              </div>
            )}

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
              <div className="pw-live-readonly">
                <p className="pw-live-readonly-title">
                  {isGuesser ? "You can guess at any time while clues come in." : "Watch your team build the round in real time."}
                </p>
                <p className="pw-live-readonly-sub">
                  Submitted clues stay visible and new clue drafts pulse in as teammates type.
                </p>
              </div>
            )}

            <div className="pw-live-feed" aria-label="Submitted clues">
              {submittedClues.length > 0 ? (
                submittedClues.map((entry) => {
                  const playerName = names[entry.sessionId] ?? getDisplayName(null, entry.sessionId);
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
              ) : (
                <div className="pw-live-empty">No clues locked in yet.</div>
              )}

              {clueDrafts.length > 0 && <div className="pw-live-empty pw-live-empty--draft">Live draft above.</div>}
            </div>
          </section>

          <section className="pw-live-lane pw-live-lane--guess">
            <div className="pw-live-panel-head">
              <div>
                <p className="pw-live-panel-label">Guesser</p>
                <h3 className="pw-live-panel-title">Guess stream</h3>
              </div>
              <span className="pw-live-panel-meta">
                {submittedGuesses.length} guess{submittedGuesses.length === 1 ? "" : "es"}
              </span>
            </div>

            {guessDraft && (
              <div className="pw-draft-strip" aria-live="polite">
                <DraftLine entry={guessDraft} names={names} />
              </div>
            )}

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
              <div className="pw-live-readonly">
                <p className="pw-live-readonly-title">
                  {guesserName} can guess at any time.
                </p>
                <p className="pw-live-readonly-sub">
                  You’ll see draft guesses update character-by-character before they send them.
                </p>
              </div>
            )}

            <div className="pw-live-feed" aria-label="Submitted guesses">
              {submittedGuesses.length > 0 ? (
                submittedGuesses.map((entry) => (
                  <div
                    key={entry.id}
                    className={`pw-feed-chip pw-feed-chip--guess${entry.correct ? " pw-feed-chip--success" : ""}`}
                  >
                    <span className="pw-feed-chip-label">
                      {names[entry.sessionId] ?? getDisplayName(null, entry.sessionId)}
                    </span>
                    <span className="pw-feed-chip-text">{entry.text}</span>
                    <span className="pw-feed-chip-meta">
                      Guess {entry.guessNumber}{entry.correct ? " • solved" : ""}
                    </span>
                  </div>
                ))
              ) : (
                <div className="pw-live-empty">No guesses submitted yet.</div>
              )}

              {guessDraft && <div className="pw-live-empty pw-live-empty--draft">Live draft above.</div>}
            </div>
          </section>
        </div>

        <aside className="pw-live-timeline-panel">
          <div className="pw-live-panel-head">
            <div>
              <p className="pw-live-panel-label">Round Timeline</p>
              <h3 className="pw-live-panel-title">Round pulse</h3>
            </div>
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
                      <span className="pw-timeline-time">{formatEntryTime(entry.ts)}</span>
                    </div>
                    <p className="pw-timeline-text">{entry.text}</p>
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
                      <span className="pw-timeline-kind">{entry.role === "clue" ? "Clue Draft" : "Guess Draft"}</span>
                      <span className="pw-timeline-time">Live</span>
                    </div>
                    <p className="pw-timeline-text">{entry.text}</p>
                    <p className="pw-timeline-meta">
                      {names[entry.sessionId] ?? getDisplayName(null, entry.sessionId)} is typing
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="pw-live-empty pw-live-empty--timeline">
              The timeline fills in as clues and guesses land.
            </div>
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
