import { FiCheck, FiCornerUpLeft, FiCrosshair, FiEdit2 } from "react-icons/fi";
import { GameButton } from "../shared/GameKit";
import { generateGridColor } from "./ColorGrid";
import { ShadeClueTag } from "./ShadeClue";
import { ShadeGrid, ShadeStage, type ShadeCell, type ShadeMarker } from "./ShadeGrid";
import "../../styles/shade-kit.css";

/**
 * The phase where picking a cell costs something. Same board again, and the
 * only genuinely new idea in it is that a pick has two states: the one you are
 * holding and the one you have handed over. Those look different and they undo
 * differently, and getting that wrong is how somebody ends up thinking they
 * locked in when they did not.
 *
 * Second time round you are moving a guess rather than making one, so the
 * board carries where you already were and staying put is a button rather
 * than a thing you have to find again.
 */

/**
 * The color you are pointing at, big enough to actually look at. A cell is one
 * of a hundred and twenty small squares, and the whole game is deciding
 * whether that particular square is the one, which is not a call anybody can
 * make off something that size.
 */
function ShadePick({
  grid,
  cell,
  locked,
}: {
  grid: { rows: number; cols: number; seed: number };
  cell: ShadeCell;
  locked?: boolean;
}) {
  return (
    <span className={`sk-pick${locked ? " is-locked" : ""}`}>
      <span
        className="sk-pick-swatch"
        style={{ background: generateGridColor(cell.row, cell.col, grid.rows, grid.cols, grid.seed) }}
      />
      <span className="sk-pick-label">
        {locked && <FiCheck aria-hidden="true" />}
        {locked ? "Locked in" : "Your pick"}
      </span>
    </span>
  );
}

/**
 * How many are in, as one dot each. A count on its own is a number you have to
 * read; the dots you can take in without stopping, which matters on a screen
 * with a clock running down the top of it.
 */
function ShadeTally({ locked, total }: { locked: number; total: number }) {
  return (
    <span className="sk-tally">
      <span className="sk-tally-dots" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <i key={i} className={i < locked ? "is-in" : ""} />
        ))}
      </span>
      <span className="sk-tally-text">{locked} of {total} locked in</span>
    </span>
  );
}

export interface ShadeGuessProps {
  /** Which guess this is. The second one is a move, not a fresh pick. */
  round: 1 | 2;
  grid: { rows: number; cols: number; seed: number };
  /** The leader, and anybody who wandered in, watch rather than guess. */
  isGuessing: boolean;
  clue1?: string | null;
  clue2?: string | null;
  /**
   * Only ever passed to somebody allowed to see it, which during a guess is
   * the leader alone. Everyone else is not sent the answer to the thing they
   * are being asked.
   */
  target?: ShadeCell | null;
  /** What you are holding. Not handed over until the button. */
  selected: ShadeCell | null;
  onSelect: (cell: ShadeCell) => void;
  /** Handed over. The board stops taking presses until you move it back. */
  locked?: boolean;
  onLock: () => void;
  /** Puts it back in your hand so the board takes presses again. */
  onUnlock: () => void;
  /** Round 2 only: where you went last time. */
  previous?: ShadeCell | null;
  /** Round 2 only. Locks the previous spot without hunting for it again. */
  onKeep?: () => void;
  /** Holds the buttons while the mutator is in the air. */
  submitting?: boolean;
  lockedCount: number;
  guesserCount: number;
}

export function ShadeGuess({
  round,
  grid,
  isGuessing,
  clue1,
  clue2,
  target,
  selected,
  onSelect,
  locked,
  onLock,
  onUnlock,
  previous,
  onKeep,
  submitting,
  lockedCount,
  guesserCount,
}: ShadeGuessProps) {
  /* Where you were on the first clue, as your own face on the board. It is
     the thing the second clue is asking you to reconsider, so it stays in
     front of you rather than being something you have to remember. Dropped
     once you have moved off it, since then it is just clutter. */
  const anchor: ShadeMarker[] =
    round === 2 && previous && !(selected?.row === previous.row && selected?.col === previous.col)
      ? [{ sessionId: "shade-your-first", name: "Where you went on clue 1", row: previous.row, col: previous.col, you: true }]
      : [];

  return (
    <ShadeStage
      rail
      foot={
        <>
          {(clue1 || clue2) && (
            <span className="sk-clues">
              {clue1 && <ShadeClueTag round={1} text={clue1} />}
              {clue2 && <ShadeClueTag round={2} text={clue2} />}
            </span>
          )}

          {isGuessing ? (
            <>
              {selected && <ShadePick grid={grid} cell={selected} {...(locked ? { locked: true } : {})} />}

              <p className="sk-stage-hint">
                {locked
                  ? round === 1
                    ? "That is your first guess. There is a second clue coming, and you can move after it."
                    : "That is where you are finishing. Nothing else to do but watch the rest come in."
                  : selected
                    ? "Lock it in before the clock runs out, or keep looking."
                    : round === 2
                      ? "One more move. Stay where you were, or take the second clue somewhere else."
                      : "Press the cell you think they mean. Close still pays, so a good guess beats no guess."}
              </p>

              <div className="sk-controls">
                {locked ? (
                  <GameButton variant="secondary" icon={<FiEdit2 />} onClick={onUnlock}>
                    Move it
                  </GameButton>
                ) : (
                  <>
                    <GameButton
                      variant="primary"
                      icon={<FiCrosshair />}
                      disabled={!selected}
                      {...(submitting ? { loading: true } : {})}
                      onClick={onLock}
                    >
                      Lock it in
                    </GameButton>

                    {/* Only worth offering while it would actually change
                        something. Once you are stood on it, staying put is
                        the ordinary lock button. */}
                    {round === 2 && previous && onKeep && anchor.length > 0 && (
                      <GameButton variant="ghost" icon={<FiCornerUpLeft />} onClick={onKeep}>
                        Keep my first spot
                      </GameButton>
                    )}
                  </>
                )}
              </div>
            </>
          ) : (
            <p className="sk-stage-hint">
              {target
                ? "They are hunting for it. You can see how close they are getting."
                : "The room is guessing. You are watching this one out."}
            </p>
          )}

          <ShadeTally locked={lockedCount} total={guesserCount} />
        </>
      }
    >
      <ShadeGrid
        {...grid}
        {...(target ? { target, zones: true } : {})}
        {...(selected ? { selected } : {})}
        {...(anchor.length ? { markers: anchor } : {})}
        /* Locked, the board is a picture of your answer. Taking presses
           while the answer is already in would mean pressing a cell and
           nothing happening, which reads as broken rather than as final. */
        {...(isGuessing && !locked ? { onSelect } : {})}
      />
    </ShadeStage>
  );
}
