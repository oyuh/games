import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { FiEdit3, FiSend, FiSlash } from "react-icons/fi";
import { shadeClueProblem } from "@games/shared";
import { GameButton, GameFacts } from "../shared/GameKit";
import { PlayerAvatar } from "../shared/PlayerAvatar";
import { ShadeGrid, ShadeStage, type ShadeCell, type ShadeMarker } from "./ShadeGrid";
import "../../styles/shade-kit.css";

/**
 * The clue phase, both sides of it. One person is writing and everybody else
 * is waiting, and those are different enough screens that most games would
 * make them two components, but they are the same board with a different thing
 * under it, so they are one.
 *
 * The two rounds are the same screen too. What changes between them is what
 * the leader can see: the second time round they are looking at where everyone
 * actually went, which is the entire reason there is a second clue.
 */

/** A clue, drawn the same way everywhere it turns up from here on: written,
 *  guessed against, and read back at the reveal. */
export function ShadeClueTag({ round, text }: { round: 1 | 2; text: string }) {
  return (
    <span className="sk-clue">
      <span className="sk-clue-round">Clue {round}</span>
      <span className="sk-clue-text">{text}</span>
    </span>
  );
}

/**
 * The box the leader types into. Nothing clever: an input, how much room is
 * left, and the button.
 *
 * The button is off whenever the clue would bounce, and the reason sits under
 * it in the mutator's own words. The alternative is letting somebody press
 * send on a two word first clue and answering with a red toast, which is the
 * same information delivered as a telling off.
 */
