import { useEffect, useRef, type FormEvent } from "react";
import { FiAlertCircle, FiCheck, FiEye, FiEyeOff, FiRotateCw, FiSend, FiSkipForward } from "react-icons/fi";
import { passwordCategoryLabels } from "@games/shared";
import { GameButton } from "../shared/GameKit";
import { GameTeamRoster } from "../shared/GameRoster";
import { PlayerAvatar } from "../shared/PlayerAvatar";
import { getPasswordPlayerName } from "../../lib/password-names";
import { passwordTeamCards, type PasswordTeam } from "./PasswordLobby";
import "../../styles/password-kit.css";

/**
 * The round, which is the game. Everything else is picking sides and reading
 * the scoreboard.
 *
 * Three things stacked, the same three Imposter's clue phase has: what you
 * know, what you are going to say, and what the room is doing. The room is one
 * stream rather than a lane of clues, a lane of guesses and a timeline of both,
 * because those were three drawings of one conversation and the conversation is
 * the thing you actually read.
 */

/** Which end of the round you are on. Undefined is watching. */
export type PasswordRole = "clue" | "guess" | undefined;

export interface PasswordClue {
  id: string;
  sessionId: string;
  text: string;
  ts: number;
  clueNumber: number;
  /** The server marks a clue that has already been given. */
  repeatedText?: boolean;
}

export interface PasswordGuess {
  id: string;
  sessionId: string;
  text: string;
  ts: number;
  correct: boolean;
  guessNumber: number;
}

/** Somebody mid-keystroke, off the realtime socket. Never persisted. */
export interface PasswordDraft {
  sessionId: string;
  role: "clue" | "guess";
  text: string;
  clientId?: string;
}

export function normalizeGuess(value: string) {
  return value.trim().toLowerCase();
}

/* ── What you know ──────────────────────────────────────────── */

export function PasswordWordCard({
  role,
  word,
  category,
  onRetry,
}: {
  role: PasswordRole;
  /** Null while the word is still being decrypted, which is a real state and
   *  not an empty one. Only the clue givers ever get it. */
  word: string | null;
  category?: string | null;
  onRetry?: () => void;
}) {
  const guessing = role === "guess";
  const bank = category ? (passwordCategoryLabels[category] ?? category) : null;

  /* A clue giver with no word yet cannot do the one thing they are here for,
     so they get the way out rather than an empty card. */
  if (role === "clue" && word === null) {
    return (
      <section className="pw-word pw-word--waiting">
        <p className="pw-word-role">
          <span className="pw-word-role-icon" aria-hidden="true"><FiAlertCircle /></span>
          Still getting your word
        </p>
        <p className="pw-word-hint">This is between you and the server, and it is taking a moment.</p>
        {onRetry && (
          <GameButton size="sm" variant="secondary" icon={<FiRotateCw />} onClick={onRetry}>
            Try again
          </GameButton>
        )}
      </section>
    );
  }

  return (
    <section className={`pw-word${guessing ? " pw-word--guess" : ""}`}>
      <p className="pw-word-role">
        <span className="pw-word-role-icon" aria-hidden="true">{guessing ? <FiEyeOff /> : <FiEye />}</span>
        {guessing ? "You are guessing" : "Get them to say this"}
      </p>

      {/* A fixed run of blocks, not one per letter. The number of letters is
          most of the way to the word. */}
      <p className="pw-word-value" {...(guessing ? { "aria-label": "You do not get the word" } : {})}>
        {guessing ? <span className="pw-word-blanks" aria-hidden="true">?????</span> : (word ?? "••••")}
      </p>

      <p className="pw-word-hint">
        {guessing
          ? bank
            ? <>Something from <strong>{bank}</strong>. Say every word it could be, wrong ones cost you nothing.</>
            : <>Say every word it could be. Wrong ones cost you nothing.</>
          : <>One word at a time, and never the word itself or any part of it.</>}
      </p>
    </section>
  );
}

/* ── What you are going to say ──────────────────────────────── */

