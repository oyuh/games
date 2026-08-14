import { useEffect, useRef, type FormEvent } from "react";
import { FiAlertCircle, FiAward, FiCheck, FiEye, FiEyeOff, FiHelpCircle, FiMessageSquare, FiRotateCw, FiSend, FiSkipForward } from "react-icons/fi";
import { isClueTooSimilar, isOneWord, passwordCategoryLabels, scorePasswordGuessCount } from "@games/shared";
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
 * Nothing here takes turns. Your team's clue givers and your team's guesser
 * are typing at each other at the same moment, and every other team is doing
 * the same thing on a different word. So the round is two boxes side by side,
 * both live, both always on screen: yours takes your keystrokes and the other
 * one shows theirs as they happen. Two live boxes is the shortest way to say
 * "you are both going right now", and a chat log full of things that already
 * happened is the longest.
 *
 * The record of the word lives beside them rather than in them. What was said
 * and what is being said are different questions and they were sharing one
 * surface, which is what made this read like turns.
 */

/** Which end of the exchange you are on. Undefined is watching. */
export type PasswordRole = "clue" | "guess" | undefined;

export interface PasswordClue {
  id: string;
  sessionId: string;
  text: string;
  ts: number;
  clueNumber: number;
  /** The server marks a clue whose word has already been given. */
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

/** Somebody mid-keystroke, off the team's realtime topic. Never persisted,
 *  and never leaves the team. */
export interface PasswordDraft {
  sessionId: string;
  role: "clue" | "guess";
  text: string;
  clientId?: string;
}

/** One word your team already took. */
export interface PasswordTaken {
  roundId: string;
  word: string;
  guesserId: string;
  guessCount: number;
  points: number;
}

export function normalizeGuess(value: string) {
  return value.trim().toLowerCase();
}

/**
 * What this word is still worth. Three for a first guess, two for a second,
 * one after that, straight off the server's own scorer so the number on the
 * screen is the number that gets awarded.
 */
export function wordWorth(guessesSoFar: number) {
  return scorePasswordGuessCount(guessesSoFar + 1);
}

/* ── What you know ──────────────────────────────────────────── */

export function PasswordWordCard({
  role,
  word,
  category,
  worth,
  onRetry,
}: {
  role: PasswordRole;
  /** Null while the word is still being decrypted, which is a real state and
   *  not an empty one. Only the clue givers ever get it. */
  word: string | null;
  category?: string | null;
  /** Points the next guess would take. Left off, no ladder is drawn. */
  worth?: number;
  onRetry?: () => void;
}) {
  const guessing = role === "guess";
  const bank = category ? (passwordCategoryLabels[category] ?? category) : null;

  /* A clue giver with no word cannot do the one thing they are here for, so
     they get the way out rather than an empty card. */
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
            ? <>Something from <strong>{bank}</strong>. One word a go.</>
            : <>One word a go.</>
          : <>One word at a time, and never the word itself or any part of it.</>}
      </p>

      {/* The reason a guesser thinks before typing. Spraying guesses is
          allowed and it is also how three points becomes one. */}
      {worth !== undefined && (
        <p className="pw-worth" aria-label={`Worth ${worth} ${worth === 1 ? "point" : "points"} now`}>
          {[3, 2, 1].map((n) => (
            <span key={n} className={`pw-worth-pip${n === worth ? " is-now" : ""}${n > worth ? " is-gone" : ""}`}>
              {n}
            </span>
          ))}
          <span className="pw-worth-label">{worth === 1 ? "point" : "points"} if they get it now</span>
        </p>
      )}
    </section>
  );
}

/* ── The two boxes ──────────────────────────────────────────── */

/** Faces of everyone on one side of the exchange. */
function LaneHeads({ people, names }: { people: string[]; names: Record<string, string> }) {
  return (
    <span className="pw-lane-heads">
      {people.map((id) => (
        <span className="pw-lane-head" key={id} data-tooltip={getPasswordPlayerName(names, id)} data-tooltip-variant="game">
          <PlayerAvatar seed={id} />
        </span>
      ))}
    </span>
  );
}

