/**
 * Pure logic for the Chain Reaction masked guess field.
 *
 * Two behaviours live here, kept framework-free so they can be unit tested:
 *   1. The revealed hint letters form a locked prefix; the player can only type
 *      the remaining letters, and the total never exceeds the word length.
 *   2. Every position is rendered as a cell so unfilled slots stay visible as
 *      underscores (the player always sees how many letters the word needs).
 */

export type GuessCellKind = "locked" | "filled" | "empty";

export type GuessCell = {
  index: number;
  char: string;
  kind: GuessCellKind;
  /** The next position to fill, used as the caret indicator (interactive only). */
  active: boolean;
};

/**
 * Keep the locked prefix pinned to the front of the guess and clamp to the word
 * length. Any attempt to edit the prefix region (backspacing into it, select-all +
 * retype) is rejected so revealed letters can never be edited away.
 */
export function lockToPrefix(raw: string, prefix: string, maxLen: number): string {
  const up = raw.toUpperCase();
  // Only the characters typed past the locked prefix survive. If the player
  // reached into the prefix region (backspaced into it, retyped over it) `up` is
  // no longer than the prefix, so the tail is empty and the prefix is re-pinned.
  const tail = up.length > prefix.length ? up.slice(prefix.length) : "";
  return (prefix + tail).slice(0, maxLen);
}

/**
 * Build the per-letter cells for the word.
 *
 * @param word          the target word (only its length + revealed prefix are shown)
 * @param lettersShown  number of locked, already-revealed leading letters
 * @param value         the current guess text (includes the locked prefix)
 * @param interactive   when true, mark the next empty cell as the caret position
 */
export function buildGuessCells(
  word: string,
  lettersShown: number,
  value: string,
  interactive: boolean
): GuessCell[] {
  const total = word.length;
  const prefixLen = Math.min(Math.max(lettersShown, 0), total);
  const prefix = word.slice(0, prefixLen).toUpperCase();
  // A mirrored draft can momentarily be shorter than the prefix; never show less
  // than the revealed letters.
  const display = (value.length < prefixLen ? prefix : value).toUpperCase();
  const typedLen = Math.min(display.length, total);

  return Array.from({ length: total }, (_, i) => {
    if (i < prefixLen) {
      return { index: i, char: word[i]!.toUpperCase(), kind: "locked" as const, active: false };
    }
    if (i < typedLen) {
      return { index: i, char: display[i] ?? "_", kind: "filled" as const, active: false };
    }
    return {
      index: i,
      char: "_",
      kind: "empty" as const,
      active: interactive && i === typedLen,
    };
  });
}
