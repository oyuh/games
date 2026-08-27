/**
 * Terminal output. Colour is dropped when the stream is not a TTY, when
 * NO_COLOR is set, or when TERM says dumb, so piping to a file or a CI log
 * stays readable.
 */
const CSI = `${String.fromCharCode(27)}[`;

const CODES = {
  reset: 0,
  bold: 1,
  dim: 2,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  gray: 90,
};

const colorEnabled =
  !process.env.NO_COLOR &&
  process.env.TERM !== "dumb" &&
  (process.stdout.isTTY || process.env.FORCE_COLOR === "1");

export function paint(color, text) {
  const code = CODES[color];
  if (!colorEnabled || code === undefined) return String(text);
  return `${CSI}${code}m${text}${CSI}0m`;
}

export const bold = (text) => paint("bold", text);
export const dim = (text) => paint("dim", text);

/** Unicode marks look wrong in the default Windows console fonts. */
const fancy = process.platform !== "win32" || Boolean(process.env.WT_SESSION);
const MARKS = fancy
  ? { ok: "✔", warn: "!", fail: "✖", info: "•", arrow: "→" }
  : { ok: "OK", warn: "!", fail: "X", info: "-", arrow: "->" };

export const ARROW = MARKS.arrow;

export function step(message) {
  console.log(`${paint("cyan", MARKS.info)} ${message}`);
}

export function ok(message) {
  console.log(`${paint("green", MARKS.ok)} ${message}`);
}

export function warn(message) {
  console.log(`${paint("yellow", MARKS.warn)} ${message}`);
}

export function fail(message) {
  console.error(`${paint("red", MARKS.fail)} ${message}`);
}

export function note(message) {
  console.log(`  ${dim(message)}`);
}

export function heading(message) {
  console.log(`\n${bold(message)}`);
}

export function blank() {
  console.log("");
}

const CLEAR_LINE = `\r${CSI}2K`;

/**
 * A progress line that rewrites itself on a TTY and falls back to one line
 * per update everywhere else.
 */
export function progress(message) {
  if (!process.stdout.isTTY) {
    console.log(`${paint("cyan", MARKS.info)} ${message}`);
    return {
      update() {},
      stop() {},
      done(text) {
        if (text) ok(text);
      },
    };
  }

  const frames = fancy
    ? ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
    : ["-", "\\", "|", "/"];
  let frame = 0;
  let text = message;

  const render = () => {
    process.stdout.write(
      `${CLEAR_LINE}${paint("cyan", frames[frame % frames.length])} ${text}`,
    );
    frame += 1;
  };

  render();
  const timer = setInterval(render, 100);
  timer.unref?.();

  return {
    update(next) {
      text = next;
    },
    stop() {
      clearInterval(timer);
      process.stdout.write(CLEAR_LINE);
    },
    done(final) {
      clearInterval(timer);
      process.stdout.write(CLEAR_LINE);
      if (final) ok(final);
    },
  };
}

/** Left-aligned columns, sized to content. Used by `status`. */
export function table(rows, { head = null, indent = "  " } = {}) {
  const all = head ? [head, ...rows] : rows;
  if (all.length === 0) return;

  const widths = [];
  for (const row of all) {
    row.forEach((cell, index) => {
      widths[index] = Math.max(widths[index] ?? 0, visibleLength(cell));
    });
  }

  const render = (row) =>
    indent +
    row
      .map((cell, index) =>
        index === row.length - 1 ? String(cell) : pad(cell, widths[index]),
      )
      .join("  ")
      .trimEnd();

  if (head) console.log(dim(render(head)));
  for (const row of rows) console.log(render(row));
}

const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

function visibleLength(text) {
  return String(text).replace(ANSI_PATTERN, "").length;
}

function pad(text, width) {
  return String(text) + " ".repeat(Math.max(0, width - visibleLength(text)));
}

export function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "-";
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
