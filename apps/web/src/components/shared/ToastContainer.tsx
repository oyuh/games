import { useEffect, useState, type CSSProperties, type FocusEvent } from "react";
import { FiX, FiAlertCircle, FiCheck, FiInfo } from "react-icons/fi";
import { useToasts, dismissToast, pauseToast, resumeToast, type Toast } from "../../lib/toast";
import "../../styles/toast.css";

const icons = {
  error: <FiAlertCircle size={16} />,
  success: <FiCheck size={16} />,
  info: <FiInfo size={16} />,
};

function ToastItem({ toast }: { toast: Toast }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const held = hovered || focused;

  useEffect(() => {
    if (held) pauseToast(toast.id);
    else resumeToast(toast.id);
  }, [held, toast.id]);

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
  };

  const className = [
    "toast",
    `toast--${toast.level}`,
    toast.paused && "toast--paused",
    toast.leaving && "toast--leaving",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      style={{ "--toast-duration": `${toast.duration}ms` } as CSSProperties}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
    >
      <span className="toast-icon" aria-hidden="true">{icons[toast.level]}</span>
      <span className="toast-msg">{toast.message}</span>
      <button
        type="button"
        className="toast-dismiss"
        onClick={() => dismissToast(toast.id)}
        aria-label="Dismiss notification"
      >
        <FiX size={16} />
      </button>
      <span className="toast-countdown" aria-hidden="true">
        <span className="toast-countdown-fill" />
      </span>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToasts();

  // Always mounted, even empty: a live region has to exist before the text
  // lands in it or screen readers never announce it.
  return (
    <div className="toast-container" aria-live="polite" aria-label="Notifications">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
