import { FormEvent, KeyboardEvent, Ref } from "react";
import { buildGuessCells, lockToPrefix } from "./chain-guess";
import "../../styles/chain-guess-field.css";

type ChainGuessFieldProps = {
  /** The target word, used for length and the locked hint letters only. */
  word: string;
  /** Number of leading letters that are already revealed (locked, non-editable). */
  lettersShown: number;
  /** Current guess text. Always includes the locked prefix. */
  value: string;
  /** Render smaller (mobile). */
  compact?: boolean;
  /** Read-only: render the masked word without an input (used to mirror an opponent's live draft). */
  readOnly?: boolean;
  /** Show a "live" badge (read-only spectating). */
  live?: boolean;
  onChange?: (next: string) => void;
  onSubmit?: () => void;
  onCancel?: () => void;
  inputRef?: Ref<HTMLInputElement>;
};

/**
 * Locked-prefix + underscore "fill in the blank" guess field.
 *
 * The revealed hint letters form a fixed prefix the player can't edit; they only
 * type the remaining letters. Unfilled positions stay visible as underscores so the
 * player always knows how many letters the word needs. The same masked rendering is
 * reused (read-only) to mirror an opponent's live typing when spectating their board.
 */
export function ChainGuessField({
  word,
  lettersShown,
  value,
  compact,
  readOnly,
  live,
  onChange,
  onSubmit,
  onCancel,
  inputRef,
}: ChainGuessFieldProps) {
  const total = word.length;
  const prefixLen = Math.min(Math.max(lettersShown, 0), total);
  const prefix = word.slice(0, prefixLen).toUpperCase();
  const cells = buildGuessCells(word, lettersShown, value, !readOnly);

  const handleChange = (raw: string) => {
    if (!onChange) return;
    onChange(lockToPrefix(raw, prefix, total));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit?.();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel?.();
    }
  };

  const field = (
    <div className={`crg-field${compact ? " crg-field--compact" : ""}${readOnly ? " crg-field--readonly" : ""}`}>
      <div className="crg-cells" aria-hidden={readOnly ? undefined : true}>
        {cells.map(({ index, char, kind, active }) => (
          <span
            key={index}
            className={`crg-cell crg-cell--${kind}${active ? " crg-cell--active" : ""}`}
          >
            {char}
          </span>
        ))}
      </div>
      {!readOnly && (
        <input
          ref={inputRef}
          className="crg-input"
          value={value}
          maxLength={total}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-label={`Guess, ${total} letters`}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (!value.trim()) onCancel?.(); }}
        />
      )}
    </div>
  );

  if (readOnly) {
    return (
      <div className="crg-readonly-row">
        {field}
        {live && <span className="crg-live">live</span>}
      </div>
    );
  }

  const canSubmit = value.trim().length > prefixLen;

  return (
    <form className="crg-form" onSubmit={handleSubmit}>
      {field}
      <button type="submit" className="crg-go" disabled={!canSubmit} aria-label="Submit guess">↵</button>
    </form>
  );
}
