import type { SettingRange } from "@games/shared";
import type { ComboboxCustom, ComboboxOption } from "../components/shared/Combobox";

/**
 * Builders for the lobby's setting pickers. Each game's lobby lists a few
 * common values and, where a number is a number, lets the host type their
 * own inside the same range the mutator checks.
 */

/** 45s, 5m, 1m 30s: the way the setup strip writes a timer. */
export function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

/**
 * Reads a timer however someone would type one: "90", "90s", "2m", "2 min",
 * "1:30", "1m30s". A bare number is seconds, since every timer here is.
 */
export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;

  const clock = /^(\d{1,2}):([0-5]\d)$/.exec(text);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);

  const parts = /^(?:(\d+)\s*m(?:in(?:ute)?s?)?)?\s*(?:(\d+)\s*s(?:ec(?:ond)?s?)?)?$/.exec(text);
  if (parts && (parts[1] || parts[2])) return Number(parts[1] ?? 0) * 60 + Number(parts[2] ?? 0);

  return /^\d+$/.test(text) ? Number(text) : null;
}

const inRange = (value: number, range: SettingRange) =>
  Number.isInteger(value) && value >= range.min && value <= range.max;

/** Whole numbers: rounds, points. `unit` is the setup strip's word for them. */
export function numberOptions(values: readonly number[], unit: (n: number) => string): ComboboxOption[] {
  return values.map((n) => ({ value: String(n), label: String(n), detail: unit(n) }));
}

export function numberCustom(range: SettingRange, unit: (n: number) => string): ComboboxCustom {
  return {
    parse: (input) => {
      const n = Number(input.trim());
      return input.trim() && inRange(n, range) ? String(n) : null;
    },
    format: (value) => `${value} ${unit(Number(value))}`,
    hint: `Type a number from ${range.min} to ${range.max}`,
    inputMode: "numeric",
  };
}

export function durationOptions(values: readonly number[]): ComboboxOption[] {
  return values.map((seconds) => ({
    value: String(seconds),
    label: formatDuration(seconds),
    // So typing "90" finds 1m 30s.
    keywords: [String(seconds)],
  }));
}

export function durationCustom(range: SettingRange): ComboboxCustom {
  return {
    parse: (input) => {
      const seconds = parseDuration(input);
      return seconds !== null && inRange(seconds, range) ? String(seconds) : null;
    },
    format: (value) => formatDuration(Number(value)),
    hint: `Type a time from ${formatDuration(range.min)} to ${formatDuration(range.max)}, like 90 or 1:30`,
  };
}

/** A word bank per category, in the create form's order. */
export function categoryOptions(categories: readonly string[], labels: Record<string, string>): ComboboxOption[] {
  return categories.map((key) => ({ value: key, label: labels[key] ?? key }));
}
