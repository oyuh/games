import { GAME_META } from "@games/shared";
import { useEffect, useRef, useState, type CSSProperties, type FocusEvent } from "react";
import { FiX, FiAlertCircle, FiCheck, FiInfo, FiShield, FiGlobe } from "react-icons/fi";
import { useToasts, dismissToast, pauseToast, resumeToast, type Toast } from "../../lib/toast";
import { GameIcon } from "./GameIcon";
import "../../styles/toast.css";

const icons = {
  error: <FiAlertCircle size={16} />,
  success: <FiCheck size={16} />,
  info: <FiInfo size={16} />,
};

// Cards past this depth sit hidden behind the stack until it opens.
const MAX_PEEK = 2;

function originKey(toast: Toast) {
  return toast.admin ? "admin" : (toast.game ?? "site");
}

function Origin({ toast }: { toast: Toast }) {
  if (toast.admin) return <><FiShield size={12} aria-hidden="true" />Admin</>;
  if (!toast.game) return <><FiGlobe size={12} aria-hidden="true" />Site</>;
  return <><GameIcon game={toast.game} size={12} />{GAME_META[toast.game].shortTitle}</>;
}

interface ToastItemProps {
  toast: Toast;
  depth: number;
  /** On the front card of a pile: how many sit behind it, and how to fan them out. */
  more?: { count: number; category: string; onOpen: () => void } | undefined;
}

function ToastItem({ toast, depth, more }: ToastItemProps) {
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
      data-game-theme={toast.game}
      data-depth={Math.min(depth, MAX_PEEK + 1)}
      style={{ "--toast-duration": `${toast.duration}ms`, "--depth": depth } as CSSProperties}
    >
      <span className="toast-icon" aria-hidden="true">{toast.admin ? <FiShield size={16} /> : icons[toast.level]}</span>
      <span className="toast-msg">
        {toast.admin && <span className="toast-sr-label">From an admin: </span>}
        {toast.message}
      </span>
      {more && (
        <button
          type="button"
          className="toast-more"
          aria-label={`Show ${more.count} more ${more.category} notifications`}
          onClick={more.onOpen}
        >
          <span className="toast-more-chip">+{more.count}</span>
        </button>
      )}
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

/**
 * Toasts from one place about one thing, piled up with the newest in front.
 * Hovering, focusing, or tapping the +N fans them out and holds them all.
 */
function ToastStack({ toasts }: { toasts: Toast[] }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  // Touch has no hover, so the +N opens it too.
  const [opened, setOpened] = useState(false);
  const stackRef = useRef<HTMLDivElement>(null);

  const count = toasts.filter((t) => !t.leaving).length;
  const stacked = count > 1;
  const open = stacked && (hovered || focused || opened);
  const held = hovered || focused || open;

  useEffect(() => {
    if (!stacked) setOpened(false);
  }, [stacked]);

  // The +N hides once the pile fans out, so focus moves to the front card's
  // close. Focus inside keeps it open; tapping or tabbing away closes it.
  useEffect(() => {
    if (opened) stackRef.current?.querySelector<HTMLButtonElement>('[data-depth="0"] .toast-dismiss')?.focus();
  }, [opened]);

  useEffect(() => {
    for (const t of toasts) {
      if (held) pauseToast(t.id);
      else resumeToast(t.id);
    }
  }, [held, toasts]);

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setFocused(false);
    setOpened(false);
  };

  const newest = toasts[toasts.length - 1];
  if (!newest) return null;

  // Newest live toast in front, then the rest newest to oldest.
  const newestFirst = [...toasts].reverse();
  const front = newestFirst.find((t) => !t.leaving) ?? newest;
  const depthOrder = [front, ...newestFirst.filter((t) => t !== front)];

  return (
    <div
      ref={stackRef}
      className={`toast-stack${open ? " toast-stack--open" : ""}`}
      style={{ "--stack-peek": Math.min(toasts.length - 1, MAX_PEEK) } as CSSProperties}
      data-game-theme={newest.game}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
    >
      {stacked && (
        <div className="toast-stack-head">
          <span className="toast-stack-origin">
            <Origin toast={newest} />
          </span>
          <span className="toast-stack-category">{newest.category}</span>
        </div>
      )}
      <div className="toast-stack-cards">
        {toasts.map((t) => (
          <ToastItem
            key={t.id}
            toast={t}
            depth={depthOrder.indexOf(t)}
            more={stacked && t === front ? { count: count - 1, category: newest.category, onOpen: () => setOpened(true) } : undefined}
          />
        ))}
      </div>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToasts();

  const stacks = new Map<string, Toast[]>();
  for (const t of toasts) {
    const key = `${originKey(t)}:${t.category}`;
    stacks.set(key, [...(stacks.get(key) ?? []), t]);
  }

  // Always mounted, even empty: a live region has to exist before the text
  // lands in it or screen readers never announce it.
  return (
    <div className="toast-container" aria-live="polite" aria-label="Notifications">
      {[...stacks].map(([key, group]) => (
        <ToastStack key={key} toasts={group} />
      ))}
    </div>
  );
}
