import { FiAward, FiChevronRight, FiHome, FiPower, FiRotateCcw } from "react-icons/fi";
import { GameActions, GameButton } from "../shared/GameKit";
import { GameVersus } from "../shared/GameRoster";
import type { PlayerCardProps } from "../shared/PlayerCard";
import { ChainBoard, type ChainLink, type ChainSide } from "./ChainRound";
import "../../styles/chain-kit.css";

/**
 * The end of the duel: who took it, and every chain either of you was handed
 * on the way there.
 *
 * The history is the point of this screen. Nobody argues about the score, they
 * argue about the word they had three letters of when the round ended, so both
 * chains from every round are here in full, drawn as the same links they were
 * played on. That is far too much for one page at once, so a round folds down
 * to its headline and opens to both boards.
 *
 * Folded, a round still answers what you would ask of it: which one it was,
 * who took it, and by how much. Opening it adds the words. The fold hides the
 * detail, never the answer.
 */

/** One round, exactly as the game row records it. */
export interface ChainRoundHistory {
  round: number;
  /** Session id to the chain that player was solving. */
  chains: Record<string, Array<{ word: string; solvedBy: string | null; lettersShown: number }>>;
  scores: Record<string, number>;
}

/**
 * A finished chain has nothing hidden left in it: the round only ends once
 * both boards are fully turned over. So history reads straight onto the same
 * links the round was played on, and every tag on them still means what it
 * meant at the time.
 */
export function historyLinks(chain: ChainRoundHistory["chains"][string] = []): ChainLink[] {
  return chain.map((link) => ({
    word: link.word,
    revealed: true,
    lettersShown: link.lettersShown,
    solvedBy: link.solvedBy,
  }));
}

export interface ChainGameOverProps {
  you: ChainSide;
  them: ChainSide;
  /** Every round played, in the order they were played. */
  rounds: ChainRoundHistory[];
  names?: Record<string, string>;
  isHost?: boolean;
  onPlayAgain: () => void;
  onEnd: () => void;
  onHome: () => void;
}

export function ChainGameOver({
  you,
  them,
  rounds,
  names = {},
  isHost,
  onPlayAgain,
  onEnd,
  onHome,
}: ChainGameOverProps) {
  /* Nobody wins on nothing. A duel that ended before either of them scored has
     no winner rather than a tie worth reporting. */
  const level = you.score === them.score;
  const nothing = level && you.score === 0;
  const won = you.score > them.score;
  const winner = won ? you : them;

  const card = (side: ChainSide, mine: boolean): PlayerCardProps => ({
    sessionId: side.sessionId,
    name: side.name,
    points: side.score,
    pointsSuffix: "pts",
    ...(mine ? { you: true } : {}),
    ...(nothing
      ? {}
      : level
        ? { caption: "Level" }
        : side.sessionId === winner.sessionId
          ? { state: "success" as const, caption: "Took the duel" }
          : {}),
  });

  return (
    <div className="cr-over">
      {/* The accent is the game's green, and green is what a cracked word has
          meant all the way through. So it only lands here when the duel came
          your way: level, lost, and nothing at all are all quiet. */}
      <section className={`cr-verdict${nothing || level || !won ? " cr-verdict--quiet" : ""}`}>
        <p className="cr-verdict-kicker">
          {nothing ? "nothing happened" : level ? "it ended level" : "the duel goes to"}
        </p>

        <p className="cr-verdict-name">
          {nothing ? "no one" : level ? `${you.name} and ${them.name}` : winner.name}
        </p>

        <p className="cr-verdict-line">
          <span className="cr-verdict-icon" aria-hidden="true"><FiAward /></span>
          {nothing ? (
            <>not a word between them</>
          ) : (
            <>
              <strong>{Math.max(you.score, them.score)}</strong>
              <span className="cr-verdict-dash">–</span>
              <strong>{Math.min(you.score, them.score)}</strong>
              , off <strong>{rounds.length}</strong> {rounds.length === 1 ? "round" : "rounds"}
            </>
          )}
        </p>
      </section>

      <GameVersus label="Final" players={[card(you, true), card(them, false)]} />

      <section className="cr-history">
        <div className="gk-roster-head">
          <span className="gk-roster-label">Every round</span>
          <span className="gk-roster-count">{rounds.length}</span>
        </div>

        {rounds.length === 0 ? (
          <p className="gk-roster-empty">It ended before either of you finished one.</p>
        ) : (
          [...rounds].reverse().map((entry, i) => {
            const yours = entry.scores[you.sessionId] ?? 0;
            const theirs = entry.scores[them.sessionId] ?? 0;
            const tookIt = yours === theirs ? null : yours > theirs ? you : them;

            return (
              /* Native details, so the fold is keyboard and screen reader
                 friendly without a line of state. The last round opens itself,
                 since it is the one that just ended the duel. */
              <details key={entry.round} className="cr-past" {...(i === 0 ? { open: true } : {})}>
                <summary className="cr-past-head">
                  <span className="cr-past-chevron" aria-hidden="true"><FiChevronRight /></span>
                  <span className="cr-past-round">Round {entry.round}</span>

                  <span className="cr-past-who">
                    {tookIt ? <><strong>{tookIt.name}</strong> took it</> : "level"}
                  </span>

                  <span className="cr-past-score">
                    <strong className={yours >= theirs ? "is-top" : ""}>{yours}</strong>
                    <span className="cr-past-dash">–</span>
                    <strong className={theirs >= yours ? "is-top" : ""}>{theirs}</strong>
                  </span>
                </summary>

                <div className="cr-past-body">
                  {/* Both boards, side by side, drawn as the links they were
                      played on. Which words each of you was actually handed is
                      most of what there is to argue about afterwards. */}
                  <ChainBoard links={historyLinks(entry.chains[you.sessionId])} mine title="Your chain" names={names} />
                  <ChainBoard links={historyLinks(entry.chains[them.sessionId])} title={`${them.name}'s chain`} names={names} />
                </div>
              </details>
            );
          })
        )}
      </section>

      <GameActions>
        {isHost ? (
          <>
            <GameButton variant="primary" icon={<FiRotateCcw />} onClick={onPlayAgain}>Run it back</GameButton>
            <GameButton variant="danger" icon={<FiPower />} onClick={onEnd}>End the game</GameButton>
          </>
        ) : (
          <GameButton variant="secondary" icon={<FiHome />} onClick={onHome}>Back home</GameButton>
        )}
      </GameActions>
    </div>
  );
}
