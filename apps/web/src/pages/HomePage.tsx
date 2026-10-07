import { GAME_META, imposterCategoryLabels, chainCategoryLabels, multiplayerTypeToGameSlug, passwordCategoryLabels, mutators, queries, type GameSlug } from "@games/shared";
import { optimistic, useQuery, useZero } from "../lib/zero";
import { formatClueVisibility, GameSetup } from "../components/home/GameSetup";
/* The card setup forms borrow the single-player menu's controls. */
import "../styles/game-shared.css";
import "../styles/home.css";
import { nanoid } from "nanoid";
import { FormEvent, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { IconType } from "react-icons";
import { FiArrowDown, FiArrowLeft, FiArrowRight, FiBookOpen, FiCheck, FiChevronDown, FiClock, FiDroplet, FiEdit2, FiGlobe, FiHelpCircle, FiList, FiMapPin, FiPlus, FiSearch, FiSliders, FiTarget, FiTrash2, FiUser, FiUserCheck, FiUsers, FiWifiOff } from "react-icons/fi";
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
import { GameIcon } from "../components/shared/GameIcon";
import { BrowseCount } from "../components/home/BrowseCount";
import { Button } from "../components/shared/Button";
import { useScrollEdges } from "../hooks/useScrollEdges";
import { ShikakuPreview } from "../components/home/ShikakuPreview";
import { ZipPreview } from "../components/zip/ZipPreview";
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
const ZipDemo = lazy(() => import("../components/zip/ZipDemo").then(({ ZipDemo }) => ({ default: ZipDemo })));

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
const zipMeta = GAME_META.zip;

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
    preview: <ShikakuPreview />,
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
    id: "zip", gameSlug: "zip", title: zipMeta.title,
    demoId: "zip",
    description: zipMeta.shortDescription,
    accent: zipMeta.accent,
    href: "/zip",
    preview: <ZipPreview />,
  },
];

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

/* One round, told in order: the word everyone but the imposter saw, then what
   each of them said about it, then who that got voted out. */
const IMPOSTER_PREVIEW = [
  { who: "Ada", clue: "“Fluffy”", out: false },
  { who: "Bram", clue: "“Loyal”", out: false },
  { who: "Cleo", clue: "“Meow?”", out: true },
  { who: "Dov", clue: "“Walks”", out: false },
  { who: "Esme", clue: "“Fetch”", out: false },
];

/* The card's map is the real one, not a drawing of one. Four zoom-1 tiles from
   the same provider the game itself uses cover the whole world, which is all a
   preview needs, and four images cost a lot less than the map component with
   its panning and zooming dragged into the home page bundle. */
const LOC_ZOOM = 3;
const LOC_TILES = [
  { x: 3, y: 2 }, { x: 4, y: 2 },
  { x: 3, y: 3 }, { x: 4, y: 3 },
];

/* The roadmap layer styled down to a bare land mask: white land, black water,
   no labels, borders, places or roads. The CSS uses it as a luminance mask
   over the card's accent, so these colors never show. The tiles are served
   with open CORS, which a cross-origin mask needs. */
const LOC_STYLE = encodeURIComponent(
  [
    "s.e:l|p.v:off", // labels
    "s.t:1|p.v:off", // borders
    "s.t:2|p.v:off", // places
    "s.t:3|p.v:off", // roads
    "s.t:6|s.e:g|p.c:#ff000000", // water
    "s.t:5|s.e:g|p.c:#ffffffff", // land
  ].join(","),
);
const locTileUrl = (x: number, y: number) =>
  `https://mt${(x + y) % 4}.google.com/vt/lyrs=m&x=${x}&y=${y}&z=${LOC_ZOOM}&hl=en&gl=US&apistyle=${LOC_STYLE}`;

/* Percentages across the four tiles above, worked out from lat and lng once,
   since the view never moves. One answer and two guesses landing near it,
   which is what the end of a round looks like. */
const LOC_PINS = [
  { label: "answer", x: 52.6, y: 32.6, answer: true },
  { label: "guess-a", x: 49.9, y: 26.2, answer: false },
  { label: "guess-b", x: 63.9, y: 48.0, answer: false },
];

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
  game,
  onDemo,
}: {
  title: string;
  compact: boolean;
  game: GameSlug;
  onDemo: (demo: string) => void;
}) {
  return (
    <div className="solo-card-title-row hc-title-row">
      <GameIcon game={game} size={20} className="card-title-icon" />
      <h2 className={`hc-game-title-lg${compact ? " hc-game-title-lg--compact" : ""}`}>{title}</h2>
      {/* The solo cards' own mark, classes and all, so the two sets of cards
          cannot drift apart on the one control they share. */}
      <button
        className="solo-card-help"
        type="button"
        aria-label={`How to play ${title}`}
        data-tooltip="How to Play"
        data-tooltip-variant="info"
        onClick={() => onDemo(game)}
      >
        <FiHelpCircle size={18} />
      </button>
    </div>
  );
}

