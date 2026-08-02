import { Fragment, type CSSProperties, type ReactNode } from "react";
import { FiArrowRight, FiAward, FiClipboard, FiHelpCircle, FiX } from "react-icons/fi";

export interface SoloSetupOption {
  value: string;
  /** Left off for icon-only options. `title` still names them for screen readers. */
  label?: string;
  hint?: string;
  icon?: ReactNode;
  /** Progress ring, e.g. 2 of 4 filled for the second difficulty. */
  ring?: { total: number; filled: number };
  /** Relative column width. Two options at 2 and 1 split 66/33. */
  weight?: number;
  accent?: string;
  /** Accessible name plus hover tooltip. Required when there is no label. */
  title: string;
}

export interface SoloSetupRow {
  /** Names the group for screen readers now that the visible headings are gone. */
  label: string;
  value: string;
  options: SoloSetupOption[];
  onChange: (value: string) => void;
  /** Show every option as "included" instead of as a picker, for fixed ladders. */
  locked?: boolean;
}

/** Difficulty at a glance: one arc per level, filled up to this option's rank. */
function DifficultyRing({ total, filled }: { total: number; filled: number }) {
  const radius = 7;
  const circumference = 2 * Math.PI * radius;
  const gap = total > 3 ? 3.4 : 3.8;
  const arc = circumference / total - gap;

  return (
    <svg className="solo-ring" viewBox="0 0 18 18" aria-hidden="true">
      {Array.from({ length: total }, (_, index) => (
        <circle
          key={index}
          className={`solo-ring-arc${index < filled ? " solo-ring-arc--on" : ""}`}
          cx="9"
          cy="9"
          r={radius}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${arc} ${circumference - arc}`}
          strokeDashoffset={-(circumference / total) * index}
          transform="rotate(-90 9 9)"
        />
      ))}
    </svg>
  );
}

export function Segmented({ row, attached }: { row: SoloSetupRow; attached?: boolean }) {
  const activeIndex = Math.max(0, row.options.findIndex((option) => option.value === row.value));
  const weights = row.options.map((option) => option.weight ?? 1);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const before = weights.slice(0, activeIndex).reduce((sum, weight) => sum + weight, 0);

  return (
    <div
      className="solo-seg"
      role={row.locked ? "group" : "radiogroup"}
      aria-label={row.label}
      data-locked={row.locked ? "" : undefined}
      data-attached={attached ? "" : undefined}
      style={{
        gridTemplateColumns: weights.map((weight) => `${weight}fr`).join(" "),
        "--thumb-x": before / total,
        "--thumb-w": weights[activeIndex]! / total,
        "--seg-accent": row.options[activeIndex]?.accent ?? "var(--primary)",
      } as CSSProperties}
    >
      <span className="solo-seg-thumb" aria-hidden="true" />
      {row.options.map((option) => {
        const active = option.value === row.value;
        return (
          <button
            key={option.value}
            type="button"
            role={row.locked ? undefined : "radio"}
            aria-checked={row.locked ? undefined : active}
            aria-disabled={row.locked ? true : undefined}
            aria-label={option.title}
            data-tooltip={option.title}
            data-tooltip-pos="top"
            className={`solo-opt${active && !row.locked ? " solo-opt--on" : ""}${option.label ? "" : " solo-opt--icon"}`}
            style={{ "--opt-accent": option.accent ?? "var(--primary)" } as CSSProperties}
            onClick={() => {
              if (!row.locked) row.onChange(option.value);
            }}
          >
            {option.ring
              ? <DifficultyRing total={option.ring.total} filled={option.ring.filled} />
              : option.icon && <span className="solo-opt-icon">{option.icon}</span>}
            {option.label && <span className="solo-opt-name">{option.label}</span>}
            {option.hint && <span className="solo-opt-hint">{option.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function SoloGameMenu({
  title,
  subtitle,
  modeRow,
  difficultyRow,
  note,
  seed,
  ladder,
  startLabel,
  onStart,
  onOpenLeaderboard,
  onOpenHowTo,
}: {
  title: string;
  subtitle: string;
  modeRow: SoloSetupRow;
  difficultyRow: SoloSetupRow;
  /** One short line under the mode control. Keep it to 40 characters. */
  note: string;
  /** Seed drawer under the mode picker. Open for any run that can take a seed. */
  seed: { open: boolean; value: string; onChange: (value: string) => void; maxLength?: number; placeholder?: string };
  /**
   * Run order shown in a drawer under the difficulty picker, e.g. the three
   * Pips sizes. Exactly one of this and the seed drawer should be open, which
   * is what keeps the card the same height in every mode.
   */
  ladder?: string[];
  startLabel: string;
  onStart: () => void;
  onOpenLeaderboard: () => void;
  onOpenHowTo: () => void;
}) {
  const maxLength = seed.maxLength ?? 10;
  const ladderOpen = Boolean(ladder && ladder.length > 0);

  return (
    <main className="solo-menu">
      <header className="solo-menu-hero">
        <h1 className="solo-menu-title">{title}</h1>
        <p className="solo-menu-sub">{subtitle}</p>
      </header>

      <section className="solo-setup" aria-label={`${title} setup`}>
        <div className="solo-setup-mode">
          <Segmented row={modeRow} attached={seed.open} />

          {seed.open && (
            <div className="solo-drawer solo-seed">
              <span className="solo-seed-icon" aria-hidden="true">#</span>
              <input
                type="text"
                className="solo-seed-input"
                inputMode="numeric"
                maxLength={maxLength}
                placeholder={seed.placeholder ?? "Enter a seed to replay a run"}
                aria-label="Run seed"
                autoFocus
                value={seed.value}
                onChange={(event) => seed.onChange(event.target.value.replace(/[^0-9]/g, ""))}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && seed.value.length > 0) onStart();
                }}
              />
              {seed.value.length > 0 ? (
                <button
                  className="solo-seed-btn"
                  type="button"
                  aria-label="Clear seed"
                  data-tooltip="Clear"
                  data-tooltip-pos="top"
                  onClick={() => seed.onChange("")}
                >
                  <FiX size={15} />
                </button>
              ) : (
                <button
                  className="solo-seed-btn"
                  type="button"
                  aria-label="Paste seed from clipboard"
                  data-tooltip="Paste"
                  data-tooltip-pos="top"
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText();
                      const cleaned = text.replace(/[^0-9]/g, "").slice(0, maxLength);
                      if (cleaned) seed.onChange(cleaned);
                    } catch {
                      // Clipboard access is optional.
                    }
                  }}
                >
                  <FiClipboard size={15} />
                </button>
              )}
            </div>
          )}
        </div>

        <p className="solo-setup-note">{note}</p>

        <div className="solo-setup-difficulty">
          <Segmented row={difficultyRow} attached={ladderOpen} />

          {ladderOpen && (
            <div className="solo-drawer solo-ladder">
              {ladder!.map((step, index) => (
                <Fragment key={step}>
                  {index > 0 && <FiArrowRight className="solo-ladder-arrow" size={13} aria-hidden="true" />}
                  <span className="solo-ladder-step">{step}</span>
                </Fragment>
              ))}
            </div>
          )}
        </div>

        <button className="solo-start" type="button" onClick={onStart}>
          <span className="solo-start-label">{startLabel}</span>
          <FiArrowRight className="solo-start-arrow" size={18} />
        </button>
      </section>

      <nav className="solo-menu-links">
        <button className="solo-menu-link" type="button" onClick={onOpenLeaderboard}>
          <FiAward size={14} /> Leaderboard
        </button>
        <button className="solo-menu-link" type="button" onClick={onOpenHowTo}>
          <FiHelpCircle size={14} /> How to Play
        </button>
      </nav>
    </main>
  );
}
