import { useState, type FormEvent, type ReactNode, type Ref } from "react";
import { FiCheck, FiClock, FiEye, FiHelpCircle, FiLock, FiSend, FiX } from "react-icons/fi";
import { chainCategoryLabels, scoreForLetters } from "@games/shared";
import { GameActions, GameButton, GameEmpty, GamePanel, useArmed } from "../shared/GameKit";
import { GameVersus } from "../shared/GameRoster";
import type { PlayerCardProps } from "../shared/PlayerCard";
import { ChainGuessField } from "./ChainGuessField";
import "../../styles/chain-kit.css";

/**
 * The middle of a Chain Reaction duel, out of the shared kit.
 *
 * What the old page had right, and this keeps: the chain reads down the page
 * as a chain, both ends given away, and you can flip to your opponent's board
 * and watch them typing into it. Those are the game.
 *
 * What changes is everything doing the drawing. The scoreboard was a pair of
 * hand rolled cards; it is GameVersus now, so the two of you look the same
 * here as you did in the lobby and the score is the card's own score line. The
 * links keep their shape and lose the glows: state is a border and a fill, and
 * the accent means one thing, which here is a word you cracked.
 *
 * The one thing added rather than moved: a word is worth three points, then
 * two, then one as letters come off it, and the old page never said so
 * anywhere. Every hidden link carries what it is still worth, off the server's
 * own scorer, so burning a letter has a number attached to it.
 */

/** The slot shape the game row already carries. */
export type ChainLink = {
  word: string;
  revealed: boolean;
  lettersShown: number;
  solvedBy?: string | null;
};

/** Somebody mid-keystroke on a board you are watching. Never persisted. */
export type ChainDraft = { wordIndex: number; text: string };

/** One of the two, and what they have scored. All the end screen needs. */
export interface ChainSide {
  sessionId: string;
  name: string;
  score: number;
}

/** One side of the duel, as the scoreboard needs it mid round. */
export interface ChainDuelist extends ChainSide {
  /** Hidden words cracked, and how many there were. The two given ends are in
   *  neither number: nobody solved those. */
  progress: number;
  total: number;
  done?: boolean;
}

/** The ends of a chain are given away at the start. They are the only reason
 *  the middle is guessable, so they are never a link you can work on. */
export function isGivenEnd(index: number, length: number) {
  return index === 0 || index === length - 1;
}

/* ── The scoreboard ─────────────────────────────────────────── */

/**
 * The two of you, facing each other, exactly as in the lobby. Pressing a card
 * switches which board is on screen, which is the old page's one genuinely
 * good idea: when you have finished yours there is nothing to do but watch
 * them finish theirs.
 */
export function ChainScoreboard({
  you,
  them,
  viewing,
  onView,
}: {
  you: ChainDuelist;
  them: ChainDuelist;
  /** Whose board is on screen. */
  viewing?: string;
  onView?: (sessionId: string) => void;
}) {
  const card = (player: ChainDuelist, mine: boolean): PlayerCardProps => ({
    sessionId: player.sessionId,
    name: player.name,
    points: player.score,
    pointsSuffix: "pts",
    caption: player.done ? "Chain finished" : `${player.progress} of ${player.total} cracked`,
    ...(mine ? { you: true } : {}),
    ...(player.done ? { state: "success" as const } : {}),
    /* The ring is which board you are reading, not who is winning. */
    ...(viewing === player.sessionId ? { selected: true } : {}),
    ...(onView ? { onClick: () => onView(player.sessionId), tooltip: mine ? "Back to your chain" : `Watch ${player.name}` } : {}),
  });

  return <GameVersus label="The duel" players={[card(you, true), card(them, false)]} />;
}

/* ── One link ───────────────────────────────────────────────── */

/**
 * Throwing a word away cannot be taken back and it costs you the points, so it
 * takes two presses. Same arming the kick button uses, since it is the same
 * question being asked.
 */
function SkipButton({ onSkip }: { onSkip: () => void }) {
  const { armed, press, disarm } = useArmed();

  return (
    <button
      type="button"
      className={`cr-link-btn${armed ? " cr-link-btn--armed" : ""}`}
      aria-label={armed ? "Confirm giving up on this word" : "Give up on this word"}
      data-tooltip={armed ? "Press again to give it up" : "Give up on this word"}
      data-tooltip-variant={armed ? "danger" : "game"}
      onClick={() => { if (press()) onSkip(); }}
      onBlur={disarm}
    >
      {armed ? <FiCheck /> : <FiX />}
    </button>
  );
}

