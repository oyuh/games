import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { FiArrowRight, FiDatabase, FiServer, FiShield, FiZap } from "react-icons/fi";
import { GenIcon, type IconType } from "react-icons";
import {
  SiBun,
  SiBuymeacoffee,
  SiCloudflare,
  SiDrizzle,
  SiHono,
  SiKofi,
  SiPostgresql,
  SiReact,
  SiTypescript,
  SiVite
} from "react-icons/si";
import { Link } from "react-router-dom";
import { formatUptime, overallTone, relativeTime, useConnectionDebug, type ServiceTone } from "../lib/connection-debug";
import "../styles/footer.css";
import { getCustomStatus, subscribeCustomStatus } from "../hooks/useAdminBroadcast";
import { getOrCreateSessionId, getOrCreateStoredName, getSessionFingerprint } from "../lib/session";
import { PlayerAvatar } from "./shared/PlayerAvatar";
import { PlayerHoverCard } from "./shared/PlayerHoverCard";
import { showToast } from "../lib/toast";

const GITHUB_REPO = "https://github.com/oyuh/games";
const SUPPORT_LINKS = [
  { label: "Buy me a coffee", href: "https://buymeacoffee.com/lawsonhart", Icon: SiBuymeacoffee },
  { label: "Support on Ko-fi", href: "https://ko-fi.com/lawsonhart", Icon: SiKofi }
];
// Rocicorp's mark from zero.rocicorp.dev/images/logo.svg, in currentColor
// like the simple-icons around it. react-icons doesn't ship it.
const ZeroLogo = GenIcon({
  tag: "svg",
  attr: { viewBox: "0 0 48 48", fill: "currentColor" },
  child: [
    { tag: "path", attr: { d: "M14.545 38.3037C21.2011 42.7136 30.2574 41.9863 36.1218 36.1218C39.5128 32.7309 41.1862 28.2728 41.142 23.8286L47.1855 17.7851C49.3237 25.7919 47.252 34.6891 40.9705 40.9706C31.598 50.3431 16.402 50.3431 7.02943 40.9706C6.20631 40.1474 5.45548 39.2794 4.77693 38.3743L12.7873 30.364H22.4848L14.545 38.3037Z" }, child: [] },
    { tag: "path", attr: { d: "M7.02943 7.02944C0.747934 13.3109 -1.32371 22.2081 0.814515 30.2149L6.85799 24.1714C6.81382 19.7272 8.48721 15.2691 11.8782 11.8782C17.7426 6.01373 26.7988 5.28643 33.455 9.69629L25.5152 17.636H35.2127L43.223 9.62566C42.5445 8.7206 41.7937 7.85256 40.9705 7.02944C31.598 -2.34315 16.402 -2.34315 7.02943 7.02944Z" }, child: [] }
  ]
});

const STACK: Array<{ name: string; Icon: IconType }> = [
  { name: "React", Icon: SiReact },
  { name: "TypeScript", Icon: SiTypescript },
  { name: "Vite", Icon: SiVite },
  { name: "Bun", Icon: SiBun },
  { name: "Hono", Icon: SiHono },
  { name: "Rocicorp Zero", Icon: ZeroLogo },
  { name: "Postgres", Icon: SiPostgresql },
  { name: "Drizzle", Icon: SiDrizzle },
  { name: "Cloudflare", Icon: SiCloudflare }
];

/** The one word on the footer line, and the sentence it opens into. */
const TONE_LABELS: Record<ServiceTone, { short: string; long: string }> = {
  loading: { short: "Checking…", long: "Checking Services" },
  ok: { short: "Operational", long: "All Systems Operational" },
  partial: { short: "Partial", long: "Partially Operational" },
  err: { short: "Issues", long: "Issues Detected" }
};

function StatusDot({ tone }: { tone: ServiceTone }) {
  return <span className={`status-dot status-dot--${tone}`} />;
}

/**
 * GitHub's five-square diff summary, at the size a footer can afford. The split
 * is by share of the diff, but a commit that touched a side at all keeps a
 * square for it, so a 400-line addition with two deletions still admits to them.
 */
function diffBlocks(additions: number, deletions: number) {
  const total = additions + deletions;
  if (total === 0) {
    return [] as Array<"add" | "del">;
  }

  let added = Math.round((additions / total) * 5);
  if (additions > 0 && added === 0) added = 1;
  if (deletions > 0 && added === 5) added = 4;

  return Array.from({ length: 5 }, (_, index) => (index < added ? "add" : "del") as "add" | "del");
}

function useCustomStatus() {
  return useSyncExternalStore(subscribeCustomStatus, getCustomStatus);
}