/**
 * The bottom of a game card: making a game and joining one somebody else made,
 * stacked. Create is the primary, since it is what most people came to do;
 * browsing the public games is the secondary under it, with a count when
 * there is anything to join.
 */
function CardCreate({
  game,
  onCreate,
  onBrowse,
  count,
  syncOffline,
  syncPending,
  syncAttention,
}: {
  game: GameSlug;
  onCreate: () => void;
  onBrowse: () => void;
  count: number;
  syncOffline: boolean;
  syncPending: boolean;
  syncAttention: boolean;
}) {
  const live = !syncOffline && count > 0;

  return (
    <div className="hc-create">
      <Button variant="primary" full icon={<GameIcon game={game} size={16} />} onClick={onCreate}>
        Create game
      </Button>
      <Button
        full
        icon={syncPending ? <SyncMiniSpinner /> : syncAttention ? <FiWifiOff /> : <FiGlobe />}
        trailing={<BrowseCount count={live ? count : 0} />}
        onClick={onBrowse}
        aria-label={live ? `Browse public games, ${count} to join` : "Browse public games, none running"}
      >
        Browse public
      </Button>
    </div>
  );
}

/** The bottom of a card while browsing, laid out like the setup view's back
 *  and Create it row. The list draws its own count, since only it knows how
 *  much is scrolled out of view. With nothing to browse the list's empty state already
 *  offers a create, so only back is left. */
function BrowseBack({ title, count, onBack, onCreate }: { title: string; count: number; onBack: () => void; onCreate: () => void }) {
  return (
    <>
      <div className="hc-row hc-create-action-row">
        <Button shape="square" icon={<FiArrowLeft />} aria-label={`Back to ${title} options`} onClick={onBack} />
        {count > 0 && <Button full icon={<FiPlus />} onClick={onCreate}>Create</Button>}
      </div>
    </>
  );
}