interface ChainLinkRowProps {
  link: ChainLink;
  index: number;
  length: number;
  /** Your own board. Theirs is read only however far along it is. */
  mine?: boolean;
  editing?: boolean;
  guess?: string;
  draft?: string;
  /** Shown on a cracked link that is not yours to claim. */
  solverName?: string;
  onSelect?: () => void;
  onChange?: (value: string) => void;
  onGuess?: () => void;
  onNavigate?: (delta: 1 | -1) => void;
  onCancel?: () => void;
  onHint?: () => void;
  onSkip?: () => void;
}

function ChainLinkRow({
  link,
  index,
  length,
  mine,
  editing,
  guess = "",
  draft,
  solverName,
  onSelect,
  onChange,
  onGuess,
  onNavigate,
  onCancel,
  onHint,
  onSkip,
}: ChainLinkRowProps) {
  const given = isGivenEnd(index, length);
  const cracked = link.revealed && !!link.solvedBy;
  const skipped = link.revealed && !link.solvedBy && !given;
  const open = !link.revealed;
  /* Every letter is already out, so the hint button has nothing left to give.
     Same ceiling the mutator enforces. */
  const spent = link.lettersShown >= link.word.length - 1;

  const state = editing ? "now" : cracked ? "cracked" : skipped ? "skipped" : given ? "given" : "open";
  const canPress = !!onSelect && open && !editing;

  const body = editing ? (
    <ChainGuessField
      word={link.word}
      lettersShown={link.lettersShown}
      value={guess}
      {...(onChange ? { onChange } : {})}
      {...(onGuess ? { onSubmit: onGuess } : {})}
      {...(onNavigate ? { onNavigate } : {})}
      {...(onCancel ? { onCancel } : {})}
    />
  ) : link.revealed ? (
    <span className="cr-link-word">{link.word}</span>
  ) : (
    /* The same masked field, read only. The letters line up whether it is the
       word you are typing into or the one they are. */
    <ChainGuessField
      word={link.word}
      lettersShown={link.lettersShown}
      value={draft ?? ""}
      readOnly
      {...(draft ? { live: true } : {})}
    />
  );

  const tag = given ? (
    <span className="cr-link-tag" data-tooltip="Given away at the start, so the middle is guessable" data-tooltip-variant="game">given</span>
  ) : skipped ? (
    <span className="cr-link-tag cr-link-tag--gone">given up</span>
  ) : cracked ? (
    <span className="cr-link-tag cr-link-tag--got">{mine ? "yours" : solverName ?? "theirs"}</span>
  ) : (
    /* What it is still worth. Three, then two, then one, and every letter that
       comes off it walks it down the ladder. */
    <span
      className="cr-link-worth"
      data-tooltip={`Worth ${scoreForLetters(link.lettersShown)} if you get it now`}
      data-tooltip-variant="game"
    >
      {scoreForLetters(link.lettersShown)}
    </span>
  );

  const Tag = canPress ? "button" : "div";

  return (
    <li className={`cr-link cr-link--${state}`}>
      <span className="cr-link-num">{index + 1}</span>

      <Tag
        className="cr-link-face"
        {...(canPress ? { type: "button" as const, onClick: onSelect } : {})}
      >
        <span className="cr-link-body">{body}</span>
        {tag}
      </Tag>

      {/* Only ever on your own hidden middle links. The ends were never yours
          to work on and a solved word has nothing left to spend. */}
      {mine && open && !given && (onHint || onSkip) && (
        <span className="cr-link-actions">
          {onHint && (
            <button
              type="button"
              className="cr-link-btn"
              onClick={onHint}
              disabled={spent}
              aria-label="Reveal a letter"
              data-tooltip={spent ? "Every letter it can give is out" : "Reveal a letter. Costs you points"}
              data-tooltip-variant="game"
            >
              <FiHelpCircle />
            </button>
          )}
          {onSkip && <SkipButton onSkip={onSkip} />}
        </span>
      )}
    </li>
  );
}

/* ── The board ──────────────────────────────────────────────── */

export interface ChainBoardProps {
  links: ChainLink[];
  /** Yours, so it takes typing. Theirs is watched. */
  mine?: boolean;
  /** Which link is open for typing. */
  editing?: number | null;
  guess?: string;
  /** Them, mid-keystroke, on the board you are watching. */
  draft?: ChainDraft | null;
  /** Names, for the tag on a link somebody else cracked. */
  names?: Record<string, string>;
  /** Header line. Left off it is "Your chain" or "Their chain". */
  title?: ReactNode;
  action?: ReactNode;
  onSelect?: (index: number) => void;
  onChange?: (value: string) => void;
  onGuess?: () => void;
  onNavigate?: (delta: 1 | -1) => void;
  onCancel?: () => void;
  onHint?: (index: number) => void;
  onSkip?: (index: number) => void;
}

