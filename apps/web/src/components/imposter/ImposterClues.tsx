import { useEffect, useRef, type FormEvent } from "react";
import { FiCheck, FiEye, FiEyeOff, FiSend } from "react-icons/fi";
import { DEFAULT_IMPOSTER_CLUE_VISIBILITY, imposterCategoryLabels } from "@games/shared";
import { GameButton } from "../shared/GameKit";
import { PlayerAvatar } from "../shared/PlayerAvatar";
import { getDisplayName } from "../../lib/session";
import type { ImposterPlayer } from "./ImposterLobby";
import "../../styles/imposter.css";

/**
 * The clue phase, which is the game. Everything else is setup and arguing
 * about the result.
 *
 * Three things stacked: what you know, what you are going to say, and what the
 * room is doing. The room is one surface rather than a roster plus a list of
 * clues, because during this phase a player and their clue are the same
 * object, and watching that object fill in is the whole tension.
 */

/** Shows one contiguous chunk of each word, which is what the imposter's
 *  peek setting buys them. Long enough to steal a register from, short
 *  enough that they still have to guess. */
export function redactClue(text: string, visibility = DEFAULT_IMPOSTER_CLUE_VISIBILITY): string {
  const clamped = Number.isFinite(visibility)
    ? Math.min(1, Math.max(0, visibility))
    : DEFAULT_IMPOSTER_CLUE_VISIBILITY;

  if (clamped >= 1) return text;

  return text.split(" ").map((word) => {
    const len = word.length;
    if (clamped <= 0 || len <= 2) return "_".repeat(len);
    const showCount = Math.max(1, Math.floor(len * clamped));
    /* A deterministic offset, so the same clue never redacts two ways and
       nobody can re-roll it by refreshing. */
    const start = Math.min(Math.floor(len * 0.2), len - showCount);
    return word.split("").map((ch, i) => (i >= start && i < start + showCount ? ch : "_")).join("");
  }).join(" ");
}

/* ── What you know ──────────────────────────────────────────── */

export function ImposterWordCard({
  role,
  secretWord,
  category,
}: {
  role: "imposter" | "player" | undefined;
  secretWord: string | null;
  category?: string | null;
}) {
  const isImposter = role === "imposter";
  const bank = category ? (imposterCategoryLabels[category] ?? category) : null;

  return (
    <section className={`imp-word${isImposter ? " imp-word--imposter" : ""}`}>
      <p className="imp-word-role">
        <span className="imp-word-role-icon" aria-hidden="true">{isImposter ? <FiEyeOff /> : <FiEye />}</span>
        {isImposter ? "You are the imposter" : "Your word"}
      </p>

      {/* A fixed run of blocks, not one per letter. The length of the word is
          the one thing the imposter would love to be told. */}
      <p className="imp-word-value" {...(isImposter ? { "aria-label": "You do not get the word" } : {})}>
        {isImposter ? <span className="imp-word-blanks" aria-hidden="true">?????</span> : (secretWord ?? "••••")}
      </p>

      <p className="imp-word-hint">
        {isImposter
          ? bank
            ? <>It is something from <strong>{bank}</strong>. Write a clue that sounds like you know which.</>
            : <>Write a clue that sounds like you know the word.</>
          : bank
            ? <>From <strong>{bank}</strong>. Everyone else has this word too, except one of you.</>
            : <>Everyone else has this word too, except one of you.</>}
      </p>
    </section>
  );
}

/* ── What you are going to say ──────────────────────────────── */