export interface PasswordLaneProps {
  side: "clue" | "guess";
  /** Session ids on this side. Clue side is usually more than one. */
  people: string[];
  names: Record<string, string>;
  /** This is your side: a real box instead of a mirror. */
  mine?: boolean;
  value?: string;
  /** Blocks the box while there is no word to be talking about. */
  disabled?: boolean;
  /** Whoever is typing on this side right now, minus you. */
  drafts?: PasswordDraft[];
  /** The last thing said on this side, so the lane means something before
   *  anybody touches a key. */
  latest?: { sessionId: string; text: string; right?: boolean } | undefined;
  /** Why the button is off. One short line, already worked out by the round. */
  problem?: string | undefined;
  maxLength?: number;
  onChange?: (value: string) => void;
  onSubmit?: (event: FormEvent) => void;
  onDraft?: (value: string) => void;
}

/**
 * One side of the exchange. Yours is a box you type in; theirs is the same
 * box with their keystrokes arriving in it. Deliberately the same shape both
 * ways, because the point of the pair is that both ends are live.
 */
export function PasswordLane({
  side,
  people,
  names,
  mine,
  value = "",
  disabled,
  drafts = [],
  latest,
  problem,
  maxLength = 80,
  onChange,
  onSubmit,
  onDraft,
}: PasswordLaneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const guessing = side === "guess";

  /* The box you just emptied by sending something is the box you are about to
     type in again. */
  useEffect(() => {
    if (!mine || disabled) return;
    const input = inputRef.current;
    if (!input) return;
    const timer = window.setTimeout(() => input.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [mine, disabled]);

  const typing = drafts.filter((draft) => draft.text.trim());

  return (
    <section className={`pw-lane pw-lane--${side}${mine ? " pw-lane--mine" : ""}`}>
      <header className="pw-lane-head">
        <span className="pw-lane-label">{guessing ? "Guessing" : "Cluing"}</span>
        <LaneHeads people={people} names={names} />
        {mine && <span className="pw-lane-you">you</span>}
      </header>

      {mine ? (
        <form className="pw-say" onSubmit={onSubmit}>
          <input
            ref={inputRef}
            className="pw-say-input"
            value={value}
            maxLength={maxLength}
            disabled={!!disabled}
            placeholder={guessing ? "One word. What is it?" : "One word that points at it…"}
            aria-label={guessing ? "Your guess" : "Your clue"}
            onChange={(event) => {
              onChange?.(event.target.value);
              onDraft?.(event.target.value);
            }}
          />

          <span className="pw-say-count" aria-hidden="true">{maxLength - value.length}</span>

          <GameButton type="submit" variant="primary" icon={<FiSend />} disabled={!value.trim() || !!problem || !!disabled}>
            {guessing ? "Guess" : "Send"}
          </GameButton>
        </form>
      ) : (
        /* Their box, from this side of the table. Empty it says who it is
           waiting on, which is more use than an empty box. */
        <div className={`pw-mirror${typing.length > 0 ? " is-live" : ""}`} aria-live="polite">
          {typing.length > 0 ? (
            typing.map((draft) => (
              <span className="pw-mirror-line" key={draft.clientId ?? draft.sessionId}>
                <span className="pw-mirror-who">{getPasswordPlayerName(names, draft.sessionId)}</span>
                <span className="pw-mirror-text">{draft.text}</span>
                <span className="pw-caret" aria-hidden="true" />
              </span>
            ))
          ) : (
            <span className="pw-mirror-idle">
              {people.length === 0
                ? "Nobody on this side"
                : guessing
                  ? "Waiting on a guess"
                  : "Waiting on a clue"}
              <span className="pw-dots" aria-hidden="true"><i /><i /><i /></span>
            </span>
          )}
        </div>
      )}

      {problem && <p className="pw-say-note">{problem}</p>}

      {latest && (
        <p className={`pw-lane-last${latest.right ? " pw-lane-last--right" : ""}`}>
          <span className="pw-lane-last-label">last</span>
          <span className="pw-lane-last-text">{latest.text}</span>
          <span className="pw-lane-last-who">{getPasswordPlayerName(names, latest.sessionId)}</span>
        </p>
      )}
    </section>
  );
}

/* ── What has been said ─────────────────────────────────────── */

type StreamLine = {
  key: string;
  kind: "clue" | "guess";
  sessionId: string;
  text: string;
  ts: number;
  right?: boolean;
  repeat?: boolean;
};

/**
 * This word so far, clues and guesses in the order they were said. It sits
 * beside the boxes rather than under them: the boxes are what is happening
 * and this is what happened, and putting both in one column was what made a
 * game where everybody types at once look like a game of turns.
 */
/** Clue, guess, and the guess that ended it. One mark per kind, used in the
 *  rows and in the tally above them so the column teaches its own key. */
const KIND_ICON = {
  clue: <FiMessageSquare />,
  guess: <FiHelpCircle />,
  right: <FiCheck />,
} as const;

export function PasswordStream({
  clues,
  guesses,
  names,
  className = "",
}: {
  clues: PasswordClue[];
  guesses: PasswordGuess[];
  names: Record<string, string>;
  className?: string;
}) {
  const lines: StreamLine[] = [
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

  return (
    <section className={`pw-stream ${className}`.trim()}>
      <div className="gk-roster-head">
        <span className="gk-roster-label">This word</span>

        {/* Two counts rather than one total. How many clues it took and how
            many guesses it cost are different facts, and the second one is
            the one that decides what the word is worth. */}
        <span className="pw-tally">
          <span className="pw-tally-item" data-tooltip={`${clues.length} clues given`} data-tooltip-variant="game">
            <span className="pw-tally-icon" aria-hidden="true">{KIND_ICON.clue}</span>
            {clues.length}
          </span>
          <span className="pw-tally-item pw-tally-item--guess" data-tooltip={`${guesses.length} guesses spent`} data-tooltip-variant="game">
            <span className="pw-tally-icon" aria-hidden="true">{KIND_ICON.guess}</span>
            {guesses.length}
          </span>
        </span>
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
              ].filter(Boolean).join(" ")}
            >
              {/* The check replaces the kind rather than sitting next to it.
                  A column this narrow cannot carry both, and a correct guess
                  is not really a guess any more. */}
              <span className="pw-line-kind" aria-label={line.right ? "got it" : line.kind}>
                {line.right ? KIND_ICON.right : KIND_ICON[line.kind]}
              </span>
              <span className="pw-line-text">{line.text}</span>
              <span className="pw-line-who">{getPasswordPlayerName(names, line.sessionId)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="gk-roster-empty">Nothing said yet.</p>
      )}
    </section>
  );
}