/**
 * The chain itself. One line runs down behind the numbers rather than a
 * connector drawn between every pair, because it is one chain and not five
 * separate joins.
 */
export function ChainBoard({
  links,
  mine,
  editing,
  guess,
  draft,
  names = {},
  title,
  action,
  onSelect,
  onChange,
  onGuess,
  onNavigate,
  onCancel,
  onHint,
  onSkip,
}: ChainBoardProps) {
  const solved = links.filter((link) => link.revealed && link.solvedBy).length;
  const total = Math.max(0, links.length - 2);

  return (
    <div className="cr-board">
      {/* No box. A chain is a heading and then the chain, the same way a
          roster is a heading and then the players: the links already carry
          their own edges, and a border around a column of bordered rows is
          one border too many. */}
      <div className="gk-roster-head">
        <span className="gk-roster-label">{title ?? (mine ? "Your chain" : "Their chain")}</span>
        <span className="gk-roster-gap" />
        {action ?? <span className="cr-count">{solved} of {total}</span>}
      </div>

      <ol className="cr-links">
        {links.map((link, index) => (
          <ChainLinkRow
            key={`${index}-${link.word}`}
            link={link}
            index={index}
            length={links.length}
            {...(mine ? { mine: true } : {})}
            {...(editing === index ? { editing: true } : {})}
            {...(guess !== undefined ? { guess } : {})}
            {...(draft?.wordIndex === index && draft.text.trim() ? { draft: draft.text } : {})}
            {...(link.solvedBy && names[link.solvedBy] ? { solverName: names[link.solvedBy] } : {})}
            {...(mine && onSelect ? { onSelect: () => onSelect(index) } : {})}
            {...(onChange ? { onChange } : {})}
            {...(onGuess ? { onGuess } : {})}
            {...(onNavigate ? { onNavigate } : {})}
            {...(onCancel ? { onCancel } : {})}
            {...(mine && onHint ? { onHint: () => onHint(index) } : {})}
            {...(mine && onSkip ? { onSkip: () => onSkip(index) } : {})}
          />
        ))}
      </ol>
    </div>
  );
}

/* ── Writing your own ───────────────────────────────────────── */

export interface ChainWriteProps {
  /** One box per link, however long the host set the chain. */
  words: string[];
  /** The first box, so a caller can put the cursor in it when the phase opens.
   *  Not done in here: a page with two of these on it would fight over the
   *  focus, and /dev/chain is exactly that page. */
  firstInputRef?: Ref<HTMLInputElement>;
  category?: string | undefined;
  /** Locked in. The boxes become the chain you handed over. */
  locked?: boolean;
  /** Who you are waiting on once yours is in. */
  waitingOn?: string;
  submitting?: boolean;
  onChange?: (index: number, value: string) => void;
  onSubmit?: (event: FormEvent) => void;
}

/**
 * The custom mode phase: you write the chain your opponent has to crack. Same
 * links they will see it as, so what you are building and what they will be
 * working on are visibly the same object.
 */