function ShadeComposer({
  round,
  value,
  problem,
  submitting,
  onChange,
  onSubmit,
}: {
  round: 1 | 2;
  value: string;
  problem?: string | undefined;
  submitting?: boolean;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  /* The leader arrives here with nothing to do but type, so the cursor is
     already in the box. Re-armed on the round, because clue 2 is a fresh
     empty box on the same screen. */
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const timer = window.setTimeout(() => input.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [round]);

  /* Only worth saying once they have written something. A box that opens by
     telling you it is empty is not helping. */
  const shown = value.trim() ? problem : undefined;

  return (
    <div className="sk-composer-block">
      <form className={`sk-composer${shown ? " is-off" : ""}`} onSubmit={onSubmit}>
        <input
          ref={inputRef}
          className="sk-composer-input"
          value={value}
          maxLength={60}
          placeholder={round === 1 ? "One word…" : "Two words at most…"}
          aria-label={`Clue ${round}`}
          aria-invalid={!!shown}
          onChange={(event) => onChange(event.target.value)}
        />

        <span className="sk-composer-count" aria-hidden="true">{60 - value.length}</span>

        <GameButton
          type="submit"
          variant="primary"
          icon={<FiSend />}
          disabled={!!problem}
          {...(submitting ? { loading: true } : {})}
        >
          Send it
        </GameButton>
      </form>

      {shown && <p className="sk-composer-problem" role="status">{shown}</p>}
    </div>
  );
}

/** Somebody else is doing the work. A face, so it is a person waiting on a
 *  person rather than a page waiting on a phase. */
function ShadeWaitingOn({ sessionId, name, children }: { sessionId: string; name: string; children: ReactNode }) {
  return (
    /* A div rather than a p, because the avatar draws a div of its own and a
       paragraph is not allowed to hold one. */
    <div className="sk-waiting">
      <span className="sk-waiting-face">
        <PlayerAvatar seed={sessionId} />
      </span>
      <span>
        <strong>{name}</strong> {children}
      </span>
    </div>
  );
}

export interface ShadeClueProps {
  /** Which of the two clues is being written. */
  round: 1 | 2;
  grid: { rows: number; cols: number; seed: number };
  /** You are the one writing it. */
  isLeader: boolean;
  leader: { sessionId: string; name: string };
  /**
   * The color. Only ever passed to somebody allowed to see it, which is the
   * leader and anyone spectating. Handing it to a guesser and hiding it in the
   * markup is not hiding it.
   */
  target?: ShadeCell | null;
  /** What was said the first time, once there is a first time. */
  clue1?: string | null;
  /**
   * Where the room went after clue 1, for the leader writing clue 2. This is
   * the whole point of the second clue: you find out you said "ocean" and
   * three people went to the greens.
   */
  guesses?: ShadeMarker[];
  hardMode?: boolean;
  /** Controlled, so the page keeps the draft across a re-render. */
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  /** Holds the button while the mutator is in the air. */
  submitting?: boolean;
}

export function ShadeClue({
  round,
  grid,
  isLeader,
  leader,
  target,
  clue1,
  guesses,
  hardMode,
  value,
  onChange,
  onSubmit,
  submitting,
}: ShadeClueProps) {
  /* Everyone gets the same board. The difference is that the leader's has the
     color on it, and on the second round the faces of everyone who has already
     guessed wrong about it. */
  const marks = isLeader && round === 2 ? guesses : undefined;

  return (
    <ShadeStage
      foot={
        <>
          {clue1 && <ShadeClueTag round={1} text={clue1} />}

          {isLeader ? (
            <>
              <p className="sk-stage-hint">
                {round === 1
                  ? "That ring is your color. Give them one word that points at it."
                  : marks?.length
                    ? "That is where they went on your first clue. Two words this time, to pull them in."
                    : "Nobody landed near it. Two words this time, and you can go at it from somewhere else."}
              </p>

              {hardMode && (
                <GameFacts
                  facts={[{
                    value: "No color names",
                    icon: <FiSlash />,
                    tone: "var(--game-accent)",
                    tooltip: "Red, blue, teal, rust and the rest are all out. The clue has to come at it sideways",
                  }]}
                />
              )}

              <ShadeComposer
                round={round}
                value={value}
                problem={shadeClueProblem(round, value, hardMode)}
                {...(submitting ? { submitting: true } : {})}
                onChange={onChange}
                onSubmit={onSubmit}
              />
            </>
          ) : (
            <>
              <ShadeWaitingOn sessionId={leader.sessionId} name={leader.name}>
                {round === 1 ? "is looking for one word." : "is going again, up to two words."}
              </ShadeWaitingOn>

              <p className="sk-stage-hint">
                {round === 1
                  ? "They can see the color. You cannot, so there is nothing to do but wait for it."
                  : "You get one more move once this lands, so it is worth having a second favorite."}
              </p>
            </>
          )}
        </>
      }
    >
      <ShadeGrid
        {...grid}
        {...(isLeader && target ? { target, zones: true } : {})}
        {...(marks?.length ? { markers: marks } : {})}
      />
    </ShadeStage>
  );
}

/**
 * The step before the clue, when the host turned leader picking on: the leader
 * choosing the color they then have to describe. Same board, same confirm
 * shape as everything else, so it is a few lines rather than a screen.
 */
export function ShadePick({
  grid,
  isLeader,
  leader,
  picked,
  onPick,
  onConfirm,
  submitting,
}: {
  grid: { rows: number; cols: number; seed: number };
  isLeader: boolean;
  leader: { sessionId: string; name: string };
  picked: ShadeCell | null;
  onPick: (cell: ShadeCell) => void;
  onConfirm: () => void;
  submitting?: boolean;
}) {
  return (
    <ShadeStage
      foot={
        isLeader ? (
          <>
            <p className="sk-stage-hint">
              {picked
                ? "That one. You will be describing it in a word, so it is worth picking one you can."
                : "Pick the color you want everyone hunting for. Press a cell to take it."}
            </p>

            <GameButton
              variant="primary"
              icon={<FiEdit3 />}
              disabled={!picked}
              {...(submitting ? { loading: true } : {})}
              onClick={onConfirm}
            >
              {picked ? "Lock it in and start writing" : "Pick one first"}
            </GameButton>
          </>
        ) : (
          <>
            <ShadeWaitingOn sessionId={leader.sessionId} name={leader.name}>
              is choosing a color.
            </ShadeWaitingOn>

            <p className="sk-stage-hint">Once they have one, they get a word to describe it with.</p>
          </>
        )
      }
    >
      <ShadeGrid
        {...grid}
        {...(isLeader ? { selected: picked, onSelect: onPick } : {})}
      />
    </ShadeStage>
  );
}
