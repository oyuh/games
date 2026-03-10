import { showToast } from "./toast";

const WINDOW_MS = 10_000;
const MAX_PER_WINDOW = 30;
const MAX_WARNINGS = 5;
const RESTRICT_MS = 60_000;
const WARNING_DECAY_MS = 120_000;

const timestamps: number[] = [];
let warnings = 0;
let restrictedUntil = 0;
let lastWarningAt = 0;

export function checkRateLimit(): boolean {
  const t = Date.now();

  // Decay warnings after period of good behavior
  if (warnings > 0 && t - lastWarningAt > WARNING_DECAY_MS) {
    warnings = 0;
  }

  // Currently restricted
  if (t < restrictedUntil) {
    const sec = Math.ceil((restrictedUntil - t) / 1000);
    showToast(`Rate limited — wait ${sec}s`, "error");
    return false;
  }

  // Prune old timestamps outside window
  while (timestamps.length > 0 && timestamps[0]! < t - WINDOW_MS) {
    timestamps.shift();
  }

  timestamps.push(t);

  if (timestamps.length <= MAX_PER_WINDOW) return true;

  // Over limit — issue warning
  warnings++;
  lastWarningAt = t;

  if (warnings >= MAX_WARNINGS) {
    restrictedUntil = t + RESTRICT_MS;
    warnings = 0;
    showToast("Too many actions! You're restricted for 60 seconds.", "error");
    return false;
  }

  showToast(`Slow down! Warning ${warnings}/${MAX_WARNINGS}`, "error");
  return false;
}
