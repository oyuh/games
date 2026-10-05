import { GAME_META, getGameSlugFromPath } from "@games/shared";
import { FiAlertCircle, FiArrowLeft, FiGithub, FiInfo, FiShield, FiZap } from "react-icons/fi";
import { LuGamepad2 } from "react-icons/lu";
import { useLocation } from "react-router-dom";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { getOrCreateSessionId } from "../../lib/session";
import { getCustomStatus, subscribeCustomStatus } from "../../hooks/useAdminBroadcast";
import { Button } from "./Button";
import { ModalSection, ModalShell } from "./ModalShell";
import { ClipboardText } from "./ClipboardText";
import { InfoArcade, type ArcadeGame } from "./InfoArcade";

const GITHUB_REPO = "https://github.com/oyuh/games";
const BUG_REPORT_URL = `${GITHUB_REPO}/issues/new?title=%5BBug%5D%20`;
const IDEA_REPORT_URL = `${GITHUB_REPO}/issues/new?title=%5BIdea%5D%20`;

function useCustomStatus() {
  return useSyncExternalStore(subscribeCustomStatus, getCustomStatus);
}

/** Space on a focused control is that control's own press, not the easter egg. */
function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement
    && (target.isContentEditable || target.matches("input, textarea, select, .mshell button, .mshell a"));
}

export function InfoModal({ onClose }: { onClose: () => void }) {
  const [arcade, setArcade] = useState<ArcadeGame | null>(null);

  // Capture phase, so Escape backs out of a game before ModalShell's own
  // window listener sees it and closes the whole modal.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (arcade && event.key === "Escape") {
        event.preventDefault();
        setArcade(null);
      } else if (!arcade && event.key === " " && !event.repeat && !isTyping(event.target)) {
        event.preventDefault();
        setArcade(Math.random() < 0.5 ? "snake" : "invaders");
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [arcade]);

  const other: ArcadeGame = arcade === "snake" ? "invaders" : "snake";

  return (
    <ModalShell
      className="info-modal"
      icon={arcade ? <LuGamepad2 size={18} /> : <FiInfo size={18} />}
      title={arcade === "snake" ? "Snake" : arcade === "invaders" ? "Invaders" : "Games"}
      onClose={onClose}
      footer={arcade ? (
        <div className="info-footer">
          <Button variant="text" size="sm" icon={<FiArrowLeft />} onClick={() => setArcade(null)}>
            Back
          </Button>
          <Button variant="text" size="sm" onClick={() => setArcade(other)}>
            Play {other === "snake" ? "Snake" : "Invaders"} instead
          </Button>
        </div>
      ) : <InfoFooter hint />}
    >
      {arcade ? (
        <InfoArcade game={arcade} seed={getOrCreateSessionId()} />
      ) : (
        <>
          <span className="info-mark" aria-hidden="true" />
          <InfoContent />
        </>
      )}
    </ModalShell>
  );
}

/** `hint` adds the Space prompt, for frames that have a keyboard. */
export function InfoFooter({ hint = false }: { hint?: boolean }) {
  return (
    <div className="info-footer">
      <a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer" className="info-footer-link">
        <FiGithub size={13} /> Source
      </a>
      {hint && <span className="info-footer-hint"><kbd>Space</kbd> for a break</span>}
      <span className="info-footer-by">
        Built by <a href="https://lawsonhart.me" target="_blank" rel="noopener noreferrer">Lawson</a>
      </span>
    </div>
  );
}

/** What the info modal says, framed by the desktop modal or the mobile sheet.
 *  `pageAction` sits under the current game, e.g. the mobile How to Play. */
export function InfoContent({ pageAction }: { pageAction?: ReactNode }) {
  const location = useLocation();
  const slug = getGameSlugFromPath(location.pathname);
  const sessionId = getOrCreateSessionId();
  const customStatus = useCustomStatus();

  return (
    <>
      <p className="info-site-desc">
        Party games and logic puzzles that run in the browser. Make a room, send the code, play. Free, open source, and no accounts.
      </p>

      {customStatus?.text && (
        <div className="info-status" style={{ borderColor: customStatus.color || "var(--primary)" }}>
          <FiShield className="info-status-icon" size={12} aria-hidden="true" />
          {customStatus.link ? (
            <a href={customStatus.link} target="_blank" rel="noopener noreferrer">{customStatus.text}</a>
          ) : customStatus.text}
        </div>
      )}

      {slug !== "home" && (
        <ModalSection label={GAME_META[slug].title} hint={GAME_META[slug].description}>
          {pageAction}
        </ModalSection>
      )}

      <ModalSection label="Feedback">
        <div className="info-links">
          <a href={BUG_REPORT_URL} target="_blank" rel="noopener noreferrer" className="info-link">
            <FiAlertCircle size={15} aria-hidden="true" />
            <span className="info-link-text">
              <span className="info-link-label">Report a bug</span>
              <span className="info-link-sub">Something broke or looks off</span>
            </span>
          </a>
          <a href={IDEA_REPORT_URL} target="_blank" rel="noopener noreferrer" className="info-link">
            <FiZap size={15} aria-hidden="true" />
            <span className="info-link-text">
              <span className="info-link-label">Suggest an idea</span>
              <span className="info-link-sub">A game, a mode, a tweak</span>
            </span>
          </a>
        </div>
      </ModalSection>

      <ModalSection
        label="Session ID"
        hint="Your name and this id live in this browser, and that's the whole account. Paste it into bug reports about lobbies or sync."
      >
        <ClipboardText text={sessionId} label="Copy session id" />
      </ModalSection>
    </>
  );
}
