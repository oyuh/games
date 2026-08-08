import { useId } from "react";
import { FiCheck } from "react-icons/fi";
import { GameButton } from "../shared/GameKit";
import { getDisplayName } from "../../lib/session";
import { ImposterFace, type ImposterClue } from "./ImposterClues";
import type { ImposterPlayer } from "./ImposterLobby";
import "../../styles/imposter.css";

/**
 * The vote, which is an argument people have out loud while looking at this.
 * So the job here is to leave nobody wondering what a click did.
 *
 * It is the clue list again, same rows in the same order, now with a radio on
 * each one. You are voting on what somebody said, so what they said is on the
 * thing you press rather than in a separate recap you have to hold in your
 * head. The old version had the clues in one list and the names in another,
 * which meant reading both and matching them up yourself.
 *
 * Three rules do all the explaining, and they are written on the page rather
 * than left to be discovered:
 *   - one vote each
 *   - you can change it right up until the last one lands
 *   - the most votes goes, and their role comes out
 */

export interface ImposterVotePhaseProps {
  players: ImposterPlayer[];
  clues: ImposterClue[];
  sessionId: string;
  sessionById?: Record<string, string>;
  /** Who has cast a vote. Never who for. That is the whole game. */
  voted?: string[];
  /** Your pick, before you commit it. */
  voteTarget: string;
  /** What the server already has from you, if anything. */
  submittedTarget?: string | null;
  /** Off for a spectator or anyone already out: they read the room, and the
   *  ballot goes quiet rather than teasing them with a button. */
  canVote?: boolean;
  onVoteTargetChange: (sessionId: string) => void;
  onSubmit: () => void;
}

export function ImposterVotePhase({
  players,
  clues,
  sessionId,
  sessionById = {},
  voted = [],
  voteTarget,
  submittedTarget,
  canVote = true,
  onVoteTargetChange,
  onSubmit,
}: ImposterVotePhaseProps) {
  /* Radios with the same name are one group, document wide. Without this,
     two ballots on a page quietly fight over which one is checked. */
  const group = useId();
  const clueById = new Map(clues.map((c) => [c.sessionId, c.text]));
  const nameOf = (player: ImposterPlayer) =>
    sessionById[player.sessionId] ?? getDisplayName(player.name, player.sessionId);

  const picked = players.find((p) => p.sessionId === voteTarget);
  const cast = Boolean(submittedTarget);
  const changed = Boolean(voteTarget) && voteTarget !== submittedTarget;

  return (
    <section className="imp-vote">
      <div className="gk-roster-head">
        <span className="gk-roster-label">Who is the imposter?</span>
        <span className="gk-roster-count">{voted.length}/{players.length}</span>
      </div>

      <p className="imp-vote-rules">
        One vote each, and you can change it right up until the last one lands. Whoever
        ends up with the most is out, and everyone finds out what they were.
      </p>

      {/* Real radios, hidden. Arrow keys, screen readers and "pick exactly
          one" all come free, and none of it has to be re-implemented. */}
      <div className="imp-vote-rows" {...(canVote ? { role: "radiogroup", "aria-label": "Your vote" } : {})}>
        {players.map((player) => {
          const mine = player.sessionId === sessionId;
          const name = nameOf(player);
          const clue = clueById.get(player.sessionId);
          const hasVoted = voted.includes(player.sessionId);
          const isPick = voteTarget === player.sessionId;
          const isCast = submittedTarget === player.sessionId;

          const inside = (
            <>
              {canVote && (
                <span className={`imp-ballot-mark${isCast ? " imp-ballot-mark--cast" : ""}`} aria-hidden="true">
                  {isCast ? <FiCheck /> : null}
                </span>
              )}

              <ImposterFace sessionId={player.sessionId} name={name} you={mine} />

              {clue
                ? <span className="imp-vote-clue">&ldquo;{clue}&rdquo;</span>
                : <span className="imp-vote-clue imp-vote-clue--none">never said anything</span>}

              <span className="imp-vote-status">
                {mine && canVote
                  ? "not yourself"
                  : hasVoted
                    ? <><FiCheck aria-hidden="true" /> voted</>
                    : "deciding"}
              </span>
            </>
          );

          const classes = [
            "imp-row",
            "imp-ballot",
            isPick ? "imp-ballot--picked" : "",
            isCast ? "imp-ballot--cast" : "",
            mine ? "imp-ballot--self" : "",
          ].filter(Boolean).join(" ");

          /* You cannot vote for yourself, so your row is not a control. It
             stays in the list because your clue is part of what everyone
             else is reading. */
          if (mine || !canVote) return <div key={player.sessionId} className={classes}>{inside}</div>;

          return (
            <label key={player.sessionId} className={classes}>
              <input
                type="radio"
                className="sr-only"
                name={group}
                value={player.sessionId}
                checked={isPick}
                onChange={() => onVoteTargetChange(player.sessionId)}
              />
              {inside}
            </label>
          );
        })}
      </div>

      {canVote && (
        <div className="imp-vote-foot">
          {changed ? (
            <GameButton variant="primary" size="lg" full onClick={onSubmit}>
              {cast ? `Change my vote to ${picked ? nameOf(picked) : "them"}` : `Vote for ${picked ? nameOf(picked) : "them"}`}
            </GameButton>
          ) : cast ? (
            <p className="imp-vote-note">
              <span className="imp-vote-note-mark" aria-hidden="true"><FiCheck /></span>
              Your vote is in. Pick someone else if you change your mind.
            </p>
          ) : (
            <GameButton variant="primary" size="lg" full disabled>
              Pick someone first
            </GameButton>
          )}
        </div>
      )}
    </section>
  );
}
