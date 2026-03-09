import { ReactNode } from "react";
import { FiX, FiChevronLeft, FiChevronRight, FiPlay } from "react-icons/fi";

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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel demo-modal-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="demo-modal-header">
          <div className="demo-modal-title-row">
            <span className="demo-modal-icon" style={{ color }}>{icon}</span>
            <h2 className="demo-modal-title">{title} — How to Play</h2>
          </div>
          <button className="modal-close" onClick={onClose}>
            <FiX size={18} />
          </button>
        </div>

        {/* Step dots */}
        <div className="demo-step-bar">
          {steps.map((s, i) => (
            <button
              key={i}
              className={`demo-step-dot${i === currentStep ? " demo-step-dot--active" : ""}${i < currentStep ? " demo-step-dot--done" : ""}`}
              onClick={() => onStepChange(i)}
            >
              <span className="demo-step-num">{i + 1}</span>
              <span className="demo-step-name">{s.label}</span>
            </button>
          ))}
        </div>

        {/* Phase description */}
        <div className="demo-step-info">
          <span className="demo-step-label" style={{ borderColor: color }}>{step?.label}</span>
          <p className="demo-step-desc">{step?.description}</p>
          {step?.hint && <p className="demo-step-hint">💡 {step.hint}</p>}
        </div>

        {/* Game content */}
        <div className="demo-modal-body">
          {children}
        </div>

        {/* Navigation */}
        <div className="demo-modal-nav">
          <button
            className="btn btn-muted demo-nav-btn"
            onClick={() => onStepChange(currentStep - 1)}
            disabled={isFirst}
          >
            <FiChevronLeft size={16} /> Back
          </button>
          <span className="demo-nav-counter">
            {currentStep + 1} / {steps.length}
          </span>
          {isLast ? (
            <button className="btn btn-primary demo-nav-btn" onClick={onClose}>
              <FiPlay size={14} /> Got it!
            </button>
          ) : (
            <button
              className="btn btn-primary demo-nav-btn"
              onClick={() => onStepChange(currentStep + 1)}
            >
              Next <FiChevronRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Wrap any section to give it a pulsing glow + optional label */
export function DemoGlow({ active = true, children, label }: { active?: boolean; children: ReactNode; label?: string }) {
  if (!active) return <>{children}</>;
  return (
    <div className="demo-glow">
      {label && <span className="demo-glow-label">{label}</span>}
      {children}
    </div>
  );
}
