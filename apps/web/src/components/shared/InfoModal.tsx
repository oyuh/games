import { GAME_META, getGameSlugFromPath, type GameSlug } from "@games/shared";
import { FiArrowRight, FiGithub, FiInfo } from "react-icons/fi";
import { useLocation } from "react-router-dom";
import { useSyncExternalStore } from "react";
import { getOrCreateSessionId } from "../../lib/session";
import { getCustomStatus, subscribeCustomStatus } from "../../hooks/useAdminBroadcast";
import { ModalSection, ModalShell } from "./ModalShell";
import { ClipboardText } from "./ClipboardText";

const GITHUB_REPO = "https://github.com/oyuh/games";
const BUG_REPORT_URL = `${GITHUB_REPO}/issues/new?title=%5BBug%5D%20`;
const IDEA_REPORT_URL = `${GITHUB_REPO}/issues/new?title=%5BIdea%5D%20`;

const supportLinks = [
  { href: BUG_REPORT_URL, label: "Report a bug" },
  { href: IDEA_REPORT_URL, label: "Suggest an idea" },
];

const siteInfo = {
  title: "Games",
  description: "Quick multiplayer puzzle and party games. Create a lobby, share the code, and play with friends - no accounts required.",
};

interface PageInfo {
  title: string;
  description: string;
  tips?: string[];
}

const pageTips: Record<GameSlug, string[]> = {
  home: [
    "Set your name before joining a game",
    "Use the join code to hop into a friend's lobby",
    "Configure game options before creating",
  ],
  imposter: [
    "Give a clue that proves you know the word without giving it away",
    "The imposter should try to blend in",
    "Review all clues carefully before voting",
  ],
  password: [
    "Clue givers: your clue must be exactly one word",
    "Guessers: type your best guess before time runs out",
    "Watch the scoreboard to track team progress",
  ],
  chain: [
    "Wrong guesses auto-reveal one letter as a hint",
    "Fewer hints used = more points per word",
    "Finish your chain first for a bonus point on the last word",
  ],
  shade: [
    "Leaders: describe the color without naming it directly",
    "Closer guesses earn more points",
    "Every player takes a turn as leader across rounds",
  ],
  location: [
    "Leaders: don't name the place directly",
    "You get clues to narrow it down",
    "Closer guesses score more points",
  ],
  shikaku: [
    "Drag to draw rectangles on the grid",
    "Each rectangle must contain exactly one number",
    "Complete all puzzles as fast as you can for a higher score",
  ],
  pips: [
    "Drag dominoes from the tray onto adjacent cells",
    "Click a domino or press R while holding it to rotate clockwise",
    "Ranked runs use Easy, Medium, and Hard splits; fastest total time ranks",
  ],
};

function getPageInfo(pathname: string): PageInfo {
  const slug = getGameSlugFromPath(pathname);

  if (slug === "home" && pathname !== "/") {
    return {
      title: "Page",
      description: "You're on an unknown page.",
    };
  }

  const meta = GAME_META[slug];
  return {
    title: slug === "home" ? "Home" : meta.title,
    description: slug === "home"
      ? "Create a new game or join an existing one with a code. Set your display name so others can see you."
      : meta.description,
    tips: pageTips[slug],
  };
}

function useCustomStatus() {
  return useSyncExternalStore(subscribeCustomStatus, getCustomStatus);
}

export function InfoModal({ onClose }: { onClose: () => void }) {
  const location = useLocation();
  const page = getPageInfo(location.pathname);
  const sessionId = getOrCreateSessionId();
  const customStatus = useCustomStatus();

  return (
    <ModalShell
      icon={<FiInfo size={18} />}
      kicker="About"
      title={siteInfo.title}
      onClose={onClose}
      footer={(
        <div className="info-footer">
          <a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer" className="info-footer-link">
            <FiGithub size={13} /> Source
          </a>
          <span className="info-footer-by">
            Built by <a href="https://lawsonhart.me" target="_blank" rel="noopener noreferrer">Lawson</a>
          </span>
        </div>
      )}
    >
      <p className="info-site-desc">{siteInfo.description}</p>

      {customStatus?.text && (
        <div className="info-status" style={{ borderColor: customStatus.color || "var(--primary)" }}>
          {customStatus.link ? (
            <a href={customStatus.link} target="_blank" rel="noopener noreferrer">{customStatus.text}</a>
          ) : customStatus.text}
        </div>
      )}

      <ModalSection label={page.title} hint={page.description}>
        {page.tips && page.tips.length > 0 && (
          <ul className="info-tips">
            {page.tips.map((tip) => (
              <li key={`${page.title}-${tip}`} className="info-tip">
                <FiArrowRight size={12} aria-hidden="true" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        )}
      </ModalSection>

      <ModalSection label="Feedback" hint="Found a bug or have an idea? Send it over on GitHub.">
        <div className="info-links">
          {supportLinks.map((link) => (
            <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className="info-link">
              {link.label}
            </a>
          ))}
        </div>
      </ModalSection>

      <ModalSection label="Session" hint="Include this when reporting lobby or sync issues.">
        <ClipboardText text={sessionId} label="Copy session id" />
      </ModalSection>
    </ModalShell>
  );
}
