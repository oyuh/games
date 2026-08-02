import { type ReactNode } from "react";
import { FiArrowDown, FiArrowLeft, FiArrowRight, FiCheck, FiCornerDownRight } from "react-icons/fi";
import { Segmented, type SoloSetupRow } from "../shared/SoloGameMenu";
import { ModalShell } from "../shared/ModalShell";

export interface DemoStep {
  label: string;
  description: string;
  hint?: string;
}

interface DemoModalProps {
  title: string;
  icon: ReactNode;
  color: string;
  steps: DemoStep[];
  currentStep: number;
  onStepChange: (step: number) => void;
  onClose: () => void;
  children: ReactNode;
}

/**
 * The shared How to Play shell every game demo runs inside. It borrows the
 * solo menu's design language wholesale: no shadows, no glows, depth from
 * borders and fills, one primary button. The step picker is literally the
 * solo segmented control, so there is nothing here to keep in sync with it.
 * Steps show as numbers with the name on hover, and the drawer underneath
 * spells the current one out.
 */
export function DemoModal({
  title,
  icon,
  color,
  steps,
  currentStep,
  onStepChange,
  onClose,
  children,
}: DemoModalProps) {
  const step = steps[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;

  const stepRow: SoloSetupRow = {
    label: `${title} steps`,
    value: String(currentStep),
    onChange: (value) => onStepChange(Number(value)),
    options: steps.map((s, index) => ({
      value: String(index),
      label: String(index + 1),
      title: s.label,
      accent: color,
    })),
  };

  return (
    <ModalShell
      className="howto"
      size="xl"
      icon={icon}
      kicker="How to play"
      title={title}
      accent={color}
      onClose={onClose}
      aside={(
        <div className="howto-guide">
          <Segmented row={stepRow} attached />

          <div className="solo-drawer howto-step">
            <p className="howto-step-name">{step?.label}</p>
            <p className="howto-step-desc">{step?.description}</p>
            {step?.hint && (
              <p className="howto-step-hint">
                <FiCornerDownRight size={13} aria-hidden="true" />
                {step.hint}
              </p>
            )}
          </div>
        </div>
      )}
      footer={(
        <div className="howto-nav">
          <button
            className="howto-back"
            type="button"
            onClick={() => onStepChange(currentStep - 1)}
            disabled={isFirst}
          >
            <FiArrowLeft size={15} /> Back
          </button>
          <span className="howto-count">{currentStep + 1} / {steps.length}</span>
          <button
            className="mshell-action"
            type="button"
            onClick={() => (isLast ? onClose() : onStepChange(currentStep + 1))}
          >
            {isLast ? "Got it" : "Next"}
            {isLast
              ? <FiCheck className="mshell-action-arrow" size={16} />
              : <FiArrowRight className="mshell-action-arrow" size={16} />}
          </button>
        </div>
      )}
    >
      {children}
    </ModalShell>
  );
}

export interface DemoScoringRow {
  label: string;
  value: string;
}

export interface DemoRule {
  icon: ReactNode;
  title: string;
  text: string;
}

/**
 * The closing "how scoring works" step, shared by every game. A two-column
 * table for whatever the game actually counts, then a grid of the rules that
 * do not fit in a table. Games without points (Imposter) pass outcomes as the
 * table rows; games ranked by time (Pips) pass their splits.
 *
 * Every number in a caller's rows comes from the real scoring code, not from
 * the copy. If the engine changes, these change with it.
 */
export function DemoScoring({
  columns = ["Result", "Points"],
  rows,
  rules,
}: {
  columns?: [string, string];
  rows?: DemoScoringRow[];
  rules?: DemoRule[];
}) {
  return (
    <div className="demo-scoring">
      {rows && rows.length > 0 && (
        <div className="demo-scoring-table">
          <div className="demo-scoring-header">
            <span>{columns[0]}</span>
            <span>{columns[1]}</span>
          </div>
          {rows.map((row) => (
            <div key={row.label} className="demo-scoring-row">
              <span className="demo-scoring-label">{row.label}</span>
              <span className="demo-scoring-value">{row.value}</span>
            </div>
          ))}
        </div>
      )}

      {rules && rules.length > 0 && (
        <div className="demo-rules-grid">
          {rules.map((rule) => (
            <div key={rule.title} className="demo-rule">
              <strong>{rule.icon} {rule.title}</strong>
              <p>{rule.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Names the thing a step is about and points an arrow straight at it. This
 * replaced a pulsing glow that wrapped the same content: the arrow says the
 * same thing without animating, which is the rule everywhere else now.
 */
export function DemoPoint({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="demo-point">
      <span className="demo-point-label">
        <FiArrowDown className="demo-point-arrow" size={13} aria-hidden="true" />
        {label}
      </span>
      {children}
    </div>
  );
}