export function PasswordComposer({
  role,
  value,
  duplicate,
  maxLength = 80,
  onChange,
  onSubmit,
  onDraft,
}: {
  role: PasswordRole;
  value: string;
  /** This exact guess has already been sent. Blocked rather than spent. */
  duplicate?: boolean;
  maxLength?: number;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  /** Every keystroke, unlike Imposter's once-per-phase tell. Here the room is
   *  your own team and watching them think is the point. */
  onDraft?: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const guessing = role === "guess";

  /* The box you have just emptied by sending something is the box you are
     about to type in again. */
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const timer = window.setTimeout(() => input.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [role]);

  return (
    <div className="pw-say-block">
      <form className={`pw-say${guessing ? " pw-say--guess" : ""}`} onSubmit={onSubmit}>
        <input
          ref={inputRef}
          className="pw-say-input"
          value={value}
          maxLength={maxLength}
          placeholder={guessing ? "What is it?" : "One word that points at it…"}
          aria-label={guessing ? "Your guess" : "Your clue"}
          onChange={(event) => {
            onChange(event.target.value);
            onDraft?.(event.target.value);
          }}
        />

        <span className="pw-say-count" aria-hidden="true">{maxLength - value.length}</span>

        <GameButton
          type="submit"
          variant="primary"
          icon={<FiSend />}
          disabled={!value.trim() || !!duplicate}
        >
          {guessing ? "Guess" : "Send"}
        </GameButton>
      </form>

      {duplicate && <p className="pw-say-note">You have said that one. It was not it.</p>}
    </div>
  );
}

/* ── What the room is doing ─────────────────────────────────── */

type StreamLine = {
  key: string;
  kind: "clue" | "guess";
  sessionId: string;
  text: string;
  ts: number;
  right?: boolean;
  repeat?: boolean;
  draft?: boolean;
};

/**
 * Clues and guesses in the order they were said, with whoever is typing right
 * now on the end. One conversation, read top to bottom, because a clue only
 * means anything next to the guess it caused.
 */
export function PasswordStream({
  clues,
  guesses,
  drafts = [],
  names,
  sessionId,
}: {
  clues: PasswordClue[];
  guesses: PasswordGuess[];
  drafts?: PasswordDraft[];
  names: Record<string, string>;
  sessionId: string;
}) {
  const said: StreamLine[] = [
    ...clues.map((c) => ({
      key: c.id,
      kind: "clue" as const,
      sessionId: c.sessionId,
      text: c.text,
      ts: c.ts,
      /* Only a word that has already been said. clueNumber is just where it
         came in the round, and greying out every clue after the first would
         wash out most of the conversation. */
      ...(c.repeatedText ? { repeat: true } : {}),
    })),
    ...guesses.map((g) => ({
      key: g.id,
      kind: "guess" as const,
      sessionId: g.sessionId,
      text: g.text,
      ts: g.ts,
      ...(g.correct ? { right: true } : {}),
    })),
  ].sort((a, b) => a.ts - b.ts);

  /* Nobody needs a ghost of their own typing. It is already in the box two
     inches above, with a cursor in it. */
  const live: StreamLine[] = drafts
    .filter((draft) => draft.text.trim() && draft.sessionId !== sessionId)
    .map((draft) => ({
      key: `${draft.clientId ?? draft.sessionId}-${draft.role}-draft`,
      kind: draft.role,
      sessionId: draft.sessionId,
      text: draft.text,
      ts: Number.MAX_SAFE_INTEGER,
      draft: true,
    }));

  const lines = [...said, ...live];

  return (
    <section className="pw-stream">
      <div className="gk-roster-head">
        <span className="gk-roster-label">This word</span>
        <span className="gk-roster-count">{said.length}</span>
      </div>

      {lines.length > 0 ? (
        <div className="pw-stream-rows">
          {lines.map((line) => (
            <div
              key={line.key}
              className={[
                "pw-line",
                `pw-line--${line.kind}`,
                line.right ? "pw-line--right" : "",
                line.repeat ? "pw-line--repeat" : "",
                line.draft ? "pw-line--draft" : "",
              ].filter(Boolean).join(" ")}
            >
              <span className="pw-line-face">
                <PlayerAvatar seed={line.sessionId} />
              </span>

              <span className="pw-line-name">{getPasswordPlayerName(names, line.sessionId)}</span>

              <span className="pw-line-text">
                {line.text}
                {line.draft && <span className="pw-dots" aria-hidden="true"><i /><i /><i /></span>}
              </span>

              {line.right && (
                <span className="pw-line-mark" aria-label="got it">
                  <FiCheck aria-hidden="true" />
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="gk-roster-empty">Nothing said yet. Somebody has to go first.</p>
      )}
    </section>
  );
}

/* ── Where everyone is ──────────────────────────────────────── */

/**
 * The other teams, mid game. Every team plays at once, so this is a
 * scoreboard rather than a turn order: your team open because those are the
 * people you are talking to, everyone else folded down to faces and a number,
 * which is all anybody wants from a rival while their own clock is running.
 */
export function PasswordScoreboard({
  teams,
  scores,
  targetScore,
  guessers,
  solved,
  names,
  sessionId,
  hostId,
}: {
  teams: PasswordTeam[];
  scores: Record<string, number>;
  targetScore: number;
  /** Team name to whoever is guessing for them. */
  guessers?: Record<string, string>;
  solved?: string[];
  names?: Record<string, string>;
  sessionId: string;
  hostId?: string;
}) {
  return (
    <GameTeamRoster
      label="Racing"
      teams={passwordTeamCards({
        teams,
        sessionId,
        scores,
        targetScore,
        foldOthers: true,
        ...(hostId ? { hostId } : {}),
        ...(names ? { names } : {}),
        ...(guessers ? { guessers } : {}),
        ...(solved ? { solved } : {}),
      })}
    />
  );
}

/* ── The phase ──────────────────────────────────────────────── */

export interface PasswordRoundProps {
  role: PasswordRole;
  /** Only ever the real word for a clue giver. */
  word: string | null;
  category?: string | null;
  clues: PasswordClue[];
  guesses: PasswordGuess[];
  drafts?: PasswordDraft[];
  names: Record<string, string>;
  sessionId: string;
  /** What is in your box. One box: you are either guessing or cluing. */
  value: string;
  skipsRemaining?: number;
  /** Given, the scoreboard goes under the round. Left off, the page is
   *  drawing the teams itself somewhere else. */
  teams?: PasswordTeam[];
  scores?: Record<string, number>;
  targetScore?: number;
  guessers?: Record<string, string>;
  solved?: string[];
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onDraft?: (value: string) => void;
  onSkip?: () => void;
  onRetryWord?: () => void;
}

export function PasswordRound({
  role,
  word,
  category,
  clues,
  guesses,
  drafts,
  names,
  sessionId,
  value,
  skipsRemaining = 0,
  teams,
  scores,
  targetScore,
  guessers,
  solved,
  onChange,
  onSubmit,
  onDraft,
  onSkip,
  onRetryWord,
}: PasswordRoundProps) {
  /* Sending the same guess twice is a keystroke you get nothing for, so the
     button goes dead before the round does. */
  const duplicate =
    role === "guess" &&
    !!value.trim() &&
    guesses.some((entry) => normalizeGuess(entry.text) === normalizeGuess(value));

  return (
    <>
      {role && (
        <PasswordWordCard
          role={role}
          word={word}
          {...(category !== undefined ? { category } : {})}
          {...(onRetryWord ? { onRetry: onRetryWord } : {})}
        />
      )}

      {role && !(role === "clue" && word === null) && (
        <PasswordComposer
          role={role}
          value={value}
          {...(duplicate ? { duplicate: true } : {})}
          onChange={onChange}
          onSubmit={onSubmit}
          {...(onDraft ? { onDraft } : {})}
        />
      )}

      <PasswordStream
        clues={clues}
        guesses={guesses}
        {...(drafts ? { drafts } : {})}
        names={names}
        sessionId={sessionId}
      />

      {/* Skipping is the team's, not the guesser's. Anyone stuck can call it. */}
      {role && onSkip && skipsRemaining > 0 && (
        <div className="pw-skip">
          <GameButton variant="ghost" size="sm" icon={<FiSkipForward />} onClick={onSkip}>
            Throw this one away
          </GameButton>
          <span className="pw-skip-left">{skipsRemaining} left</span>
        </div>
      )}

      {teams && scores && targetScore !== undefined && (
        <PasswordScoreboard
          teams={teams}
          scores={scores}
          targetScore={targetScore}
          names={names}
          sessionId={sessionId}
          {...(guessers ? { guessers } : {})}
          {...(solved ? { solved } : {})}
        />
      )}
    </>
  );
}