export function ImposterComposer({
  role,
  value,
  submitted,
  maxLength = 80,
  onChange,
  onSubmit,
  onTyping,
}: {
  role: "imposter" | "player" | undefined;
  value: string;
  submitted: boolean;
  maxLength?: number;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  /** Fired once, on the first character, and never again this phase. The room
   *  only ever learns that you started, never that you stopped and started
   *  again, which is exactly the tell the imposter would give away. */
  onTyping?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const announced = useRef(false);

  useEffect(() => {
    if (submitted) return;
    const input = inputRef.current;
    if (!input) return;
    const timer = window.setTimeout(() => input.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [role, submitted]);

  if (submitted) {
    return (
      <div className="imp-composer imp-composer--done">
        <span className="imp-composer-done-mark" aria-hidden="true"><FiCheck /></span>
        <p className="imp-composer-done-clue">{value}</p>
        <p className="imp-composer-done-note">That is your clue. No taking it back.</p>
      </div>
    );
  }

  return (
    <form className="imp-composer" onSubmit={onSubmit}>
      <input
        ref={inputRef}
        className="imp-composer-input"
        value={value}
        maxLength={maxLength}
        placeholder={role === "imposter" ? "Say something that could be about anything…" : "One clue about your word…"}
        aria-label="Your clue"
        onChange={(event) => {
          if (!announced.current && event.target.value.trim()) {
            announced.current = true;
            onTyping?.();
          }
          onChange(event.target.value);
        }}
      />

      <span className="imp-composer-count" aria-hidden="true">{maxLength - value.length}</span>

      <GameButton type="submit" variant="primary" icon={<FiSend />} disabled={!value.trim()}>
        Lock it in
      </GameButton>
    </form>
  );
}

/* ── What the room is doing ─────────────────────────────────── */

export interface ImposterClue {
  sessionId: string;
  text: string;
}

export interface ImposterClueWallProps {
  players: ImposterPlayer[];
  clues: ImposterClue[];
  sessionId: string;
  sessionById?: Record<string, string>;
  /** Session ids that have started writing. Sticky for the phase: someone who
   *  types a letter and deletes it stays "writing", so hesitating never
   *  shows. */
  typing?: string[];
  /** Only the imposter reads anything, and only as much as the host allowed. */
  isImposter?: boolean;
  clueVisibility?: number;
}

/**
 * Every player and their clue slot. The slots fill in one at a time as people
 * lock in, which is the only live thing on the page and so gets to be the
 * loud one.
 */
export function ImposterClueWall({
  players,
  clues,
  sessionId,
  sessionById = {},
  typing = [],
  isImposter,
  clueVisibility,
}: ImposterClueWallProps) {
  const byId = new Map(clues.map((c) => [c.sessionId, c.text]));
  const peeking = Boolean(isImposter) && clueVisibility !== 0;

  return (
    <section className="imp-wall">
      <div className="gk-roster-head">
        <span className="gk-roster-label">Clues</span>
        <span className="gk-roster-count">{clues.length}/{players.length}</span>
      </div>

      <div className="imp-wall-rows">
        {players.map((player) => {
          const mine = player.sessionId === sessionId;
          const text = byId.get(player.sessionId);
          const name = sessionById[player.sessionId] ?? getDisplayName(player.name, player.sessionId);
          const writing = !text && typing.includes(player.sessionId);

          return (
            <div
              key={player.sessionId}
              className={`imp-row${text ? " imp-row--in" : ""}${mine ? " imp-row--mine" : ""}`}
            >
              <span className="imp-row-face">
                <PlayerAvatar seed={player.sessionId} />
              </span>

              <span className="imp-row-name">
                {name}
                {mine && <span className="imp-row-you">you</span>}
              </span>

              {/* Three slots, in order of how much they give away: nothing,
                  that they started, and the clue itself. */}
              {text ? (
                mine || peeking ? (
                  <span className={`imp-slot imp-slot--text${mine ? "" : " imp-slot--redacted"}`}>
                    {mine ? text : redactClue(text, clueVisibility)}
                  </span>
                ) : (
                  <span className="imp-slot imp-slot--locked">
                    <FiCheck aria-hidden="true" /> locked in
                  </span>
                )
              ) : writing ? (
                <span className="imp-slot imp-slot--writing">
                  writing
                  <span className="imp-dots" aria-hidden="true"><i /><i /><i /></span>
                </span>
              ) : (
                /* Telling yourself you are thinking, with the box you are
                   thinking into directly above, is not news. */
                <span className="imp-slot imp-slot--empty">{mine ? "up to you" : "thinking"}</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ── The phase ──────────────────────────────────────────────── */

export interface ImposterCluePhaseProps extends Omit<ImposterClueWallProps, "isImposter"> {
  role: "imposter" | "player" | undefined;
  secretWord: string | null;
  category?: string | null;
  clue: string;
  submitted: boolean;
  /** Off for a spectator or anyone already voted out: they get the room and
   *  the countdown, but no word and no box. */
  canWrite?: boolean;
  maxLength?: number;
  onClueChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onTyping?: () => void;
}

export function ImposterCluePhase({
  role,
  secretWord,
  category,
  clue,
  submitted,
  canWrite = true,
  maxLength,
  onClueChange,
  onSubmit,
  onTyping,
  ...wall
}: ImposterCluePhaseProps) {
  return (
    <>
      {canWrite && <ImposterWordCard role={role} secretWord={secretWord} category={category} />}

      {canWrite && (
        <ImposterComposer
          role={role}
          value={clue}
          submitted={submitted}
          {...(maxLength ? { maxLength } : {})}
          onChange={onClueChange}
          onSubmit={onSubmit}
          {...(onTyping ? { onTyping } : {})}
        />
      )}

      <ImposterClueWall {...wall} {...(role === "imposter" ? { isImposter: true } : {})} />
    </>
  );
}