function HomePageDesktop({ sessionId }: { sessionId: string }) {

  const home = useHomePage(sessionId);
  const {
    zero, navigate, name, setName, savedName, firstVisit, nameInputRef, activeRouteHighlight,
    recentGames, setRecentGames, joinCode, setJoinCode, joinRejected, pendingAction,
    showInSessionModal, setShowInSessionModal, joiningFromOtherGame, pendingJoinTarget,
    setPendingJoinTarget, setPendingAction, imposterPublicCount, passwordPublicCount,
    chainPublicCount, shadePublicCount, locationPublicCount, imposterCategory, imposterImposters,
    imposterRounds, imposterClueVisibility, passwordCategory, passwordTeams, passwordTargetScore,
    chainCategory, chainLength, chainRounds, chainMode, shadeRoundsPerPlayer, shadeHardMode,
    shadeLeaderPick, locCluePairs, locRoundsPerPlayer, saveName, joinAny, confirmLeaveAndJoin,
    createImposter, createPassword, createChainReaction, createShadeSignal, createLocationSignal,
    firstVisitGlowClass, dimmedClass, routeHighlightClass,
  } = home;

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
      <h2 className="home-section-title"><FiUsers aria-hidden="true" /> Multiplayer</h2>

      {/* ── Card 1: Utils ──────────────────────────────────── */}
      <div className={`home-card home-card--utils${firstVisitGlowClass}`}>
        <div className="home-card-body">
          {/* Join section */}
          <section className="hc-section">
            <h3 className="hc-label">
              <FiSearch size={14} /> Join game
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
          </section>
          {/* Name section - inline editable */}
          <section className="hc-section">
            <h3 className="hc-label">
              <FiUserCheck size={14} /> Display name
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
            <RecentGames
              games={recentGames}
              sessionId={sessionId}
              collapsed={recentCollapsed}
              onToggle={() => setRecentCollapsed(!recentCollapsed)}
              onClear={() => { clearRecentGames(); setRecentGames([]); }}
              onRemove={(game) => {
                removeRecentGame(game.id, game.gameType);
                setRecentGames(getRecentGames());
              }}
            />
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
          <CardTitle title="Imposter" compact={imposterExpanded || imposterBrowsing} game="imposter" onDemo={setActiveDemo} />

          {imposterBrowsing ? (
            <div className="hc-card-anim" key="browse">
              <PublicGamesList gameType="imposter" sessionId={sessionId} onCreate={() => { setImposterBrowsing(false); setImposterExpanded(true); }} />
            </div>
          ) : imposterExpanded ? (
            <div className="hc-card-anim" key="config">
              <GameSetup game="imposter" home={home} />
            </div>
          ) : (
            <div className="hc-card-anim" key="default">
              <div className="hc-coming-preview">
                <div className="hc-imp-preview" aria-hidden="true">
                  <div className="hc-imp-word">
                    <span className="hc-imp-word-label">Secret word</span>
                    <span className="hc-imp-word-value">DOG</span>
                  </div>

                  <div className="hc-imp-rows">
                    {IMPOSTER_PREVIEW.map((row, i) => (
                      <div
                        key={row.who}
                        className={`hc-imp-row${row.out ? " hc-imp-row--out" : ""}`}
                        style={{ animationDelay: `${i * 0.55}s` }}
                      >
                        <span className="hc-imp-who">{row.who}</span>
                        <span className="hc-imp-clue">{row.clue}</span>
                        <span className="hc-imp-mark">{row.out ? "Imposter" : <FiCheck size={11} />}</span>
                      </div>
                    ))}
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
              <BrowseBack title="Imposter" count={imposterPublicCount} onBack={() => setImposterBrowsing(false)} onCreate={() => { setImposterBrowsing(false); setImposterExpanded(true); }} />
            ) : !imposterExpanded ? (
              <CardCreate
                game="imposter"
                onCreate={() => setImposterExpanded(true)}
                onBrowse={() => { setImposterExpanded(false); setImposterBrowsing(true); }}
                count={imposterPublicCount}
                syncOffline={syncOffline}
                syncPending={syncPending}
                syncAttention={syncAttention}
              />
            ) : (
              <div className="hc-row hc-create-action-row">
                <Button shape="square" icon={<FiArrowLeft />} aria-label="Back to Imposter preview" onClick={() => setImposterExpanded(false)} />
                <Button
                  variant="primary"
                  full
                  icon={<GameIcon game="imposter" size={16} />}
                  loading={pendingAction === "create-imposter"}
                  disabled={pendingAction !== null}
                  onClick={() => void createImposter()}
                  data-tooltip={syncOffline ? syncStatusTooltip : undefined}
                  data-tooltip-variant="info"
                >
                  Create it
                </Button>
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
          <CardTitle title="Password" compact={passwordExpanded || passwordBrowsing} game="password" onDemo={setActiveDemo} />

          {passwordBrowsing ? (
            <div className="hc-card-anim" key="browse">
              <PublicGamesList gameType="password" sessionId={sessionId} onCreate={() => { setPasswordBrowsing(false); setPasswordExpanded(true); }} />
            </div>
          ) : passwordExpanded ? (
            <div className="hc-card-anim" key="config">
              <GameSetup game="password" home={home} />
            </div>
          ) : (
            <div className="hc-card-anim" key="default">
              <div className="hc-coming-preview">
                <div className="hc-pw-preview" aria-hidden="true">
                  {/* One scoreboard split by a hairline, not two pills adrift
                      in a row. Teams are opposite sides of one thing. */}
                  <div className="hc-pw-score">
                    <span className="hc-pw-side hc-pw-side--red">
                      <span className="hc-pw-side-name">Red</span>
                      <b>2</b>
                    </span>
                    <span className="hc-pw-side hc-pw-side--blue">
                      <b>1</b>
                      <span className="hc-pw-side-name">Blue</span>
                    </span>
                  </div>

                  <div className="hc-pw-word">
                    <span className="hc-pw-word-label">Your team's word</span>
                    <span className="hc-pw-word-value">OCEAN</span>
                  </div>

                  <div className="hc-pw-steps">
                    <div className="hc-pw-step">
                      <span className="hc-pw-role">Ada says</span>
                      <span className="hc-pw-said">“Waves”</span>
                    </div>
                    <div className="hc-pw-step">
                      <span className="hc-pw-role">Bram guesses</span>
                      <span className="hc-pw-said hc-pw-said--right">OCEAN <FiCheck size={11} /></span>
                    </div>
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
              <BrowseBack title="Password" count={passwordPublicCount} onBack={() => setPasswordBrowsing(false)} onCreate={() => { setPasswordBrowsing(false); setPasswordExpanded(true); }} />
            ) : !passwordExpanded ? (
              <CardCreate
                game="password"
                onCreate={() => setPasswordExpanded(true)}
                onBrowse={() => { setPasswordExpanded(false); setPasswordBrowsing(true); }}
                count={passwordPublicCount}
                syncOffline={syncOffline}
                syncPending={syncPending}
                syncAttention={syncAttention}
              />
            ) : (
              <div className="hc-row hc-create-action-row">
                <Button shape="square" icon={<FiArrowLeft />} aria-label="Back to Password preview" onClick={() => setPasswordExpanded(false)} />
                <Button
                  variant="primary"
                  full
                  icon={<GameIcon game="password" size={16} />}
                  loading={pendingAction === "create-password"}
                  disabled={pendingAction !== null}
                  onClick={() => void createPassword()}
                  data-tooltip={syncOffline ? syncStatusTooltip : undefined}
                  data-tooltip-variant="info"
                >
                  Create it
                </Button>
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
          <CardTitle title="Chain Reaction" compact={chainExpanded || chainBrowsing} game="chain" onDemo={setActiveDemo} />

          {chainBrowsing ? (
            <div className="hc-card-anim" key="browse">
              <PublicGamesList gameType="chain_reaction" sessionId={sessionId} onCreate={() => { setChainBrowsing(false); setChainExpanded(true); }} />
            </div>
          ) : chainExpanded ? (
            <div className="hc-card-anim" key="config">
              <GameSetup game="chain" home={home} />
            </div>
          ) : (
            <div className="hc-card-anim" key="default">
              <div className="hc-coming-preview">
                <div className="hc-chain-example">
                  <span className="hc-chain-word hc-chain-word--revealed">FIRE</span>
                  <span className="hc-chain-word hc-chain-word--wrong">SMOKE ✕</span>
                  <span className="hc-chain-word hc-chain-word--wrong">SPARK ✕</span>
                  <span className="hc-chain-word hc-chain-word--hidden" aria-label="Hidden word">– – – –</span>
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
              <BrowseBack title="Chain Reaction" count={chainPublicCount} onBack={() => setChainBrowsing(false)} onCreate={() => { setChainBrowsing(false); setChainExpanded(true); }} />
            ) : !chainExpanded ? (
              <CardCreate
                game="chain"
                onCreate={() => setChainExpanded(true)}
                onBrowse={() => { setChainExpanded(false); setChainBrowsing(true); }}
                count={chainPublicCount}
                syncOffline={syncOffline}
                syncPending={syncPending}
                syncAttention={syncAttention}
              />
            ) : (
              <div className="hc-row hc-create-action-row">
                <Button shape="square" icon={<FiArrowLeft />} aria-label="Back to Chain Reaction preview" onClick={() => setChainExpanded(false)} />
                <Button
                  variant="primary"
                  full
                  icon={<GameIcon game="chain" size={16} />}
                  loading={pendingAction === "create-chain"}
                  disabled={pendingAction !== null}
                  onClick={() => void createChainReaction()}
                  data-tooltip={syncOffline ? syncStatusTooltip : undefined}
                  data-tooltip-variant="info"
                >
                  Create it
                </Button>
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
          <CardTitle title="Shade Signal" compact={shadeExpanded || shadeBrowsing} game="shade" onDemo={setActiveDemo} />

          {shadeBrowsing ? (
            <div className="hc-card-anim" key="browse">
              <PublicGamesList gameType="shade_signal" sessionId={sessionId} onCreate={() => { setShadeBrowsing(false); setShadeExpanded(true); }} />
            </div>
          ) : shadeExpanded ? (
            <div className="hc-card-anim" key="config">
              <GameSetup game="shade" home={home} />
            </div>
          ) : (
            <div className="hc-card-anim" key="default">
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
              <BrowseBack title="Shade Signal" count={shadePublicCount} onBack={() => setShadeBrowsing(false)} onCreate={() => { setShadeBrowsing(false); setShadeExpanded(true); }} />
            ) : !shadeExpanded ? (
              <CardCreate
                game="shade"
                onCreate={() => setShadeExpanded(true)}
                onBrowse={() => { setShadeExpanded(false); setShadeBrowsing(true); }}
                count={shadePublicCount}
                syncOffline={syncOffline}
                syncPending={syncPending}
                syncAttention={syncAttention}
              />
            ) : (
              <div className="hc-row hc-create-action-row">
                <Button shape="square" icon={<FiArrowLeft />} aria-label="Back to Shade Signal preview" onClick={() => setShadeExpanded(false)} />
                <Button
                  variant="primary"
                  full
                  icon={<GameIcon game="shade" size={16} />}
                  loading={pendingAction === "create-shade"}
                  disabled={pendingAction !== null}
                  onClick={() => void createShadeSignal()}
                  data-tooltip={syncOffline ? syncStatusTooltip : undefined}
                  data-tooltip-variant="info"
                >
                  Create it
                </Button>
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
          <CardTitle title="Location Signal" compact={locationExpanded || locationBrowsing} game="location" onDemo={setActiveDemo} />

          {locationBrowsing ? (
            <div className="hc-card-anim" key="browse">
              <PublicGamesList gameType="location_signal" sessionId={sessionId} onCreate={() => { setLocationBrowsing(false); setLocationExpanded(true); }} />
            </div>
          ) : locationExpanded ? (
            <div className="hc-card-anim" key="config">
              <GameSetup game="location" home={home} />
            </div>
          ) : (
            <div className="hc-card-anim" key="default">
              <div className="hc-coming-preview">
                <div className="hc-loc-preview" aria-hidden="true">
                  <div className="hc-loc-map">
                    <div className="hc-loc-tiles">
                      {LOC_TILES.map((t) => (
                        <span key={`${t.x}-${t.y}`} style={{ maskImage: `url("${locTileUrl(t.x, t.y)}")` }} />
                      ))}
                    </div>
                    {LOC_PINS.map((pin, i) => (
                      <span
                        key={pin.label}
                        className={`hc-loc-pin${pin.answer ? " hc-loc-pin--answer" : ""}`}
                        style={{ left: `${pin.x}%`, top: `${pin.y}%`, animationDelay: `${i * 0.5}s` }}
                      />
                    ))}
                  </div>
                  <div className="hc-loc-clues">
                    <span><strong>Clue 1:</strong> Rivers</span>
                    <span><strong>Clue 2:</strong> Towers</span>
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
              <BrowseBack title="Location Signal" count={locationPublicCount} onBack={() => setLocationBrowsing(false)} onCreate={() => { setLocationBrowsing(false); setLocationExpanded(true); }} />
            ) : !locationExpanded ? (
              <CardCreate
                game="location"
                onCreate={() => setLocationExpanded(true)}
                onBrowse={() => { setLocationExpanded(false); setLocationBrowsing(true); }}
                count={locationPublicCount}
                syncOffline={syncOffline}
                syncPending={syncPending}
                syncAttention={syncAttention}
              />
            ) : (
              <div className="hc-row hc-create-action-row">
                <Button shape="square" icon={<FiArrowLeft />} aria-label="Back to Location Signal preview" onClick={() => setLocationExpanded(false)} />
                <Button
                  variant="primary"
                  full
                  icon={<GameIcon game="location" size={16} />}
                  loading={pendingAction === "create-location"}
                  disabled={pendingAction !== null}
                  onClick={() => void createLocationSignal()}
                  data-tooltip={syncOffline ? syncStatusTooltip : undefined}
                  data-tooltip-variant="info"
                >
                  Create it
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      </div>{/* end home-section-multi */}

      {/* ── Solo section ───────────────────────────────────── */}
      <div className="home-section-solo">
        <h2 className="home-section-title"><FiUser aria-hidden="true" /> Solo</h2>
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
      {activeDemo === "zip" && <ZipDemo onClose={() => setActiveDemo(null)} />}
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

/* ── Recent games ─────────────────────────────────────────────
   A recessed tray along the bottom of the card. Closed, it is just the
   header, a footer you can pull up; open, it takes the rest of the card and
   scrolls with the same edge fades as the public games list. */

function RecentGames({
  games,
  sessionId,
  collapsed,
  onToggle,
  onClear,
  onRemove,
}: {
  games: RecentGame[];
  sessionId: string;
  collapsed: boolean;
  onToggle: () => void;
  onClear: () => void;
  onRemove: (game: RecentGame) => void;
}) {
  const { fadeProps } = useScrollEdges<HTMLDivElement>([games.length, collapsed]);
  /* Clearing takes two presses. The first one says so in the heading, where
     there is room for words; the trash button itself stays an icon. */
  const [confirmClear, setConfirmClear] = useState(false);
  const clearTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(clearTimer.current), []);

  /* One clock for the whole list so the uptimes and "ago"s stay current. */
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (collapsed) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [collapsed]);

  const handleClear = () => {
    clearTimeout(clearTimer.current);
    if (confirmClear) {
      setConfirmClear(false);
      onClear();
      return;
    }
    setConfirmClear(true);
    clearTimer.current = setTimeout(() => setConfirmClear(false), 3000);
  };

  return (
    <>
      <section className={`hc-section hc-recent-section${collapsed ? "" : " hc-recent-section--open"}`}>
        <div className="hc-recent-header">
          <button type="button" className="hc-collapse-toggle" aria-expanded={!collapsed} onClick={onToggle}>
            <span className={`hc-label${confirmClear ? " hc-label--danger" : ""}`}>
              {confirmClear ? <><FiTrash2 size={14} /> Clear all?</> : <><FiClock size={14} /> Recent games</>}
            </span>
            {!confirmClear && <span className="hc-browse-pill">{games.length}</span>}
            <FiChevronDown size={16} className={`hc-collapse-icon${collapsed ? "" : " hc-collapse-icon--open"}`} aria-hidden="true" />
          </button>
          {!collapsed && (
            <Button
              variant={confirmClear ? "danger-secondary" : "ghost"}
              size="sm"
              shape="square"
              icon={<FiTrash2 />}
              onClick={handleClear}
              aria-label={confirmClear ? "Press again to clear all recent games" : "Clear all recent games"}
            />
          )}
        </div>
        {!collapsed && (
          <div className="hc-recent-list hc-fade-list" {...fadeProps}>
            {games.map((game) => (
              <RecentGameItem
                key={`${game.gameType}-${game.id}`}
                game={game}
                sessionId={sessionId}
                now={now}
                onRemove={() => onRemove(game)}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

/* ── Recent game item with status color + two-click removal ─── */

type RecentGameStyle = CSSProperties & { "--recent-accent": string };

/** Condensed elapsed time: 5m, 3h, 2d. Under a minute reads as "now". */
function shortSpan(ms: number) {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function RecentGameItem({ game, sessionId, now, onRemove }: { game: RecentGame; sessionId: string; now: number; onRemove: () => void }) {
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
  const recentStyle: RecentGameStyle = { "--recent-accent": meta.accent };
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

  const live = !isDeleted && !isEnded;
  const status = confirmRemove
    ? "Remove?"
    : isDeleted ? "Expired"
    : isEnded ? "Ended"
    : gameData?.phase === "lobby" ? "In lobby" : "Playing";
  /* Live games count up from creation; ended ones say how long ago they
     finished (the last write is the finish). Expired rows only have the
     local visit time. */
  const ago = (at: number) => {
    const span = shortSpan(now - at);
    return span === "now" ? "just now" : `${span} ago`;
  };
  const when = confirmRemove ? null
    : isDeleted ? ago(game.lastPlayedAt)
    : isEnded ? ago(gameData.updated_at)
    : shortSpan(now - gameData.created_at);

  const content = (
    <>
      <span className="hc-recent-info">
        <span className="hc-recent-title">
          {meta.title} <span className="hc-recent-code">({game.code})</span>
        </span>
        <span className={`hc-recent-status${live ? " hc-recent-status--live" : ""}`}>
          {status}
          {when && (
            <span className="hc-recent-when">
              <FiClock size={10} aria-hidden="true" />
              {when}
            </span>
          )}
        </span>
      </span>
      <span className="hc-recent-icon" aria-hidden="true">
        <GameIcon game={gameSlug} size={20} />
      </span>
    </>
  );

  if (live) {
    return (
      <Link
        to={link}
        className="hc-recent-item hc-recent-item--active"
        style={recentStyle}
        aria-label={`Rejoin ${rowLabel}, ${status.toLowerCase()}, up ${when}`}
      >
        {content}
      </Link>
    );
  }

  /* A finished game keeps its results tooltip: that is information you
     cannot get anywhere else from here. */
  return (
    <button
      type="button"
      className={`hc-recent-item hc-recent-item--inactive${isDeleted ? " hc-recent-item--deleted" : " hc-recent-item--ended"}${confirmRemove ? " hc-recent-item--confirm-remove" : ""}`}
      style={recentStyle}
      onClick={handleInactiveClick}
      aria-label={confirmRemove ? `Remove ${rowLabel} from recent games` : `${rowLabel}, ${status.toLowerCase()}. Mark for removal`}
      data-tooltip={resultTooltip && !confirmRemove ? resultTooltip : undefined}
      data-tooltip-pos="right"
      data-tooltip-variant="info"
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
