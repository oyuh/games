import { DEFAULT_IMPOSTER_CLUE_VISIBILITY, GAME_META, IMPOSTER_CLUE_VISIBILITY_OPTIONS, imposterCategories, imposterCategoryLabels, chainCategories, chainCategoryLabels, multiplayerTypeToGameSlug, passwordCategories, passwordCategoryLabels, mutators, queries } from "@games/shared";
import { optimistic, useQuery, useZero } from "../lib/zero";
import { Select } from "../components/shared/Select";
import { Segmented, type SoloSetupOption } from "../components/shared/SoloGameMenu";
/* The card setup forms borrow the single-player menu's controls. */
import "../styles/game-shared.css";
import "../styles/home.css";
import { nanoid } from "nanoid";
import { FormEvent, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { IconType } from "react-icons";
import { FiArrowDown, FiArrowLeft, FiArrowRight, FiBookOpen, FiCheck, FiChevronDown, FiChevronRight, FiClock, FiDroplet, FiEdit2, FiGlobe, FiHelpCircle, FiList, FiMapPin, FiSearch, FiSliders, FiTarget, FiTrash2, FiUserCheck, FiUsers, FiWifiOff } from "react-icons/fi";
import { addRecentGame, clearRecentGames, ensureName as ensureSessionName, getDisplayName, getOrCreateStoredName, getRecentGames, hasVisited, leaveCurrentGame, markVisited, RecentGame, removeRecentGame, SessionGameType, setStoredName } from "../lib/session";
import { showToast } from "../lib/toast";
import { isNameRestricted } from "../hooks/useAdminBroadcast";
import { useIsMobile } from "../hooks/useIsMobile";
import { MobileHomePage } from "../mobile/pages/MobileHomePage";
import { InSessionModal } from "../components/shared/InSessionModal";
import { ActiveGameModal } from "../components/shared/ActiveGameBanner";
import { PublicGamesList, usePublicGameCount } from "../components/shared/PublicGamesBrowser";
import { SoloGameCard, type SoloGameDef } from "../components/shared/SoloGameCard";
import { PlayerAvatar } from "../components/shared/PlayerAvatar";
import { encodeAvatar, useStoredAvatar } from "../lib/avatar";
import { useAvatarSync } from "../hooks/useAvatars";
import { GameIcon } from "../components/shared/GameIcon";
import { type HomeRouteGame } from "../lib/home-route-highlight";
import { useHomePage } from "../hooks/useHomePage";

const ImposterDemo = lazy(() => import("../components/demos/ImposterDemo").then(({ ImposterDemo }) => ({ default: ImposterDemo })));
const PasswordDemo = lazy(() => import("../components/demos/PasswordDemo").then(({ PasswordDemo }) => ({ default: PasswordDemo })));
const ChainDemo = lazy(() => import("../components/demos/ChainDemo").then(({ ChainDemo }) => ({ default: ChainDemo })));
const ShadeDemo = lazy(() => import("../components/demos/ShadeDemo").then(({ ShadeDemo }) => ({ default: ShadeDemo })));
const LocationDemo = lazy(() => import("../components/demos/LocationDemo").then(({ LocationDemo }) => ({ default: LocationDemo })));
const AvatarPickerModal = lazy(() =>
  import("../components/shared/AvatarPickerModal").then(({ AvatarPickerModal }) => ({ default: AvatarPickerModal }))
);
const ShikakuDemo = lazy(() => import("../components/demos/ShikakuDemo").then(({ ShikakuDemo }) => ({ default: ShikakuDemo })));
const PipsDemo = lazy(() => import("../components/demos/PipsDemo").then(({ PipsDemo }) => ({ default: PipsDemo })));

const isDev = import.meta.env.DEV;
const SHADE_PREVIEW_CELLS = Array.from({ length: 20 }, (_, index) => ({
  id: `shade-preview-${index}`,
  hue: index * 18,
  lightness: 45 + (index % 3) * 10,
}));
const GAME_CARD_COUNT = 6;
const GAME_CARD_DOTS = Array.from({ length: GAME_CARD_COUNT }, (_, index) => ({
  id: `game-card-dot-${index}`,
  index,
}));

/* ── Solo game definitions ────────────────────────────────────── */
const shikakuMeta = GAME_META.shikaku;
const pipsMeta = GAME_META.pips;
const NEW_GAME_ISSUE_URL = "https://github.com/oyuh/games/issues/new?template=new-game.md&title=%5BNew%20Game%5D%20";

function SoloPipsFace({ value }: { value: number }) {
  return (
    <span className={`solo-pips-face solo-pips-face--${value}`}>
      {Array.from({ length: value }, (_, index) => (
        <span key={index} className="solo-pips-dot" />
      ))}
    </span>
  );
}

const SOLO_GAMES: SoloGameDef[] = [
  {
    id: "shikaku", gameSlug: "shikaku", title: shikakuMeta.title,
    demoId: "shikaku",
    description: shikakuMeta.shortDescription,
    accent: shikakuMeta.accent,
    href: "/shikaku",
    preview: (
      <div className="solo-preview-shikaku">
        {/* 4×4 grid with number hints and filled rectangles */}
        <div className="solo-shikaku-cell solo-shikaku-cell--filled-a" />
        <div className="solo-shikaku-cell solo-shikaku-cell--filled-a" />
        <div className="solo-shikaku-cell solo-shikaku-num">4</div>
        <div className="solo-shikaku-cell solo-shikaku-cell--filled-b" />
        <div className="solo-shikaku-cell solo-shikaku-cell--filled-a" />
        <div className="solo-shikaku-cell solo-shikaku-cell--filled-a" />
        <div className="solo-shikaku-cell" />
        <div className="solo-shikaku-cell solo-shikaku-cell--filled-b" />
        <div className="solo-shikaku-cell solo-shikaku-num">6</div>
        <div className="solo-shikaku-cell" />
        <div className="solo-shikaku-cell" />
        <div className="solo-shikaku-cell solo-shikaku-cell--filled-b" />
        <div className="solo-shikaku-cell" />
        <div className="solo-shikaku-cell" />
        <div className="solo-shikaku-cell solo-shikaku-num">2</div>
        <div className="solo-shikaku-cell solo-shikaku-cell--filled-b" />
      </div>
    ),
  },
  {
    id: "pips", gameSlug: "pips", title: pipsMeta.title,
    demoId: "pips",
    description: pipsMeta.shortDescription,
    accent: pipsMeta.accent,
    href: "/pips",
    preview: (
      <div className="solo-preview-pips">
        <div className="solo-pips-board" aria-hidden="true">
          <span className="solo-pips-cell solo-pips-cell--rose" />
          <span className="solo-pips-cell solo-pips-cell--rose" />
          <span className="solo-pips-cell solo-pips-cell--cyan" />
          <span className="solo-pips-cell solo-pips-cell--amber" />
          <span className="solo-pips-rule"><span>6</span></span>
          <span className="solo-pips-domino solo-pips-domino--board">
            <span className="solo-pips-half"><SoloPipsFace value={2} /></span>
            <span className="solo-pips-half"><SoloPipsFace value={4} /></span>
          </span>
        </div>
      </div>
    ),
  },
  {
    id: "nexus", title: "Coming Soon!",
    description: "Submit a suggestion for a new game! or create it yourself!",
    accent: "#38bdf8",
    href: NEW_GAME_ISSUE_URL,
    actionLabel: "Suggest a new game",
    comingSoon: true,
    preview: (
      <div className="solo-preview-suggestion" aria-hidden="true">
        <div className="solo-suggestion-doc">
          <span className="solo-suggestion-title-line" />
          <span className="solo-suggestion-line solo-suggestion-line--one" />
          <span className="solo-suggestion-line solo-suggestion-line--two" />
          <span className="solo-suggestion-line solo-suggestion-line--three" />
          <span className="solo-suggestion-check-row">
            <span className="solo-suggestion-check" />
            <span className="solo-suggestion-short-line" />
          </span>
        </div>
      </div>
    ),
  },
];

function formatClueVisibility(value: number) {
  if (value <= 0) return "No hints";
  if (value >= 1) return "Full clues";
  return `${Math.round(value * 100)}% shown`;
}

/* ── Create-game settings, in the single-player menu's language ──
   The same segmented pickers Pips and Shikaku use, in the card's own
   accent. Anything with a handful of choices is a picker; Category has
   fifteen, so it stays a select dressed as one of the same controls. */

/** Builds a picker's segments. `title` is the hover and screen-reader name,
 *  `label` the couple of characters that have to fit in a 320px card. */
function pickerOptions<T extends string | number>(
  values: readonly T[],
  title: (value: T) => string,
  label: (value: T) => string = String,
): SoloSetupOption[] {
  return values.map((value) => ({
    value: String(value),
    label: label(value),
    title: title(value),
    accent: "var(--card-accent)",
  }));
}

function CardPicker({ label, hint, value, options, onChange }: {
  label: string;
  /** The tooltip that used to hang off the select's label. */
  hint: string;
  value: string | number;
  options: SoloSetupOption[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="hc-setup-field">
      <span className="hc-config-label" data-tooltip={hint} data-tooltip-variant="info">{label}</span>
      <Segmented row={{ label, value: String(value), options, onChange }} />
    </div>
  );
}

function CardCategory({ id, hint, value, categories, labels, onChange }: {
  id: string;
  hint: string;
  value: string;
  categories: readonly string[];
  labels: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="hc-setup-field">
      <label htmlFor={id} className="hc-config-label" data-tooltip={hint} data-tooltip-variant="info">Category</label>
      <Select
        id={id}
        label="Category"
        value={value}
        onChange={onChange}
        icon={<FiBookOpen size={14} aria-hidden="true" />}
        options={categories.map((key) => ({ value: key, label: labels[key] ?? key }))}
      />
    </div>
  );
}

type SummaryItem = { value: string; icon: IconType; label?: string; accent?: string };

function ConfigSummary({ items }: { items: SummaryItem[] }) {
  return (
    <div className="hc-summary" aria-label="Selected options">
      <div className="hc-summary-row">
        {items.map((item) => (
          <span
            key={`${item.label ?? item.value}-${item.value}`}
            className="hc-summary-pill"
            title={item.label ?? item.value}
            aria-label={item.label ?? item.value}
            data-tooltip={item.label ?? item.value}
            data-tooltip-variant="info"
            style={item.accent ? { borderColor: item.accent, color: item.accent } : undefined}
          >
            <item.icon size={14} />
            <span className="hc-summary-pill-value">{item.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function SyncMiniSpinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`hc-sync-mini-spinner${className ? ` ${className}` : ""}`}
      role="status"
      aria-label="Sync server connecting"
    />
  );
}

/**
 * A game card's heading. The how-to moved up here off the action row: it is
 * about the game, not about starting one, and the row below is now a single
 * button that should stay a single button.
 */
function CardTitle({
  title,
  compact,
  demo,
  onDemo,
}: {
  title: string;
  compact: boolean;
  demo: string;
  onDemo: (demo: string) => void;
}) {
  return (
    <div className="hc-title-row">
      <h2 className={`hc-game-title-lg${compact ? " hc-game-title-lg--compact" : ""}`}>{title}</h2>
      <button
        type="button"
        className="hc-title-help"
        onClick={() => onDemo(demo)}
        aria-label={`How to play ${title}`}
        data-tooltip="How to play"
        data-tooltip-variant="info"
      >
        <FiHelpCircle size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * The bottom of a game card: one big button that starts a game, and a quiet
 * line under it that swaps the card over to whatever is already running.
 * Making a game is what people came to do, so it gets the whole width; joining
 * one somebody else made is the other thing, so it gets a line.
 */
function CardCreate({
  onCreate,
  onBrowse,
  count,
  syncOffline,
  syncPending,
  syncAttention,
  syncStatusTooltip,
}: {
  onCreate: () => void;
  onBrowse: () => void;
  count: number;
  syncOffline: boolean;
  syncPending: boolean;
  syncAttention: boolean;
  syncStatusTooltip: string | undefined;
}) {
  const live = !syncOffline && count > 0;

  return (
    <div className="hc-create">
      <button type="button" className="btn btn-primary hc-create-btn" onClick={onCreate}>
        Create Game
      </button>

      <button
        type="button"
        className={`hc-public-toggle${live ? " is-live" : ""}${syncOffline ? " hc-sync-pending-control" : ""}${syncAttention ? " hc-sync-unavailable-control" : ""}`}
        onClick={onBrowse}
        data-tooltip={syncStatusTooltip}
        data-tooltip-variant="info"
      >
        {syncPending ? <SyncMiniSpinner /> : syncAttention ? <FiWifiOff size={12} /> : <FiGlobe size={12} />}
        <span>{live ? `${count} public game${count === 1 ? "" : "s"}` : "Browse public games"}</span>
        <FiChevronRight size={12} aria-hidden="true" />
      </button>
    </div>
  );
}

function HomePageDesktop({ sessionId }: { sessionId: string }) {

  const {
    zero, navigate,
    name, setName, savedName, firstVisit, nameInputRef,
    activeRouteHighlight,
    recentGames, setRecentGames, joinCode, setJoinCode, joinRejected, pendingAction,
    showInSessionModal, setShowInSessionModal,
    joiningFromOtherGame, pendingJoinTarget, setPendingJoinTarget, setPendingAction,
    imposterPublicCount, passwordPublicCount, chainPublicCount, shadePublicCount, locationPublicCount,
    imposterCategory, setImposterCategory, imposterImposters, setImposterImposters,
    imposterRounds, setImposterRounds, imposterClueVisibility, setImposterClueVisibility,
    passwordCategory, setPasswordCategory, passwordTeams, setPasswordTeams,
    passwordTargetScore, setPasswordTargetScore,
    chainCategory, setChainCategory, chainLength, setChainLength,
    chainRounds, setChainRounds, chainMode, setChainMode,
    shadeRoundsPerPlayer, setShadeRoundsPerPlayer, shadeHardMode, setShadeHardMode,
    shadeLeaderPick, setShadeLeaderPick,
    locCluePairs, setLocCluePairs, locRoundsPerPlayer, setLocRoundsPerPlayer,
    saveName, joinAny, confirmLeaveAndJoin,
    createImposter, createPassword, createChainReaction, createShadeSignal, createLocationSignal,
    firstVisitGlowClass, dimmedClass, routeHighlightClass,
  } = useHomePage(sessionId);

  /* ponytail: these four are hardcoded, so every branch that reads them takes
     the same path every render. Left as-is to keep this a pure refactor; worth
     either wiring to real sync state or deleting the dead branches. */
  const syncOffline = false;
  const syncPending = false;
  const syncAttention = false;
  const syncStatusTooltip = "Browse Public Games";

  /* A full code that hasn't already been turned away. Off, the join field is
     just a text box again, which is the only way to click into a full code and
     fix a character. */
  const joinReady = joinCode.length === 6 && !joinRejected && pendingAction === null;

  /* Desktop-only layout state: five separate accordion/browser toggles and a
     horizontal scroll position with dot indicators. Mobile uses one key each. */
  const [imposterExpanded, setImposterExpanded] = useState(false);
  const [passwordExpanded, setPasswordExpanded] = useState(false);
  const [chainExpanded, setChainExpanded] = useState(false);
  const [shadeExpanded, setShadeExpanded] = useState(false);
  const [locationExpanded, setLocationExpanded] = useState(false);
  const [imposterBrowsing, setImposterBrowsing] = useState(false);
  const [passwordBrowsing, setPasswordBrowsing] = useState(false);
  const [chainBrowsing, setChainBrowsing] = useState(false);
  const [shadeBrowsing, setShadeBrowsing] = useState(false);
  const [locationBrowsing, setLocationBrowsing] = useState(false);
  const [activeDemo, setActiveDemo] = useState<string | null>(null);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  // The home card is the only place an avatar can be changed, so this is the
  // one place that has to push it up to the session row.
  useAvatarSync(zero, sessionId, encodeAvatar(useStoredAvatar()));
  const [recentCollapsed, setRecentCollapsed] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeDot, setActiveDot] = useState(0);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setActiveDot(Math.min(idx, GAME_CARD_COUNT - 1));
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  useEffect(() => {
    if (!activeRouteHighlight) return;
    const animationFrame = window.requestAnimationFrame(() => {
      const card = scrollRef.current?.querySelector<HTMLElement>(`[data-home-game-card="${activeRouteHighlight}"]`);
      card?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [activeRouteHighlight]);

  return (
    <>
    <ActiveGameModal sessionId={sessionId} suppress={pendingAction !== null} />
    <div className="home-cards" ref={scrollRef}>
      <div className="home-layout">

      {/* ── Multiplayer section ─────────────────────────────── */}
      <div className="home-section-multi">

      {/* ── Card 1: Utils ──────────────────────────────────── */}
      <div className={`home-card home-card--utils${firstVisitGlowClass}`}>
        <div className="home-card-body">
          {/* Join section */}
          <section className="hc-section">
            <h3 className="hc-label" data-tooltip="Enter a 6-character room code to join a friend's game" data-tooltip-variant="info">
              <FiSearch size={14} /> Join Game
              {syncPending && <SyncMiniSpinner className="hc-sync-mini-spinner--label" />}
              {syncAttention && <FiWifiOff className="hc-sync-offline-icon hc-sync-offline-icon--label" size={14} />}
            </h3>
            <form
              className="hc-row hc-join-form"
              onSubmit={(e) => { e.preventDefault(); if (joinReady) void joinAny(); }}
            >
              <input
                className={`input flex-1 hc-join-input${joinReady ? " hc-join-input--ready" : ""}`}
                value={joinCode}
                onChange={(e) =>
                  setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))
                }
                onClick={() => { if (joinReady) void joinAny(); }}
                placeholder="ABCXYZ"
                maxLength={6}
                disabled={pendingAction === "join"}
                data-tooltip={syncOffline ? syncStatusTooltip : joinReady ? "Click or press Enter to join!" : joinRejected ? "That code didn't get you in - edit it to try again" : "Paste or type a 6-letter code"}
                data-tooltip-variant={joinReady && !syncOffline ? "success" : "info"}
              />
              {joinReady && (
                <button type="submit" className="hc-join-go" tabIndex={-1} aria-label="Join game">
                  <FiArrowRight size={18} aria-hidden="true" />
                </button>
              )}
            </form>
            <div className="hc-divider" />
          </section>
          {/* Name section - inline editable */}
          <section className="hc-section">
            <h3 className="hc-label" data-tooltip="Your in-game identity - visible to other players" data-tooltip-variant="info">
              <FiUserCheck size={14} /> Display
            </h3>
            {/* Sits directly on the field it is about, and points at it. A
                banner at the top of the card named something two sections
                down, which told you nothing about what to actually do. */}
            {firstVisit && (
              <div className="hc-first-visit-hint">
                <span className="hc-first-visit-hint-icon">
                  <FiArrowDown size={15} aria-hidden="true" />
                </span>
                <div className="hc-first-visit-hint-text">
                  <strong>Type a name here</strong>
                  <span>Or skip it, you get a random one and can change it later.</span>
                </div>
              </div>
            )}
            <div className="hc-identity-row">
              {/* Its own tile beside the name field, not inside it: the avatar
                  and the name are two different things to change. */}
              <button
                className="hc-avatar-btn"
                type="button"
                aria-label="Change your avatar"
                data-tooltip="Change avatar"
                data-tooltip-variant="info"
                onClick={() => setAvatarPickerOpen(true)}
              >
                <PlayerAvatar seed={sessionId} />
                <span className="hc-avatar-pencil" aria-hidden="true"><FiEdit2 size={14} /></span>
              </button>
              <div className="hc-name-display" title="Click to edit your name" data-tooltip-variant="info">
              <input
                className="hc-name-inline-input"
                ref={nameInputRef}
                value={name}
                onChange={(e) => setName(e.target.value.replace(/\s/g, ""))}
                onBlur={(e) => { void saveName({ preventDefault: () => {} } as FormEvent); }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setName(savedName);
                    e.currentTarget.blur();
                  } else if (e.key === "Enter") {
                    e.currentTarget.blur();
                  }
                }}
                placeholder="Enter name…"
                maxLength={32}
              />
              <FiEdit2 className="hc-name-edit-icon" size={14} />
              </div>
            </div>
          </section>

          {/* Recent games - collapsible */}
          {recentGames.length > 0 && (
            <>
              <div className={`hc-divider hc-recent-divider${!recentCollapsed ? " hc-recent-divider--open" : ""}`} />
              <section className={`hc-section hc-recent-section${!recentCollapsed ? " hc-recent-section--open" : ""}`}>
                <div className="hc-recent-header">
                  <button className={`hc-collapse-toggle${recentCollapsed ? " hc-collapse-toggle--collapsed" : " hc-collapse-toggle--open"}`} onClick={() => setRecentCollapsed(!recentCollapsed)}>
                    <span className={`hc-label${recentCollapsed ? "" : " hc-label--recent-open"}`} data-tooltip="Games you've recently played or joined" data-tooltip-variant="info">
                      {recentCollapsed ? "Recent Games" : "Recents"} ({recentGames.length})
                    </span>
                    <FiChevronDown size={recentCollapsed ? 18 : 14} className={`hc-collapse-icon${!recentCollapsed ? " hc-collapse-icon--open" : ""}${recentCollapsed ? " hc-collapse-icon--collapsed" : ""}`} />
                  </button>
                  {!recentCollapsed && (
                    <ClearRecentButton onClear={() => { clearRecentGames(); setRecentGames([]); }} />
                  )}
                </div>
                {!recentCollapsed && (
                  <div className="hc-recent-list hc-recent-list--scrollable">
                    {recentGames.map((game) => (
                      <RecentGameItem
                        key={`${game.gameType}-${game.id}`}
                        game={game}
                        sessionId={sessionId}
                        onRemove={() => {
                          removeRecentGame(game.id, game.gameType);
                          setRecentGames(getRecentGames());
                        }}
                      />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {/* Dev-only: demo games
          {isDev && (
            <>
              <div className="hc-divider" />
              <section className="hc-section">
                <h3 className="hc-label">Dev: Demo Games</h3>
                <div className="hc-demo-grid">
                  <button disabled className="btn btn-muted hc-demo-btn" onClick={() => void createDemoImposter("lobby")}>
                    Imp Lobby
                  </button>
                  <button disabled className="btn btn-muted hc-demo-btn" onClick={() => void createDemoImposter("playing")}>
                    Imp Play
                  </button>
                  <button disabled className="btn btn-muted hc-demo-btn" onClick={() => void createDemoImposter("voting")}>
                    Imp Vote
                  </button>
                  <button disabled className="btn btn-muted hc-demo-btn" onClick={() => void createDemoImposter("results")}>
                    Imp Results
                  </button>
                  <button disabled className="btn btn-muted hc-demo-btn" onClick={() => void createDemoPassword("lobby")}>
                    Pwd Lobby
                  </button>
                  <button disabled className="btn btn-muted hc-demo-btn" onClick={() => void createDemoPassword("playing")}>
                    Pwd Play
                  </button>
                  <button disabled className="btn btn-muted hc-demo-btn" onClick={() => void createDemoPassword("results")}>
                    Pwd Results
                  </button>
                  <button disabled className="btn btn-muted hc-demo-btn" onClick={() => void createDemoChainReaction("lobby")}>
                    CR Lobby
                  </button>
                  <button disabled className="btn btn-muted hc-demo-btn" onClick={() => void createDemoChainReaction("submitting")}>
                    CR Submit
                  </button>
                  <button disabled className="btn btn-muted hc-demo-btn" onClick={() => void createDemoChainReaction("playing")}>
                    CR Play
                  </button>
                  <button disabled className="btn btn-muted hc-demo-btn" onClick={() => void createDemoChainReaction("finished")}>
                    CR Finish
                  </button>
                  <button disabled className="btn btn-muted hc-demo-btn" onClick={() => void createDemoShadeSignal("lobby")}>
                    SS Lobby
                  </button>
                  <button disabled className="btn btn-muted hc-demo-btn" onClick={() => void createDemoShadeSignal("clue1")}>
                    SS Clue
                  </button>
                  <button disabled className="btn btn-muted hc-demo-btn" onClick={() => void createDemoShadeSignal("guess1")}>
                    SS Guess
                  </button>
                  <button disabled className="btn btn-muted hc-demo-btn" onClick={() => void createDemoShadeSignal("reveal")}>
                    SS Reveal
                  </button>
                  <button disabled className="btn btn-muted hc-demo-btn" onClick={() => void createDemoLocationSignal("lobby")}>
                    LS Lobby
                  </button>
                  <button disabled className="btn btn-muted hc-demo-btn" onClick={() => void createDemoLocationSignal("picking")}>
                    LS Pick
                  </button>
                  <button disabled className="btn btn-muted hc-demo-btn" onClick={() => void createDemoLocationSignal("clue1")}>
                    LS Clue
                  </button>
                  <button disabled className="btn btn-muted hc-demo-btn" onClick={() => void createDemoLocationSignal("guess1")}>
                    LS Guess
                  </button>
                  <button disabled className="btn btn-muted hc-demo-btn" onClick={() => void createDemoLocationSignal("reveal")}>
                    LS Reveal
                  </button>
                </div>
              </section>
            </>
          )} */}
        </div>
      </div>

      {/* ── Card 2: Imposter ───────────────────────────────── */}
      <div
        className={`home-card home-card--imposter${dimmedClass("imposter")}${routeHighlightClass("imposter")}`}
        data-home-game-card="imposter"
      >
        <div className="home-card-body hc-centered">
          <CardTitle title="Imposter" compact={imposterExpanded || imposterBrowsing} demo="imposter" onDemo={setActiveDemo} />

          {imposterBrowsing ? (
            <div className="hc-card-anim" key="browse">
              <PublicGamesList gameType="imposter" sessionId={sessionId} />
            </div>
          ) : imposterExpanded ? (
            <div className="hc-card-anim" key="config">
              <div className="hc-setup">
                <CardCategory
                  id="home-imposter-category"
                  hint="The theme for the word list. Everyone gets a word from this category - except the imposter."
                  value={imposterCategory}
                  categories={imposterCategories as string[]}
                  labels={imposterCategoryLabels}
                  onChange={setImposterCategory}
                />
                <CardPicker
                  label="Imposters"
                  hint="How many players are secretly the imposter each round. More imposters = harder for the group."
                  value={imposterImposters}
                  onChange={(v) => setImposterImposters(Number(v))}
                  options={pickerOptions([1, 2, 3], (n) => `${n} imposter${n === 1 ? "" : "s"}`)}
                />
                <CardPicker
                  label="Rounds"
                  hint="How many rounds to play. Each round, a new imposter is chosen and everyone votes."
                  value={imposterRounds}
                  onChange={(v) => setImposterRounds(Number(v))}
                  options={pickerOptions([1, 2, 3, 5, 7, 10], (n) => `${n} round${n === 1 ? "" : "s"}`)}
                />
                <CardPicker
                  label="Hint Visibility"
                  hint="How much of submitted clues the imposter can peek at before sending their clue."
                  value={imposterClueVisibility}
                  onChange={(v) => setImposterClueVisibility(Number(v))}
                  options={pickerOptions(
                    IMPOSTER_CLUE_VISIBILITY_OPTIONS,
                    formatClueVisibility,
                    (v) => (v <= 0 ? "None" : v >= 1 ? "All" : `${Math.round(v * 100)}%`),
                  )}
                />
              </div>
            </div>
          ) : (
            <div className="hc-card-anim" key="default">
              <p className="hc-game-desc">Find the liar. Give clues. Vote them out.</p>
              <div className="hc-coming-preview">
                <div className="hc-mini-board">
                  <div className="hc-mini-board-header hc-mini-board-header--imposter">
                    <span>Secret Word: DOG</span>
                  </div>
                  <div className="hc-mini-board-rows">
                    <div className="hc-mini-row">
                      <span className="hc-mini-avatar hc-mini-avatar--imposter">A</span>
                      <span className="hc-mini-clue">"Fluffy"</span>
                      <span className="hc-mini-badge hc-mini-badge--ok">✓</span>
                    </div>
                    <div className="hc-mini-row">
                      <span className="hc-mini-avatar hc-mini-avatar--imposter">B</span>
                      <span className="hc-mini-clue">"Loyal"</span>
                      <span className="hc-mini-badge hc-mini-badge--ok">✓</span>
                    </div>
                    <div className="hc-mini-row hc-mini-row--suspect">
                      <span className="hc-mini-avatar hc-mini-avatar--suspect">C</span>
                      <span className="hc-mini-clue hc-mini-clue--wrong">&quot;Meow?&quot;</span>
                      <span className="hc-mini-badge hc-mini-badge--wrong">Wrong</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="hc-game-actions">
            {imposterExpanded && !imposterBrowsing && (
              <ConfigSummary
                items={[
                  { value: imposterCategoryLabels[imposterCategory] ?? imposterCategory, icon: FiBookOpen, accent: "var(--card-accent)", label: "Category" },
                  { value: `${imposterImposters}×`, icon: FiUserCheck, label: "Imposters" },
                  { value: `${imposterRounds}r`, icon: FiClock, label: "Rounds" },
                  { value: formatClueVisibility(imposterClueVisibility).replace(" shown", ""), icon: FiSliders, label: "Hint visibility" }
                ]}
              />
            )}
            {imposterBrowsing ? (
              <div className="hc-row hc-browse-back-row">
                <button className="btn btn-muted hc-config-back-btn" aria-label="Back to Imposter options" data-tooltip="Back" data-tooltip-variant="info" onClick={() => setImposterBrowsing(false)}>
                  <FiArrowLeft size={18} aria-hidden="true" />
                </button>
              </div>
            ) : !imposterExpanded ? (
              <CardCreate
                onCreate={() => setImposterExpanded(true)}
                onBrowse={() => { setImposterExpanded(false); setImposterBrowsing(true); }}
                count={imposterPublicCount}
                syncOffline={syncOffline}
                syncPending={syncPending}
                syncAttention={syncAttention}
                syncStatusTooltip={syncStatusTooltip}
              />
            ) : (
              <div className="hc-row hc-create-action-row">
                <button className="btn btn-muted hc-config-back-btn" aria-label="Back to Imposter preview" data-tooltip="Back" data-tooltip-variant="info" onClick={() => setImposterExpanded(false)}>
                  <FiArrowLeft size={18} aria-hidden="true" />
                </button>
                <button
                  className="btn btn-primary flex-1 hc-create-it-btn"
                  onClick={() => void createImposter()}
                  disabled={pendingAction !== null}
                  data-creating={pendingAction === "create-imposter" ? "true" : "false"}
                  data-tooltip={syncOffline ? syncStatusTooltip : undefined}
                  data-tooltip-variant="info"
                >
                  {pendingAction === "create-imposter" ? "Creating…" : (
                    <span className="hc-sync-button-content">
                      Create It!
                      {syncPending && <SyncMiniSpinner />}
                      {syncAttention && <FiWifiOff className="hc-sync-offline-icon" size={16} />}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Card 3: Password ───────────────────────────────── */}
      <div
        className={`home-card home-card--password${dimmedClass("password")}${routeHighlightClass("password")}`}
        data-home-game-card="password"
      >
        <div className="home-card-body hc-centered">
          <CardTitle title="Password" compact={passwordExpanded || passwordBrowsing} demo="password" onDemo={setActiveDemo} />

          {passwordBrowsing ? (
            <div className="hc-card-anim" key="browse">
              <PublicGamesList gameType="password" sessionId={sessionId} />
            </div>
          ) : passwordExpanded ? (
            <div className="hc-card-anim" key="config">
              <div className="hc-setup">
                <CardCategory
                  id="home-password-category"
                  hint="The theme for the word list. Words will be drawn from this category."
                  value={passwordCategory}
                  categories={passwordCategories as string[]}
                  labels={passwordCategoryLabels}
                  onChange={setPasswordCategory}
                />
                <CardPicker
                  label="Teams"
                  hint="Split players into this many teams. Teams take turns giving and guessing clues."
                  value={passwordTeams}
                  onChange={(v) => setPasswordTeams(Number(v))}
                  options={pickerOptions([2, 3, 4, 5, 6], (n) => `${n} teams`)}
                />
                <CardPicker
                  label="Target Score"
                  hint="The score a team needs to win. Higher = longer game."
                  value={passwordTargetScore}
                  onChange={(v) => setPasswordTargetScore(Number(v))}
                  options={pickerOptions([3, 5, 7, 10, 15, 20], (n) => `First to ${n} points`)}
                />
              </div>
            </div>
          ) : (
            <div className="hc-card-anim" key="default">
              <p className="hc-game-desc">One-word clues. Team guessing. First to target wins.</p>
              <div className="hc-coming-preview">
                <div className="hc-pw-preview">
                  <div className="hc-pw-teams">
                    <div className="hc-pw-team hc-pw-team--red">
                      <span className="hc-pw-team-name">Red</span>
                      <span className="hc-pw-team-score">2</span>
                    </div>
                    <span className="hc-pw-vs">vs</span>
                    <div className="hc-pw-team hc-pw-team--blue">
                      <span className="hc-pw-team-name">Blue</span>
                      <span className="hc-pw-team-score">1</span>
                    </div>
                  </div>
                  <div className="hc-pw-word">
                    <span className="hc-pw-word-label">Target</span>
                    <span className="hc-pw-letter">O</span>
                    <span className="hc-pw-letter">C</span>
                    <span className="hc-pw-letter">E</span>
                    <span className="hc-pw-letter">A</span>
                    <span className="hc-pw-letter">N</span>
                  </div>
                  <div className="hc-pw-flow">
                    <span className="hc-pw-flow-clue">"Waves"</span>
                    <span className="hc-pw-flow-arrow">→</span>
                    <span className="hc-pw-flow-guess">OCEAN</span>
                    <span className="hc-pw-flow-result">✓</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="hc-game-actions">
            {passwordExpanded && !passwordBrowsing && (
              <ConfigSummary
                items={[
                  { value: passwordCategoryLabels[passwordCategory] ?? passwordCategory, icon: FiBookOpen, accent: "var(--card-accent)", label: "Category" },
                  { value: `${passwordTeams}t`, icon: FiUsers, label: "Teams" },
                  { value: `${passwordTargetScore}pts`, icon: FiTarget, label: "Target score" }
                ]}
              />
            )}
            {passwordBrowsing ? (
              <div className="hc-row hc-browse-back-row">
                <button className="btn btn-muted hc-config-back-btn" aria-label="Back to Password options" data-tooltip="Back" data-tooltip-variant="info" onClick={() => setPasswordBrowsing(false)}>
                  <FiArrowLeft size={18} aria-hidden="true" />
                </button>
              </div>
            ) : !passwordExpanded ? (
              <CardCreate
                onCreate={() => setPasswordExpanded(true)}
                onBrowse={() => { setPasswordExpanded(false); setPasswordBrowsing(true); }}
                count={passwordPublicCount}
                syncOffline={syncOffline}
                syncPending={syncPending}
                syncAttention={syncAttention}
                syncStatusTooltip={syncStatusTooltip}
              />
            ) : (
              <div className="hc-row hc-create-action-row">
                <button className="btn btn-muted hc-config-back-btn" aria-label="Back to Password preview" data-tooltip="Back" data-tooltip-variant="info" onClick={() => setPasswordExpanded(false)}>
                  <FiArrowLeft size={18} aria-hidden="true" />
                </button>
                <button
                  className="btn btn-primary flex-1 hc-create-it-btn"
                  onClick={() => void createPassword()}
                  disabled={pendingAction !== null}
                  data-creating={pendingAction === "create-password" ? "true" : "false"}
                  data-tooltip={syncOffline ? syncStatusTooltip : undefined}
                  data-tooltip-variant="info"
                >
                  {pendingAction === "create-password" ? "Creating…" : (
                    <span className="hc-sync-button-content">
                      Create It!
                      {syncPending && <SyncMiniSpinner />}
                      {syncAttention && <FiWifiOff className="hc-sync-offline-icon" size={16} />}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Card 4: Chain Reaction ─────────────────────────── */}
      <div
        className={`home-card home-card--chain${dimmedClass("chain")}${routeHighlightClass("chain")}`}
        data-home-game-card="chain"
      >
        <div className="home-card-body hc-centered">
          <CardTitle title="Chain Reaction" compact={chainExpanded || chainBrowsing} demo="chain" onDemo={setActiveDemo} />

          {chainBrowsing ? (
            <div className="hc-card-anim" key="browse">
              <PublicGamesList gameType="chain_reaction" sessionId={sessionId} />
            </div>
          ) : chainExpanded ? (
            <div className="hc-card-anim" key="config">
              <div className="hc-setup">
                <CardCategory
                  id="home-chain-category"
                  hint="The theme for the word chains. Chains will be drawn from this category."
                  value={chainCategory}
                  categories={chainCategories as string[]}
                  labels={chainCategoryLabels}
                  onChange={setChainCategory}
                />
                <CardPicker
                  label="Length"
                  hint="How many words in the chain. Each word links to the next - longer chains are harder!"
                  value={chainLength}
                  onChange={(v) => setChainLength(Number(v))}
                  options={pickerOptions([5, 6, 7, 8, 9, 10], (n) => `${n} words`)}
                />
                <CardPicker
                  label="Rounds"
                  hint="How many chains to play. Each round is a fresh chain for both players."
                  value={chainRounds}
                  onChange={(v) => setChainRounds(Number(v))}
                  options={pickerOptions([1, 2, 3, 5, 7], (n) => `${n} round${n === 1 ? "" : "s"}`)}
                />
                <CardPicker
                  label="Mode"
                  hint="Random uses pre-made chains. Custom lets both players write their own chain for the other to solve."
                  value={chainMode}
                  onChange={(v) => setChainMode(v as "premade" | "custom")}
                  options={pickerOptions(
                    ["premade", "custom"] as const,
                    (mode) => (mode === "premade" ? "Random, from a premade chain" : "Custom, write your own chain"),
                    (mode) => (mode === "premade" ? "Random" : "Custom"),
                  )}
                />
              </div>
            </div>
          ) : (
            <div className="hc-card-anim" key="default">
              <p className="hc-game-desc">Race to solve a chain of linked words.</p>
              <div className="hc-coming-preview">
                <div className="hc-chain-example">
                  <span className="hc-chain-word hc-chain-word--revealed">FIRE</span>
                  <span className="hc-chain-word hc-chain-word--wrong">SMOKE ✕</span>
                  <span className="hc-chain-word hc-chain-word--wrong">SPARK ✕</span>
                  <span className="hc-chain-word hc-chain-word--hidden">_ _ _ _</span>
                  <span className="hc-chain-word hc-chain-word--revealed">LANGUAGE</span>
                </div>
              </div>
            </div>
          )}

          <div className="hc-game-actions">
            {chainExpanded && !chainBrowsing && (
              <ConfigSummary
                items={[
                  { value: chainCategoryLabels[chainCategory] ?? chainCategory, icon: FiBookOpen, accent: "var(--card-accent)", label: "Category" },
                  { value: `${chainLength}w`, icon: FiList, label: "Chain length" },
                  { value: `${chainRounds}r`, icon: FiClock, label: "Rounds" },
                  { value: chainMode === "premade" ? "Rnd" : "Cstm", icon: FiSliders, label: "Mode" }
                ]}
              />
            )}
            {chainBrowsing ? (
              <div className="hc-row hc-browse-back-row">
                <button className="btn btn-muted hc-config-back-btn" aria-label="Back to Chain Reaction options" data-tooltip="Back" data-tooltip-variant="info" onClick={() => setChainBrowsing(false)}>
                  <FiArrowLeft size={18} aria-hidden="true" />
                </button>
              </div>
            ) : !chainExpanded ? (
              <CardCreate
                onCreate={() => setChainExpanded(true)}
                onBrowse={() => { setChainExpanded(false); setChainBrowsing(true); }}
                count={chainPublicCount}
                syncOffline={syncOffline}
                syncPending={syncPending}
                syncAttention={syncAttention}
                syncStatusTooltip={syncStatusTooltip}
              />
            ) : (
              <div className="hc-row hc-create-action-row">
                <button className="btn btn-muted hc-config-back-btn" aria-label="Back to Chain Reaction preview" data-tooltip="Back" data-tooltip-variant="info" onClick={() => setChainExpanded(false)}>
                  <FiArrowLeft size={18} aria-hidden="true" />
                </button>
                <button
                  className="btn btn-primary flex-1 hc-create-it-btn"
                  onClick={() => void createChainReaction()}
                  disabled={pendingAction !== null}
                  data-creating={pendingAction === "create-chain" ? "true" : "false"}
                  data-tooltip={syncOffline ? syncStatusTooltip : undefined}
                  data-tooltip-variant="info"
                >
                  {pendingAction === "create-chain" ? "Creating…" : (
                    <span className="hc-sync-button-content">
                      Create It!
                      {syncPending && <SyncMiniSpinner />}
                      {syncAttention && <FiWifiOff className="hc-sync-offline-icon" size={16} />}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Card 5: Shade Signal ──────────────────────────── */}
      <div
        className={`home-card home-card--shade${dimmedClass("shade")}${routeHighlightClass("shade")}`}
        data-home-game-card="shade"
      >
        <div className="home-card-body hc-centered">
          <CardTitle title="Shade Signal" compact={shadeExpanded || shadeBrowsing} demo="shade" onDemo={setActiveDemo} />

          {shadeBrowsing ? (
            <div className="hc-card-anim" key="browse">
              <PublicGamesList gameType="shade_signal" sessionId={sessionId} />
            </div>
          ) : shadeExpanded ? (
            <div className="hc-card-anim" key="config">
              <div className="hc-setup">
                <CardPicker
                  label="Game Length"
                  hint="Each player takes a turn as Leader. This controls how many turns each person gets, so more = longer game."
                  value={shadeRoundsPerPlayer}
                  onChange={(v) => setShadeRoundsPerPlayer(Number(v))}
                  options={pickerOptions(
                    [1, 2, 3],
                    (n) => `${n} turn${n === 1 ? "" : "s"} as Leader each`,
                    (n) => (n === 1 ? "Quick" : n === 2 ? "Standard" : "Long"),
                  )}
                />
                <CardPicker
                  label="Clue Rules"
                  hint={'Controls what the Leader can say in their clue. "No Colors" bans words like red, blue, green, etc.'}
                  value={shadeHardMode ? "yes" : "no"}
                  onChange={(v) => setShadeHardMode(v === "yes")}
                  options={pickerOptions(
                    ["no", "yes"] as const,
                    (v) => (v === "no" ? "Any clue goes" : "Color names are banned"),
                    (v) => (v === "no" ? "Normal" : "No Colors"),
                  )}
                />
                <CardPicker
                  label="Leader Color"
                  hint="Whether the Leader gets to choose the color everyone is hunting for, or is handed a random one."
                  value={shadeLeaderPick ? "yes" : "no"}
                  onChange={(v) => setShadeLeaderPick(v === "yes")}
                  options={pickerOptions(
                    ["no", "yes"] as const,
                    (v) => (v === "no" ? "The game picks the color" : "The Leader picks their own color"),
                    (v) => (v === "no" ? "Random" : "Leader picks"),
                  )}
                />
              </div>
            </div>
          ) : (
            <div className="hc-card-anim" key="default">
              <p className="hc-game-desc">One leader, one color. Give clues and guess the target shade.</p>
              <div className="hc-coming-preview">
                <div className="hc-shade-grid">
                  {SHADE_PREVIEW_CELLS.map((cell) => (
                    <div
                      key={cell.id}
                      className="hc-shade-cell"
                      style={{ background: `hsl(${cell.hue}, 60%, ${cell.lightness}%)` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="hc-game-actions">
            {shadeExpanded && !shadeBrowsing && (
              <ConfigSummary
                items={[
                  { value: shadeRoundsPerPlayer === 1 ? "Q" : shadeRoundsPerPlayer === 2 ? "Std" : "Long", icon: FiClock, label: `${shadeRoundsPerPlayer} turns each` },
                  { value: shadeHardMode ? "NoClr" : "Norm", icon: FiDroplet, label: "Clue rules" },
                  { value: shadeLeaderPick ? "Pick" : "Rand", icon: FiUserCheck, label: "Leader color" }
                ]}
              />
            )}
            {shadeBrowsing ? (
              <div className="hc-row hc-browse-back-row">
                <button className="btn btn-muted hc-config-back-btn" aria-label="Back to Shade Signal options" data-tooltip="Back" data-tooltip-variant="info" onClick={() => setShadeBrowsing(false)}>
                  <FiArrowLeft size={18} aria-hidden="true" />
                </button>
              </div>
            ) : !shadeExpanded ? (
              <CardCreate
                onCreate={() => setShadeExpanded(true)}
                onBrowse={() => { setShadeExpanded(false); setShadeBrowsing(true); }}
                count={shadePublicCount}
                syncOffline={syncOffline}
                syncPending={syncPending}
                syncAttention={syncAttention}
                syncStatusTooltip={syncStatusTooltip}
              />
            ) : (
              <div className="hc-row hc-create-action-row">
                <button className="btn btn-muted hc-config-back-btn" aria-label="Back to Shade Signal preview" data-tooltip="Back" data-tooltip-variant="info" onClick={() => setShadeExpanded(false)}>
                  <FiArrowLeft size={18} aria-hidden="true" />
                </button>
                <button
                  className="btn btn-primary flex-1 hc-create-it-btn"
                  onClick={() => void createShadeSignal()}
                  disabled={pendingAction !== null}
                  data-creating={pendingAction === "create-shade" ? "true" : "false"}
                  data-tooltip={syncOffline ? syncStatusTooltip : undefined}
                  data-tooltip-variant="info"
                >
                  {pendingAction === "create-shade" ? "Creating…" : (
                    <span className="hc-sync-button-content">
                      Create It!
                      {syncPending && <SyncMiniSpinner />}
                      {syncAttention && <FiWifiOff className="hc-sync-offline-icon" size={16} />}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Card 6: Location Signal ──────────────────────────── */}
      <div
        className={`home-card home-card--location${dimmedClass("location")}${routeHighlightClass("location")}`}
        data-home-game-card="location"
      >
        <div className="home-card-body hc-centered">
          <CardTitle title="Location Signal" compact={locationExpanded || locationBrowsing} demo="location" onDemo={setActiveDemo} />

          {locationBrowsing ? (
            <div className="hc-card-anim" key="browse">
              <PublicGamesList gameType="location_signal" sessionId={sessionId} />
            </div>
          ) : locationExpanded ? (
            <div className="hc-card-anim" key="config">
              <div className="hc-setup">
                <CardPicker
                  label="Clue Pairs"
                  hint="How many clue + guess pairs per round. More pairs means the leader gives more hints and guessers refine their answer."
                  value={locCluePairs}
                  onChange={(v) => setLocCluePairs(Number(v))}
                  options={pickerOptions([1, 2, 3, 4], (n) => `${n} clue and guess pair${n === 1 ? "" : "s"}`)}
                />
                <CardPicker
                  label="Rounds/Player"
                  hint="How many rounds each player leads. More rounds means a longer session."
                  value={locRoundsPerPlayer}
                  onChange={(v) => setLocRoundsPerPlayer(Number(v))}
                  options={pickerOptions([1, 2, 3], (n) => `${n} round${n === 1 ? "" : "s"} each`)}
                />
              </div>
            </div>
          ) : (
            <div className="hc-card-anim" key="default">
              <p className="hc-game-desc">Pick a spot on the globe. Give clues. Guess the location.</p>
              <div className="hc-coming-preview">
                <div className="hc-loc-preview" aria-hidden="true">
                  <div className="hc-loc-map-stage">
                    <div className="hc-loc-map-panel hc-loc-map-panel--america">
                      <span className="hc-loc-land hc-loc-land--north-america" />
                      <span className="hc-loc-land hc-loc-land--south-america" />
                      <span className="hc-loc-dot hc-loc-dot--america-a" />
                      <span className="hc-loc-dot hc-loc-dot--america-b" />
                      <span className="hc-loc-dot hc-loc-dot--america-c" />
                    </div>
                    <div className="hc-loc-map-panel hc-loc-map-panel--europe">
                      <span className="hc-loc-land hc-loc-land--europe-main" />
                      <span className="hc-loc-land hc-loc-land--europe-south" />
                      <span className="hc-loc-dot hc-loc-dot--europe-a" />
                      <span className="hc-loc-dot hc-loc-dot--europe-b" />
                      <span className="hc-loc-dot hc-loc-dot--europe-c" />
                    </div>
                    <div className="hc-loc-map-panel hc-loc-map-panel--asia">
                      <span className="hc-loc-land hc-loc-land--asia-main" />
                      <span className="hc-loc-land hc-loc-land--asia-islands" />
                      <span className="hc-loc-dot hc-loc-dot--asia-a" />
                      <span className="hc-loc-dot hc-loc-dot--asia-b" />
                      <span className="hc-loc-dot hc-loc-dot--asia-c" />
                    </div>
                  </div>
                  <div className="hc-loc-clues">
                    <span><strong>Clue 1:</strong> Here</span>
                    <span><strong>Clue 2:</strong> There</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="hc-game-actions">
            {locationExpanded && !locationBrowsing && (
              <ConfigSummary
                items={[
                  { value: `${locCluePairs}p`, icon: FiMapPin, label: "Clue pairs" },
                  { value: `${locRoundsPerPlayer}r`, icon: FiTarget, label: `${locRoundsPerPlayer === 1 ? "Quick" : locRoundsPerPlayer === 2 ? "Standard" : "Long"} session` }
                ]}
              />
            )}
            {locationBrowsing ? (
              <div className="hc-row hc-browse-back-row">
                <button className="btn btn-muted hc-config-back-btn" aria-label="Back to Location Signal options" data-tooltip="Back" data-tooltip-variant="info" onClick={() => setLocationBrowsing(false)}>
                  <FiArrowLeft size={18} aria-hidden="true" />
                </button>
              </div>
            ) : !locationExpanded ? (
              <CardCreate
                onCreate={() => setLocationExpanded(true)}
                onBrowse={() => { setLocationExpanded(false); setLocationBrowsing(true); }}
                count={locationPublicCount}
                syncOffline={syncOffline}
                syncPending={syncPending}
                syncAttention={syncAttention}
                syncStatusTooltip={syncStatusTooltip}
              />
            ) : (
              <div className="hc-row hc-create-action-row">
                <button className="btn btn-muted hc-config-back-btn" aria-label="Back to Location Signal preview" data-tooltip="Back" data-tooltip-variant="info" onClick={() => setLocationExpanded(false)}>
                  <FiArrowLeft size={18} aria-hidden="true" />
                </button>
                <button
                  className="btn btn-primary flex-1 hc-create-it-btn"
                  onClick={() => void createLocationSignal()}
                  disabled={pendingAction !== null}
                  data-creating={pendingAction === "create-location" ? "true" : "false"}
                  data-tooltip={syncOffline ? syncStatusTooltip : undefined}
                  data-tooltip-variant="info"
                >
                  {pendingAction === "create-location" ? "Creating…" : (
                    <span className="hc-sync-button-content">
                      Create It!
                      {syncPending && <SyncMiniSpinner />}
                      {syncAttention && <FiWifiOff className="hc-sync-offline-icon" size={16} />}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      </div>{/* end home-section-multi */}

      {/* ── Separator ──────────────────────────────────────── */}
      <div className="home-section-separator">
        <div className="home-sep-col">
          <span className="home-sep-label">Multiplayer</span>
        </div>
        <div className="home-sep-line" />
        <div className="home-sep-col">
          <span className="home-sep-label">Singleplayer</span>
        </div>
      </div>

      {/* ── Solo section ───────────────────────────────────── */}
      <div className="home-section-solo">
        {SOLO_GAMES.map((game) => (
          <SoloGameCard
            key={game.id}
            game={game}
            onDemo={(demoId) => setActiveDemo(demoId)}
          />
        ))}
      </div>

      </div>{/* end home-layout */}
    </div>

    {showInSessionModal && pendingJoinTarget && (
      <InSessionModal
        gameType={pendingJoinTarget.gameType}
        busy={joiningFromOtherGame}
        onCancel={() => {
          setShowInSessionModal(false);
          setPendingJoinTarget(null);
          setPendingAction(null);
        }}
        onConfirm={confirmLeaveAndJoin}
      />
    )}

    {/* Scroll indicators (mobile) */}
    <div className="home-cards-dots">
      {GAME_CARD_DOTS.map((dot) => (
        <button
          key={dot.id}
          type="button"
          className={`home-cards-dot${activeDot === dot.index ? " home-cards-dot--active" : ""}`}
          onClick={() => scrollRef.current?.scrollTo({ left: dot.index * (scrollRef.current?.clientWidth ?? 0), behavior: "smooth" })}
          aria-label={`Go to game card ${dot.index + 1}`}
        />
      ))}
    </div>

    <Suspense fallback={null}>
      {activeDemo === "imposter" && <ImposterDemo onClose={() => setActiveDemo(null)} />}
      {activeDemo === "password" && <PasswordDemo onClose={() => setActiveDemo(null)} />}
      {activeDemo === "chain" && <ChainDemo onClose={() => setActiveDemo(null)} />}
      {activeDemo === "shade" && <ShadeDemo onClose={() => setActiveDemo(null)} />}
      {activeDemo === "location" && <LocationDemo onClose={() => setActiveDemo(null)} />}
      {activeDemo === "shikaku" && <ShikakuDemo onClose={() => setActiveDemo(null)} />}
      {activeDemo === "pips" && <PipsDemo onClose={() => setActiveDemo(null)} />}
      {avatarPickerOpen && (
        <AvatarPickerModal
          sessionId={sessionId}
          name={savedName || getDisplayName(null, sessionId)}
          onClose={() => setAvatarPickerOpen(false)}
        />
      )}
    </Suspense>
    </>
  );

  /* ── Dev-only demo helpers ─────────────────────────── */
  async function createDemoImposter(phase: "lobby" | "playing" | "voting" | "results") {
    const id = nanoid();
    const ts = Date.now();
    const fakePlayers = [
      { sessionId, name: savedName || "You", connected: true, role: "player" as const },
      { sessionId: "demo-p2", name: "Alice", connected: true, role: "player" as const },
      { sessionId: "demo-p3", name: "Bob", connected: true, role: "player" as const },
      { sessionId: "demo-p4", name: "Charlie", connected: true, role: "imposter" as const },
      { sessionId: "demo-p5", name: "Diana", connected: false, role: "player" as const },
    ];
    const lobbyPlayers = fakePlayers.map(({ role: _r, ...p }) => p);
    const fakeClues = [
      { sessionId, text: "Fluffy", createdAt: ts - 30_000 },
      { sessionId: "demo-p2", text: "Barks", createdAt: ts - 25_000 },
      { sessionId: "demo-p3", text: "Loyal", createdAt: ts - 20_000 },
      { sessionId: "demo-p4", text: "Fast", createdAt: ts - 15_000 },
    ];
    const fakeVotes = [
      { voterId: sessionId, targetId: "demo-p4" },
      { voterId: "demo-p2", targetId: "demo-p4" },
      { voterId: "demo-p3", targetId: "demo-p4" },
      { voterId: "demo-p4", targetId: "demo-p2" },
    ];

    await zero.mutate(mutators.demo.seedImposter({
      id,
      hostId: sessionId,
      phase,
      secretWord: phase === "lobby" ? null : "Dog",
      players: phase === "lobby" ? lobbyPlayers : fakePlayers,
      clues: phase === "playing" || phase === "voting" || phase === "results" ? fakeClues : [],
      votes: phase === "results" ? fakeVotes : phase === "voting" ? fakeVotes.slice(0, 2) : [],
      currentRound: phase === "lobby" ? 1 : 2,
      phaseEndsAt: phase === "playing" || phase === "voting" ? ts + 60_000 : null,
    }));

    // Seed some demo chat messages
    if (phase !== "lobby") {
      const chatMsgs = [
        { id: nanoid(), gameType: "imposter" as const, gameId: id, senderId: sessionId, senderName: savedName || "You", text: "Hey everyone! Good luck this round \ud83c\udfae" },
        { id: nanoid(), gameType: "imposter" as const, gameId: id, senderId: "demo-p2", senderName: "Alice", text: "gl hf!" },
        { id: nanoid(), gameType: "imposter" as const, gameId: id, senderId: "demo-p3", senderName: "Bob", text: "I have no idea what the word is lol" },
        { id: nanoid(), gameType: "imposter" as const, gameId: id, senderId: "demo-p4", senderName: "Charlie", text: "hmm suspicious \ud83e\udd14" },
        { id: nanoid(), gameType: "imposter" as const, gameId: id, senderId: "demo-p2", senderName: "Alice", text: "Charlie seems nervous!" },
      ];
      for (const msg of chatMsgs) {
        await zero.mutate(mutators.chat.send(msg));
      }
    }

    addRecentGame({ id, code: "DEMO", gameType: "imposter" });
    setRecentGames(getRecentGames());
    navigate(`/imposter/${id}`);
  }

  async function createDemoPassword(phase: "lobby" | "playing" | "results") {
    const id = nanoid();
    const ts = Date.now();
    const teams = [
      { name: "Team 1", members: [sessionId, "demo-p2"] },
      { name: "Team 2", members: ["demo-p3", "demo-p4"] },
    ];
    const scores: Record<string, number> = { "Team 1": phase === "results" ? 10 : 4, "Team 2": phase === "results" ? 7 : 3 };
    const rounds = phase !== "lobby" ? [
      { round: 1, teamIndex: 0, guesserId: "demo-p2", word: "Ocean", clues: [{ sessionId, text: "Waves" }], guess: "Ocean", correct: true },
      { round: 2, teamIndex: 1, guesserId: "demo-p4", word: "Fire", clues: [{ sessionId: "demo-p3", text: "Hot" }], guess: "Sun", correct: false },
      { round: 3, teamIndex: 0, guesserId: sessionId, word: "Guitar", clues: [{ sessionId: "demo-p2", text: "Strings" }], guess: "Guitar", correct: true },
    ] : [];
    const activeRounds = phase === "playing" ? [
      {
        teamIndex: 0,
        guesserId: "demo-p2",
        word: "Balloon" as string | null,
        clues: [] as Array<{ sessionId: string; text: string }>,
        guess: null as string | null,
      },
      {
        teamIndex: 1,
        guesserId: "demo-p4",
        word: "Balloon" as string | null,
        clues: [] as Array<{ sessionId: string; text: string }>,
        guess: null as string | null,
      }
    ] : [];

    await zero.mutate(mutators.demo.seedPassword({
      id,
      hostId: sessionId,
      phase,
      teams,
      scores,
      rounds,
      currentRound: phase === "lobby" ? 1 : 4,
      activeRounds,
      targetScore: 10,
      roundEndsAt: phase === "playing" ? ts + 300_000 : null,
    }));

    // Seed some demo chat messages
    if (phase !== "lobby") {
      const chatMsgs = [
        { id: nanoid(), gameType: "password" as const, gameId: id, senderId: sessionId, senderName: savedName || "You", text: "Let's go team! \ud83d\udcaa" },
        { id: nanoid(), gameType: "password" as const, gameId: id, senderId: "demo-p3", senderName: "Bob", text: "Good luck everyone!" },
        { id: nanoid(), gameType: "password" as const, gameId: id, senderId: "demo-p4", senderName: "Charlie", text: "We're catching up \ud83d\udcc8" },
        { id: nanoid(), gameType: "password" as const, gameId: id, senderId: "demo-p2", senderName: "Alice", text: "nice round!" },
      ];
      for (const msg of chatMsgs) {
        await zero.mutate(mutators.chat.send(msg));
      }
    }

    addRecentGame({ id, code: "DEMO", gameType: "password" });
    setRecentGames(getRecentGames());
    navigate(phase === "results" ? `/password/${id}/results` : phase === "playing" ? `/password/${id}` : `/password/${id}/begin`);
  }

  async function createDemoChainReaction(phase: "lobby" | "submitting" | "playing" | "finished") {
    const id = nanoid();
    const p1 = sessionId;
    const p2 = "demo-p2";
    const players = [
      { sessionId: p1, name: savedName || "You", connected: true },
      { sessionId: p2, name: "Alice", connected: true },
    ];
    const lobbyPlayers = phase === "lobby" ? [players[0]!] : players;

    // Per-player chains (each player guesses their own chain, created by opponent)
    const p1Words = ["RAIN", "DROP", "KICK", "BACK", "FIRE"];
    const p2Words = ["SUN", "LIGHT", "HOUSE", "WORK", "OUT"];

    const makeSlots = (words: string[], progress: "none" | "partial" | "done") =>
      words.map((word, i) => {
        const isEdge = i === 0 || i === words.length - 1;
        if (progress === "none") return { word, revealed: isEdge, lettersShown: isEdge ? word.length : 0, solvedBy: null };
        if (progress === "partial") {
          const revealed = isEdge || i === 1;
          return { word, revealed, lettersShown: revealed ? word.length : (i === 2 ? 1 : 0), solvedBy: i === 1 ? p1 : null };
        }
        return { word, revealed: true, lettersShown: word.length, solvedBy: isEdge ? null : p1 };
      });

    let chain: Record<string, Array<{ word: string; revealed: boolean; lettersShown: number; solvedBy: string | null }>> = {};
    if (phase === "playing") {
      chain = {
        [p1]: makeSlots(p1Words, "partial"),
        [p2]: makeSlots(p2Words, "none"),
      };
    } else if (phase === "finished") {
      chain = {
        [p1]: makeSlots(p1Words, "done"),
        [p2]: makeSlots(p2Words, "done"),
      };
    }

    const roundHistory = phase === "finished" ? [
      {
        round: 1,
        chains: {
          [p1]: p1Words.map((word, i) => ({ word, solvedBy: i === 0 || i === p1Words.length - 1 ? null : p1, lettersShown: word.length })),
          [p2]: p2Words.map((word, i) => ({ word, solvedBy: i === 0 || i === p2Words.length - 1 ? null : p2, lettersShown: word.length })),
        },
        scores: { [p1]: 2, [p2]: 1 }
      },
      {
        round: 2,
        chains: {
          [p1]: ["COLD", "SNAP", "CHAT", "ROOM", "KEY"].map((word, i) => ({ word, solvedBy: i === 0 || i === 4 ? null : p1, lettersShown: word.length })),
          [p2]: ["BLUE", "BELL", "TOWER", "BLOCK", "CHAIN"].map((word, i) => ({ word, solvedBy: i === 0 || i === 4 ? null : p2, lettersShown: word.length })),
        },
        scores: { [p1]: 1, [p2]: 2 }
      }
    ] : [];

    const scores: Record<string, number> = phase === "lobby" ? {} :
      phase === "finished" ? { [p1]: 3, [p2]: 3 } : { [p1]: 1, [p2]: 0 };

    const submittedChains: Record<string, string[]> = phase === "submitting"
      ? { [p1]: p1Words }
      : {};

    await zero.mutate(mutators.demo.seedChainReaction({
      id,
      hostId: p1,
      phase,
      players: lobbyPlayers,
      chain,
      submittedChains,
      scores,
      roundHistory,
      settings: {
        chainLength: 5,
        rounds: phase === "finished" ? 2 : 3,
        currentRound: phase === "lobby" ? 1 : phase === "finished" ? 2 : 1,
        turnTimeSec: null,
        phaseEndsAt: null,
        chainMode: phase === "submitting" ? "custom" : "premade"
      }
    }));

    addRecentGame({ id, code: "DEMO", gameType: "chain_reaction" });
    setRecentGames(getRecentGames());
    navigate(`/chain/${id}`);
  }

  async function createDemoShadeSignal(phase: "lobby" | "clue1" | "guess1" | "reveal") {
    const id = nanoid();
    const players = [
      { sessionId, name: savedName || "You", connected: true, totalScore: phase === "reveal" ? 8 : 0 },
      { sessionId: "demo-p2", name: "Alice", connected: true, totalScore: phase === "reveal" ? 5 : 0 },
      { sessionId: "demo-p3", name: "Bob", connected: true, totalScore: phase === "reveal" ? 3 : 0 },
      { sessionId: "demo-p4", name: "Charlie", connected: true, totalScore: phase === "reveal" ? 6 : 0 },
    ];
    const lobbyPlayers = phase === "lobby"
      ? players.slice(0, 2)
      : players;

    // In guess phase, the leader is someone else so the current user is a guesser
    const leaderId = phase === "guess1" ? "demo-p2" : (phase === "lobby" ? null : sessionId);

    await zero.mutate(mutators.demo.seedShadeSignal({
      id,
      hostId: sessionId,
      phase,
      players: lobbyPlayers,
      leaderId,
      leaderOrder: lobbyPlayers.map((p) => p.sessionId),
      gridSeed: Math.floor(Math.random() * 100000),
      targetRow: phase === "lobby" ? null : 4,
      targetCol: phase === "lobby" ? null : 7,
      clue1: phase === "clue1" || phase === "guess1" || phase === "reveal" ? "Sunset" : null,
      clue2: phase === "reveal" ? "Warm glow" : null,
      guesses: phase === "reveal" ? [
        { sessionId: "demo-p2", round: 1, row: 5, col: 8 },
        { sessionId: "demo-p3", round: 1, row: 3, col: 6 },
        { sessionId: "demo-p4", round: 1, row: 4, col: 7 },
        { sessionId: "demo-p2", round: 2, row: 4, col: 8 },
        { sessionId: "demo-p3", round: 2, row: 4, col: 6 },
        { sessionId: "demo-p4", round: 2, row: 4, col: 7 },
      ] : [],
      currentRound: 1,
      phaseEndsAt: phase === "clue1" ? Date.now() + 45_000 : phase === "guess1" ? Date.now() + 30_000 : null,
    }));

    addRecentGame({ id, code: "DEMO", gameType: "shade_signal" });
    setRecentGames(getRecentGames());
    navigate(`/shade/${id}`);
  }

  async function createDemoLocationSignal(phase: "lobby" | "picking" | "clue1" | "guess1" | "reveal") {
    const id = nanoid();
    const players = [
      { sessionId, name: savedName || "You", connected: true, totalScore: phase === "reveal" ? 2 : 0 },
      { sessionId: "demo-p2", name: "Alice", connected: true, totalScore: phase === "reveal" ? 5 : 0 },
      { sessionId: "demo-p3", name: "Bob", connected: true, totalScore: phase === "reveal" ? 3 : 0 },
      { sessionId: "demo-p4", name: "Charlie", connected: true, totalScore: phase === "reveal" ? 8 : 0 },
    ];
    const lobbyPlayers = phase === "lobby" ? players.slice(0, 2) : players;
    const leaderId = phase === "guess1" ? "demo-p2" : (phase === "lobby" ? null : sessionId);

    // Target: Rome, Italy
    const targetLat = phase === "lobby" || phase === "picking" ? null : 41.9;
    const targetLng = phase === "lobby" || phase === "picking" ? null : 12.5;

    await zero.mutate(mutators.demo.seedLocationSignal({
      id,
      hostId: sessionId,
      phase,
      players: lobbyPlayers,
      leaderId,
      leaderOrder: lobbyPlayers.map((p) => p.sessionId),
      targetLat,
      targetLng,
      clue1: ["clue1", "guess1", "reveal"].includes(phase) ? "Ancient empire" : null,
      clue2: phase === "reveal" ? "Colosseum" : null,
      clue3: null,
      clue4: null,
      guesses: phase === "reveal" ? [
        { sessionId: "demo-p2", round: 1 as const, lat: 37.9, lng: 23.7 },
        { sessionId: "demo-p3", round: 1 as const, lat: 48.8, lng: 2.3 },
        { sessionId: "demo-p4", round: 1 as const, lat: 40.4, lng: -3.7 },
        { sessionId: "demo-p2", round: 2 as const, lat: 43.7, lng: 11.2 },
        { sessionId: "demo-p3", round: 2 as const, lat: 45.4, lng: 9.2 },
        { sessionId: "demo-p4", round: 2 as const, lat: 41.9, lng: 12.5 },
      ] : [],
      currentRound: 1,
      phaseEndsAt: phase === "clue1" ? Date.now() + 45_000 : phase === "guess1" ? Date.now() + 45_000 : phase === "reveal" ? Date.now() + 10_000 : null,
    }));

    addRecentGame({ id, code: "DEMO", gameType: "location_signal" });
    setRecentGames(getRecentGames());
    navigate(`/location/${id}`);
  }
}

/* ── Inline-confirm clear button ──────────────────────────────── */

function ClearRecentButton({ onClear }: { onClear: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleClick = () => {
    if (confirming) {
      clearTimeout(timerRef.current);
      setConfirming(false);
      onClear();
    } else {
      setConfirming(true);
      timerRef.current = setTimeout(() => setConfirming(false), 3000);
    }
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <button
      className={`hc-clear-trash${confirming ? " hc-clear-trash--confirming" : ""}`}
      onClick={handleClick}
      data-tooltip={confirming ? "Click again to clear all" : "Clear all recent games"}
      data-tooltip-variant={confirming ? "danger" : "info"}
    >
      <FiTrash2 size={13} />
    </button>
  );
}

/* ── Recent game item with status color + two-click removal ─── */

type RecentGameStyle = CSSProperties & {
  "--recent-accent": string;
  "--recent-status": string;
  "--recent-icon": string;
};

function formatRecentPhase(phase: string | null | undefined) {
  if (!phase) return "Unknown";
  return phase
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function RecentGameItem({ game, sessionId, onRemove }: { game: RecentGame; sessionId: string; onRemove: () => void }) {
  const [imposterResults] = useQuery(game.gameType === "imposter" ? queries.imposter.byId({ id: game.id }) : queries.imposter.byId({ id: "__none__" }));
  const [passwordResults] = useQuery(game.gameType === "password" ? queries.password.byId({ id: game.id }) : queries.password.byId({ id: "__none__" }));
  const [chainResults] = useQuery(game.gameType === "chain_reaction" ? queries.chainReaction.byId({ id: game.id }) : queries.chainReaction.byId({ id: "__none__" }));
  const [shadeResults] = useQuery(game.gameType === "shade_signal" ? queries.shadeSignal.byId({ id: game.id }) : queries.shadeSignal.byId({ id: "__none__" }));
  const [locationResults] = useQuery(game.gameType === "location_signal" ? queries.locationSignal.byId({ id: game.id }) : queries.locationSignal.byId({ id: "__none__" }));
  const [confirmRemove, setConfirmRemove] = useState(false);
  const removeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const gameData = game.gameType === "imposter" ? imposterResults[0]
    : game.gameType === "password" ? passwordResults[0]
    : game.gameType === "chain_reaction" ? chainResults[0]
    : game.gameType === "shade_signal" ? shadeResults[0]
    : locationResults[0];

  const isDeleted = !gameData;
  const isEnded = Boolean(gameData && (gameData.phase === "finished" || gameData.phase === "ended"));

  const link = game.gameType === "imposter"
    ? `/imposter/${game.id}`
    : game.gameType === "password"
    ? `/password/${game.id}/begin`
    : game.gameType === "shade_signal"
    ? `/shade/${game.id}`
    : game.gameType === "location_signal"
    ? `/location/${game.id}`
    : `/chain/${game.id}`;

  const gameSlug = multiplayerTypeToGameSlug(game.gameType);
  const meta = GAME_META[gameSlug];
  const statusColor = isDeleted || isEnded ? "var(--muted-foreground)" : meta.accent;
  const iconColor = isDeleted ? "var(--muted-foreground)" : meta.accent;
  const recentStyle: RecentGameStyle = {
    "--recent-accent": meta.accent,
    "--recent-status": statusColor,
    "--recent-icon": iconColor,
  };
  const phaseLabel = formatRecentPhase(gameData?.phase);
  const rowLabel = `${meta.title} ${game.code}`;

  // Tooltip content for finished games
  const resultTooltip = useMemo(() => {
    if (!isEnded || !gameData) return null;

    if (game.gameType === "imposter" && "round_history" in gameData) {
      const g = gameData as typeof imposterResults[0];
      if (!g) return null;
      const lines: string[] = [];

      for (const r of g.round_history ?? []) {
        const votedOut = r.votedOutName ?? "no one";
        lines.push(`R${r.round}: "${r.secretWord}" - voted out ${votedOut} (${r.wasImposter ? "imposter" : "innocent"})`);
      }
      return lines.join("\n") || "No rounds played";
    }

    if (game.gameType === "password" && "teams" in gameData) {
      const g = gameData as typeof passwordResults[0];
      if (!g) return null;
      const teams = g.teams ?? [];
      const teamByName = new Map(teams.map((team) => [team.name, team]));
      const lines = Object.entries(g.scores ?? {})
        .sort(([, a], [, b]) => b - a)
        .map(([teamKey, score]) => {
          const team = teamByName.get(teamKey);
          const teamName = team?.name ?? teamKey;
          return `${teamName}: ${score} pts`;
        });
      return lines.join("\n") || "No scores";
    }

    if (game.gameType === "chain_reaction" && "round_history" in gameData) {
      const g = gameData as typeof chainResults[0];
      if (!g) return null;
      const players = g.players ?? [];
      const playerBySessionId = new Map(players.map((player) => [player.sessionId, player]));
      const nameOf = (id: string) => {
        const label = getDisplayName(playerBySessionId.get(id)?.name, id);
        return id === sessionId ? `${label} (you)` : label;
      };
      const lines: string[] = [];

      // Final scores
      const sorted = Object.entries(g.scores ?? {}).sort(([, a], [, b]) => b - a);
      if (sorted.length > 0) {
        lines.push(sorted.map(([id, s]) => `${nameOf(id)}: ${s}`).join(" vs "));
      }

      // Per round
      for (const r of g.round_history ?? []) {
        const roundScores = Object.entries(r.scores ?? {})
          .map(([id, s]) => `${nameOf(id)} ${s}`)
          .join(" / ");
        lines.push(`R${r.round}: ${roundScores}`);
      }
      return lines.join("\n") || "No rounds played";
    }

    if (game.gameType === "shade_signal" && "players" in gameData) {
      const g = gameData as typeof shadeResults[0];
      if (!g) return null;
      const players = g.players ?? [];
      const scoreLines = players
        .slice()
        .sort((a, b) => b.totalScore - a.totalScore)
        .map((player) => {
          const label = getDisplayName(player.name, player.sessionId);
          return `${player.sessionId === sessionId ? `${label} (you)` : label}: ${player.totalScore} pts`;
        });
      const roundCount = g.round_history?.length ?? 0;
      return [
        scoreLines.length > 0 ? scoreLines.join("\n") : "No scores",
        roundCount > 0 ? `${roundCount} rounds played` : null,
      ].filter(Boolean).join("\n");
    }

    if (game.gameType === "location_signal" && "players" in gameData) {
      const g = gameData as typeof locationResults[0];
      if (!g) return null;
      const players = g.players ?? [];
      const scoreLines = players
        .slice()
        .sort((a, b) => b.totalScore - a.totalScore)
        .map((player) => {
          const label = getDisplayName(player.name, player.sessionId);
          return `${player.sessionId === sessionId ? `${label} (you)` : label}: ${player.totalScore} pts`;
        });
      const roundCount = g.round_history?.length ?? 0;
      return [
        scoreLines.length > 0 ? scoreLines.join("\n") : "No scores",
        roundCount > 0 ? `${roundCount} rounds played` : null,
      ].filter(Boolean).join("\n");
    }

    return null;
  }, [isEnded, gameData, game.gameType, sessionId]);

  const tooltip = useMemo(() => {
    if (confirmRemove) return `${rowLabel}\nClick again to remove it from recent games.`;
    if (isDeleted) return `${rowLabel}\nThis game is no longer available.\nClick once to mark it for removal.`;
    if (isEnded) return `${rowLabel}\n${phaseLabel}\n${resultTooltip ? `${resultTooltip}\nClick once to mark it for removal.` : "Click once to mark it for removal."}`;
    return `${rowLabel}\n${phaseLabel}\nClick to rejoin. Recent games can be removed after they end.`;
  }, [confirmRemove, isDeleted, isEnded, phaseLabel, resultTooltip, rowLabel]);

  useEffect(() => {
    if (isDeleted || isEnded) return;
    setConfirmRemove(false);
    clearTimeout(removeTimerRef.current);
  }, [isDeleted, isEnded]);

  useEffect(() => () => clearTimeout(removeTimerRef.current), []);

  const handleInactiveClick = () => {
    if (confirmRemove) {
      clearTimeout(removeTimerRef.current);
      setConfirmRemove(false);
      onRemove();
      return;
    }

    setConfirmRemove(true);
    clearTimeout(removeTimerRef.current);
    removeTimerRef.current = setTimeout(() => setConfirmRemove(false), 3000);
  };

  const content = (
    <>
      <span className="hc-recent-icon" aria-hidden="true">
        <GameIcon game={gameSlug} size={16} />
      </span>
      <span className="hc-recent-code">{game.code}</span>
    </>
  );

  if (!isDeleted && !isEnded) {
    return (
      <Link
        to={link}
        className="hc-recent-item hc-recent-item--active"
        style={recentStyle}
        aria-label={`Rejoin ${rowLabel}`}
        data-tooltip={tooltip}
        data-tooltip-pos="right"
        data-tooltip-variant="info"
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={`hc-recent-item hc-recent-item--inactive${isDeleted ? " hc-recent-item--deleted" : " hc-recent-item--ended"}${confirmRemove ? " hc-recent-item--confirm-remove" : ""}`}
      style={recentStyle}
      onClick={handleInactiveClick}
      aria-label={confirmRemove ? `Remove ${rowLabel} from recent games` : `Mark ${rowLabel} for removal`}
      data-tooltip={tooltip}
      data-tooltip-pos="right"
      data-tooltip-variant={confirmRemove ? "danger" : "info"}
    >
      {content}
    </button>
  );
}

export function HomePage({ sessionId }: { sessionId: string }) {
  const isMobile = useIsMobile();
  if (isMobile) return <MobileHomePage sessionId={sessionId} />;
  return <HomePageDesktop sessionId={sessionId} />;
}