export function Footer() {
  const debug = useConnectionDebug();
  const customStatus = useCustomStatus();
  const sessionId = getOrCreateSessionId();
  const [expanded, setExpanded] = useState(false);
  const [tick, setTick] = useState(0);
  // Holding shift anywhere on the page swaps every column for its detailed version.
  const [more, setMore] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = (e: KeyboardEvent) => setMore(e.shiftKey);
    const off = () => setMore(false);
    window.addEventListener("keydown", update);
    window.addEventListener("keyup", update);
    window.addEventListener("blur", off);
    return () => {
      window.removeEventListener("keydown", update);
      window.removeEventListener("keyup", update);
      window.removeEventListener("blur", off);
    };
  }, []);

  // Tick every 30s to keep uptime fresh
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Close on click outside
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [expanded]);

  const apiOk = debug.apiMetaState === "ok";
  const dbOk = debug.dbState === "ok";
  const syncOk = debug.zeroState === "connected";
  const backendOk = apiOk && dbOk;
  const tone = overallTone(debug);
  const isLoading = tone === "loading";

  const uptimeText = debug.apiUptimeMs != null
    ? formatUptime(debug.apiUptimeMs + tick * 30_000)
    : null;

  const buildTime = debug.apiBuildTimestamp
    ? relativeTime(debug.apiBuildTimestamp)
    : null;

  const commitShort = debug.apiCommitSha ? debug.apiCommitSha.slice(0, 7) : null;
  const commitMsg = debug.apiCommitMessage || null;
  const additions = debug.apiCommitAdditions;
  const deletions = debug.apiCommitDeletions;
  const filesChanged = debug.apiCommitFilesChanged;
  const hasDiff = additions != null && deletions != null;
  const latency = debug.apiLatencyMs;
  const fingerprint = getSessionFingerprint();
  const checkedText = debug.apiMetaCheckedAt ? relativeTime(debug.apiMetaCheckedAt) : null;

  const services: Array<{ name: string; Icon: IconType; tone: ServiceTone; label: string }> = [
    {
      name: "API",
      Icon: FiServer,
      tone: apiOk ? "ok" : isLoading ? "loading" : "err",
      label: apiOk ? "Online" : isLoading ? "Checking" : "Offline"
    },
    {
      name: "Database",
      Icon: FiDatabase,
      tone: dbOk ? "ok" : isLoading ? "loading" : "err",
      label: dbOk ? "Connected" : isLoading ? "Checking" : "Disconnected"
    },
    {
      name: "Sync",
      Icon: FiZap,
      tone: syncOk ? "ok" : isLoading ? "loading" : backendOk ? "partial" : "err",
      label: syncOk ? "Connected" : isLoading ? "Checking" : backendOk ? "Local only" : "Offline"
    }
  ];

  const buttonLabel = TONE_LABELS[tone].short;
  const overallLabel = TONE_LABELS[tone].long;

  // Render custom status with link, color, flash
  function renderCustomStatus() {
    if (!customStatus || !customStatus.text) return null;
    const style: React.CSSProperties = {};
    if (customStatus.color) style.color = customStatus.color;
    let className = "footer-custom-status";
    if (customStatus.flash) className += " footer-custom-status--flash";
    const content = customStatus.link ? (
      <a href={customStatus.link} target="_blank" rel="noopener noreferrer" style={{ color: style.color || undefined, textDecoration: "underline" }}>
        {customStatus.text}
      </a>
    ) : (
      customStatus.text
    );
    return (
      <div className="footer-row footer-row--status">
        <span className={className} style={style}>
          <FiShield className="footer-custom-status-icon" size={11} aria-hidden="true" />
          {content}
        </span>
      </div>
    );
  }
  return (
    <footer className="app-footer">
      {renderCustomStatus()}
      <div className="footer-row footer-row--main">
        {more ? (
          <span className="footer-credit">
            Made with
            <span className="footer-stack">
              {STACK.map(({ name, Icon }) => (
                <Icon key={name} size={11} role="img" aria-label={name} data-tooltip={name} data-tooltip-variant="info" />
              ))}
            </span>
            by{" "}
            <a href="https://lawsonhart.me" target="_blank" rel="noopener noreferrer" className="footer-link footer-name">
              Lawson Hart
            </a>
          </span>
        ) : (
          <span className="footer-credit">
            Made with <span className="footer-heart">❤️</span> by{" "}
            <a href="https://lawsonhart.me" target="_blank" rel="noopener noreferrer" className="footer-link">
              Lawson
            </a>
          </span>
        )}
        <div className="footer-status-wrap" ref={wrapRef}>
          <button
            className="footer-status"
            onClick={() => setExpanded((v) => !v)}
            data-tooltip="Toggle service status"
          >
            <StatusDot tone={tone} />
            {more ? (
              <>
                {commitShort && <code className="footer-hash">{commitShort}</code>}
                {uptimeText && <span>up {uptimeText}</span>}
                {latency != null && <span className="footer-latency">{latency}ms</span>}
                {checkedText && <span className="footer-latency">checked {checkedText}</span>}
              </>
            ) : (
              <>
                <span className="footer-status-label">{buttonLabel}</span>
                {latency != null && <span className="footer-latency">{latency}ms</span>}
              </>
            )}
          </button>

          {expanded && (
            <div className={`footer-popover fp--${tone}`}>
              {/* The answer, in the tone it deserves, over the tinted head the
                  rest of the site gives a panel that is about one thing. */}
              <div className="fp-head">
                <StatusDot tone={tone} />
                <span className="fp-head-label">{overallLabel}</span>
              </div>

              {/* One row per service: what it is, then the state as a dot and a
                  word in its tone. */}
              <div className="fp-services">
                {services.map((service) => (
                  <div className="fp-service" key={service.name}>
                    <span className="fp-service-name">
                      <service.Icon size={13} aria-hidden="true" />
                      {service.name}
                    </span>
                    <span className={`fp-state fp-state--${service.tone}`}>
                      <StatusDot tone={service.tone} />
                      {service.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Partial is the one state that needs explaining: nothing is
                  broken, your moves are just still on this machine. */}
              {tone === "partial" && (
                <p className="fp-note">
                  You're playing off the local copy. Everything you do is saved here and pushed the moment the
                  sync server finishes waking up.
                </p>
              )}

              {/* The numbers, as the tiles the solo end screen uses: the label
                  small over the value, and a hairline doing the dividing. */}
              {(latency != null || uptimeText || buildTime) && (
                <div className="fp-stats">
                  {latency != null && (
                    <div className="fp-stat">
                      <span className="fp-stat-label">Latency</span>
                      <span className="fp-stat-value">{latency}ms</span>
                    </div>
                  )}
                  {uptimeText && (
                    <div className="fp-stat">
                      <span className="fp-stat-label">Uptime</span>
                      <span className="fp-stat-value">{uptimeText}</span>
                    </div>
                  )}
                  {buildTime && (
                    <div className="fp-stat">
                      <span className="fp-stat-label">Built</span>
                      <span className="fp-stat-value">{buildTime}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Along the bottom behind a hairline, the way the solo pickers
                  hang their seed drawer. The hash names the deploy; the counts
                  under it say how big it was, which is the thing you actually
                  wanted to know when you opened this. */}
              {commitShort && (
                <a
                  className="fp-commit"
                  href={`${GITHUB_REPO}/commit/${debug.apiCommitSha}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="fp-commit-line">
                    <code className="fp-commit-hash">{commitShort}</code>
                    {commitMsg && <span className="fp-commit-msg">{commitMsg}</span>}
                  </span>
                  {hasDiff && (
                    <span className="fp-commit-diff">
                      <span className="fp-diff-bar" aria-hidden="true">
                        {diffBlocks(additions, deletions).map((block, index) => (
                          <span className={`fp-diff-block fp-diff-block--${block}`} key={index} />
                        ))}
                      </span>
                      <span className="fp-diff fp-diff--add">+{additions.toLocaleString()}</span>
                      <span className="fp-diff fp-diff--del">−{deletions.toLocaleString()}</span>
                      {filesChanged != null && filesChanged > 0 && (
                        <span className="fp-diff-files">
                          {filesChanged} {filesChanged === 1 ? "file" : "files"}
                        </span>
                      )}
                    </span>
                  )}
                </a>
              )}

              <div className="fp-foot">
                <Link className="fp-more" to="/status" onClick={() => setExpanded(false)}>
                  Full status page
                  <FiArrowRight size={12} aria-hidden="true" />
                </Link>
                {SUPPORT_LINKS.map(({ label, href, Icon }) => (
                  <a
                    className="fp-support"
                    key={href}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    data-tooltip={label}
                    data-tooltip-variant="info"
                  >
                    <Icon size={15} aria-hidden="true" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
        {/* The id is the handle, but nobody recognises themselves by one, so
            hovering shows the face and the name it belongs to. Pressing it
            copies, which is the only reason anyone reads it in the first
            place: they are about to paste it into a bug report. */}
        {more ? (
          <span className="footer-session-id footer-session-more">
            <PlayerAvatar seed={sessionId} size={14} />
            <span className="footer-session-name">{getOrCreateStoredName(sessionId)}</span>
            {fingerprint && <code className="footer-hash">fp {fingerprint}</code>}
            <code className="footer-hash footer-sid">{sessionId}</code>
          </span>
        ) : (
          <span className="footer-session-id">
            <PlayerHoverCard
              trigger="name"
              sessionId={sessionId}
              name={getOrCreateStoredName(sessionId)}
              you
              label={sessionId}
              onActivate={() => {
                void navigator.clipboard.writeText(sessionId)
                  .then(() => showToast("Session id copied", "info"))
                  .catch(() => showToast("Couldn't copy it", "error"));
              }}
            />
          </span>
        )}
      </div>
    </footer>
  );
}