export function ChainWrite({
  words,
  firstInputRef,
  category,
  locked,
  waitingOn,
  submitting,
  onChange,
  onSubmit,
}: ChainWriteProps) {
  const bank = category ? chainCategoryLabels[category] ?? category : null;
  const short = words.some((word) => !word.trim());

  const rows = (
    <ol className="cr-links cr-links--write">
      {words.map((word, index) => {
        const given = isGivenEnd(index, words.length);

        return (
          <li key={index} className={`cr-link cr-link--${locked ? (given ? "given" : "open") : "write"}`}>
            <span className="cr-link-num">{index + 1}</span>

            <div className="cr-link-face">
              <span className="cr-link-body">
                {locked ? (
                  <span className="cr-link-word">{word.toUpperCase()}</span>
                ) : (
                  <input
                    {...(index === 0 && firstInputRef ? { ref: firstInputRef } : {})}
                    className="cr-write-input"
                    value={word}
                    maxLength={30}
                    autoComplete="off"
                    spellCheck={false}
                    aria-label={`Word ${index + 1}${given ? ", they see this one" : ""}`}
                    placeholder={given ? "They see this one" : "Hidden word"}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => onChange?.(index, event.target.value)}
                  />
                )}
              </span>

              {given && (
                <span className="cr-link-tag" data-tooltip="Handed over at the start, so they have somewhere to begin" data-tooltip-variant="game">
                  they see this
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );

  if (locked) {
    return (
      <>
        <div className="cr-board">
          <div className="gk-roster-head">
            <span className="gk-roster-label">Locked in</span>
            <span className="gk-roster-gap" />
            <span className="cr-count"><FiLock aria-hidden="true" /> handed over</span>
          </div>
          {rows}
        </div>

        <GamePanel>
          <GameEmpty
            icon={<FiClock />}
            title={waitingOn ? `Waiting on ${waitingOn}` : "Waiting on the other one"}
            hint="The duel starts the moment both chains are in."
          />
        </GamePanel>
      </>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="cr-board">
        <div className="gk-roster-head">
          <span className="gk-roster-label">Write their chain</span>
          <span className="gk-roster-gap" />
          {bank && <span className="cr-count">{bank}</span>}
        </div>

        <p className="cr-note">
          Each word should lead to the next one. They get the first and the last, and have to work out everything
          in between.
        </p>

        {rows}
      </div>

      <GameActions hint={short ? "Every link needs a word. A chain with a hole in it is not one." : undefined}>
        <GameButton
          type="submit"
          variant="primary"
          icon={<FiSend />}
          disabled={short}
          {...(submitting ? { loading: true } : {})}
        >
          Lock it in
        </GameButton>
      </GameActions>
    </form>
  );
}

/* ── The phase ──────────────────────────────────────────────── */

export interface ChainRoundProps {
  you: ChainDuelist;
  them: ChainDuelist;
  /** Both boards. Yours is the one you can type into. */
  yourLinks: ChainLink[];
  theirLinks: ChainLink[];
  /** Whose board is on screen. Yours unless you pressed their card. */
  viewing?: string;
  editing?: number | null;
  guess?: string;
  /** Them, mid-keystroke, while you are watching their board. */
  draft?: ChainDraft | null;
  names?: Record<string, string>;
  onView?: (sessionId: string) => void;
  onSelect?: (index: number) => void;
  onChange?: (value: string) => void;
  onGuess?: () => void;
  onNavigate?: (delta: 1 | -1) => void;
  onCancel?: () => void;
  onHint?: (index: number) => void;
  onSkip?: (index: number) => void;
}

export function ChainRound({
  you,
  them,
  yourLinks,
  theirLinks,
  viewing,
  editing,
  guess,
  draft,
  names,
  onView,
  onSelect,
  onChange,
  onGuess,
  onNavigate,
  onCancel,
  onHint,
  onSkip,
}: ChainRoundProps) {
  const mine = !viewing || viewing === you.sessionId;

  return (
    <>
      <ChainScoreboard
        you={you}
        them={them}
        viewing={viewing ?? you.sessionId}
        {...(onView ? { onView } : {})}
      />

      {mine ? (
        <ChainBoard
          links={yourLinks}
          mine
          {...(editing !== undefined ? { editing } : {})}
          {...(guess !== undefined ? { guess } : {})}
          {...(names ? { names } : {})}
          {...(onSelect ? { onSelect } : {})}
          {...(onChange ? { onChange } : {})}
          {...(onGuess ? { onGuess } : {})}
          {...(onNavigate ? { onNavigate } : {})}
          {...(onCancel ? { onCancel } : {})}
          {...(onHint ? { onHint } : {})}
          {...(onSkip ? { onSkip } : {})}
        />
      ) : (
        <ChainBoard
          links={theirLinks}
          title={<><FiEye aria-hidden="true" /> {them.name}'s chain</>}
          {...(draft ? { draft } : {})}
          {...(names ? { names } : {})}
        />
      )}

      {/* One line saying what to do with what is on screen. The board itself
          cannot say it: a list of words looks the same whether it is yours to
          work on or theirs to watch. */}
      {mine && you.done ? (
        <GamePanel>
          <GameEmpty
            icon={<FiClock />}
            title="Your chain is done"
            hint={them.done ? "Both of you are through. The round is over." : `Press ${them.name}'s card to watch them finish.`}
          />
        </GamePanel>
      ) : (
        <p className="cr-note cr-note--centred">
          {mine
            ? "Press a word to crack it. A wrong guess hands you a letter and costs you a point."
            : `Watching ${them.name}. Press your own card to get back to your chain.`}
        </p>
      )}
    </>
  );
}