/** The words your team already took, newest first. Worth having beside the
 *  live one: it is the only place the points you earned are written down
 *  while the clock is still running. */
export function PasswordTakenList({ taken, names }: { taken: PasswordTaken[]; names: Record<string, string> }) {
  if (taken.length === 0) return null;

  const points = taken.reduce((sum, entry) => sum + entry.points, 0);

  return (
    <section className="pw-taken">
      <div className="gk-roster-head">
        <span className="gk-roster-label">Taken</span>

        <span className="pw-tally">
          <span className="pw-tally-item pw-tally-item--right" data-tooltip={`${points} points off these`} data-tooltip-variant="game">
            <span className="pw-tally-icon" aria-hidden="true"><FiAward /></span>
            {points}
          </span>
          <span className="gk-roster-count">{taken.length}</span>
        </span>
      </div>

      <div className="pw-taken-rows">
        {[...taken].reverse().map((entry) => (
          <div className="pw-taken-row" key={entry.roundId}>
            <span className="pw-taken-word">{entry.word}</span>
            <span className="pw-taken-meta">
              {getPasswordPlayerName(names, entry.guesserId)} in {entry.guessCount}
            </span>
            <span className="pw-taken-points">+{entry.points}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Where everyone else is ─────────────────────────────────── */

/**
 * The other teams, mid game. Every team is on its own word at the same time,
 * so this is a scoreboard rather than a turn order: your team open because
 * those are the people you are talking to, everyone else folded down to faces
 * and a number, which is all anybody wants from a rival while their own clock
 * is running.
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
      label="Every team, right now"
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
  /** Everyone on your team, so both lanes can show who is on them. */
  teamMembers: string[];
  guesserId: string;
  clues: PasswordClue[];
  guesses: PasswordGuess[];
  drafts?: PasswordDraft[];
  taken?: PasswordTaken[];
  names: Record<string, string>;
  sessionId: string;
  /** What is in your box. One box: you are either guessing or cluing. */
  value: string;
  skipsRemaining?: number;
  /** Given, the scoreboard goes under the round. */
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

/**
 * Says what is wrong with what you have typed, in the server's own terms, so
 * the button goes dead here instead of the round bouncing it back. Every rule
 * comes from the shared helpers rather than a second opinion.
 */
function problemWith({
  role,
  value,
  word,
  guesses,
}: {
  role: PasswordRole;
  value: string;
  word: string | null;
  guesses: PasswordGuess[];
}): string | undefined {
  const text = value.trim();
  if (!text) return undefined;
  if (!isOneWord(text)) return "One word only.";

  if (role === "guess") {
    return guesses.some((entry) => normalizeGuess(entry.text) === normalizeGuess(text))
      ? "You have said that one. It was not it."
      : undefined;
  }

  return word && isClueTooSimilar(text, word) ? "That is the word, or near enough. They will not take it." : undefined;
}

export function PasswordRound({
  role,
  word,
  category,
  teamMembers,
  guesserId,
  clues,
  guesses,
  drafts = [],
  taken = [],
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
  const cluers = teamMembers.filter((id) => id !== guesserId);
  const guessing = role === "guess";
  const wordless = role === "clue" && word === null;
  const problem = problemWith({ role, value, word, guesses });

  const lastClue = clues[clues.length - 1];
  const lastGuess = guesses[guesses.length - 1];

  /* Only ever somebody else's. Your own keystrokes are already in your box
     with a cursor in them. */
  const others = drafts.filter((draft) => draft.sessionId !== sessionId);

  const lane = {
    names,
    ...(onChange ? { onChange } : {}),
    ...(onSubmit ? { onSubmit } : {}),
    ...(onDraft ? { onDraft } : {}),
  };

  return (
    <>
      {role && (
        <PasswordWordCard
          role={role}
          word={word}
          {...(category !== undefined ? { category } : {})}
          {...(wordless ? {} : { worth: wordWorth(guesses.length) })}
          {...(onRetryWord ? { onRetry: onRetryWord } : {})}
        />
      )}

      {/* Both boxes, always, one above the other, with the record beside the
          pair. This is the whole point: your team is not taking turns and the
          page should not look like it is. Stacked rather than side by side
          because the clue and the answer to it read down the page, the way
          you would say them. */}
      <div className="pw-exchange">
        <div className="pw-lanes">
          <PasswordLane
            {...lane}
            side="clue"
            people={cluers}
            {...(role === "clue" ? { mine: true, value } : {})}
            {...(wordless ? { disabled: true } : {})}
            drafts={others.filter((draft) => draft.role === "clue")}
            {...(lastClue ? { latest: { sessionId: lastClue.sessionId, text: lastClue.text } } : {})}
            {...(role === "clue" && problem ? { problem } : {})}
          />

          <PasswordLane
            {...lane}
            side="guess"
            people={guesserId ? [guesserId] : []}
            {...(guessing ? { mine: true, value } : {})}
            drafts={others.filter((draft) => draft.role === "guess")}
            {...(lastGuess
              ? { latest: { sessionId: lastGuess.sessionId, text: lastGuess.text, ...(lastGuess.correct ? { right: true } : {}) } }
              : {})}
            {...(guessing && problem ? { problem } : {})}
          />
        </div>

        {/* Takes its height from the boxes beside it and scrolls inside. A
            word that runs long should not push the thing you are typing into
            down the page. */}
        <div className="pw-record">
          <PasswordStream clues={clues} guesses={guesses} names={names} />
          <PasswordTakenList taken={taken} names={names} />
        </div>
      </div>

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
