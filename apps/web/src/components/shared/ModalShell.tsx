import { type CSSProperties, type ReactNode } from "react";
import { FiX } from "react-icons/fi";
import "../../styles/game-shared.css";

/**
 * The frame every modal on the site shares: an icon tile in the modal's own
 * accent, a kicker, a title, a close button, then a scrolling body.
 *
 * Same rules as the solo menu the look comes from: no shadows on the content,
 * no glows, depth from borders and fills, one primary button. Panels that need
 * chrome pinned between the header and the scroll area (the how-to's step
 * picker) pass it as `aside`.
 */
export function ModalShell({
  icon,
  kicker,
  title,
  accent = "var(--primary)",
  size = "md",
  className = "",
  onClose,
  aside,
  footer,
  children,
}: {
  icon?: ReactNode;
  kicker?: string;
  title: string;
  accent?: string;
  size?: "md" | "lg" | "xl";
  className?: string;
  onClose: () => void;
  /** Fixed chrome under the header, outside the scrolling body. */
  aside?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className="modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      role="presentation"
    >
      <div
        className={`modal-panel mshell mshell--${size}${className ? ` ${className}` : ""}`}
        style={{ "--modal-accent": accent } as CSSProperties}
      >
        <header className="mshell-head">
          {icon && <span className="mshell-icon">{icon}</span>}
          <div className="mshell-head-text">
            {kicker && <span className="mshell-kicker">{kicker}</span>}
            <h2 className="mshell-title">{title}</h2>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <FiX size={18} />
          </button>
        </header>

        {aside}

        <div className="mshell-body">{children}</div>

        {footer && <footer className="mshell-foot">{footer}</footer>}
      </div>
    </div>
  );
}

/** One labelled block inside a modal body. The label replaces a heading. */
export function ModalSection({
  label,
  hint,
  tone,
  children,
}: {
  label: string;
  hint?: string;
  /** Danger tints the label and the block's border, for destructive controls. */
  tone?: "danger";
  children: ReactNode;
}) {
  return (
    <section className={`mshell-section${tone ? ` mshell-section--${tone}` : ""}`}>
      <span className="mshell-section-label">{label}</span>
      {hint && <p className="mshell-section-hint">{hint}</p>}
      {children}
    </section>
  );
}

