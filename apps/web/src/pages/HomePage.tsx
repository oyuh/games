import { DEFAULT_IMPOSTER_CLUE_VISIBILITY, GAME_META, IMPOSTER_CLUE_VISIBILITY_OPTIONS, imposterCategories, imposterCategoryLabels, chainCategories, chainCategoryLabels, multiplayerTypeToGameSlug, passwordCategories, passwordCategoryLabels, mutators, queries } from "@games/shared";
import { optimistic, useQuery, useZero } from "../lib/zero";
import "../styles/home.css";
import { nanoid } from "nanoid";
import { FormEvent, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { IconType } from "react-icons";
import { FiArrowLeft, FiBookOpen, FiCheck, FiChevronDown, FiChevronRight, FiClock, FiDroplet, FiEdit2, FiGlobe, FiHelpCircle, FiList, FiMapPin, FiSearch, FiSliders, FiTarget, FiTrash2, FiUserCheck, FiUsers, FiWifiOff } from "react-icons/fi";
import { addRecentGame, clearRecentGames, ensureName as ensureSessionName, getDisplayName, getOrCreateStoredName, getRecentGames, hasVisited, leaveCurrentGame, markVisited, RecentGame, removeRecentGame, SessionGameType, setStoredName } from "../lib/session";
import { showToast } from "../lib/toast";
import { isNameRestricted } from "../hooks/useAdminBroadcast";
import { useIsMobile } from "../hooks/useIsMobile";
import { MobileHomePage } from "../mobile/pages/MobileHomePage";
import { InSessionModal } from "../components/shared/InSessionModal";
import { ActiveGameModal } from "../components/shared/ActiveGameBanner";
import { PublicGamesList, usePublicGameCount } from "../components/shared/PublicGamesBrowser";
import { SoloGameCard, type SoloGameDef } from "../components/shared/SoloGameCard";
import { GameIcon } from "../components/shared/GameIcon";
import { getHomeRouteGame, type HomeRouteGame } from "../lib/home-route-highlight";

const ImposterDemo = lazy(() => import("../components/demos/ImposterDemo").then(({ ImposterDemo }) => ({ default: ImposterDemo })));
const PasswordDemo = lazy(() => import("../components/demos/PasswordDemo").then(({ PasswordDemo }) => ({ default: PasswordDemo })));
const ChainDemo = lazy(() => import("../components/demos/ChainDemo").then(({ ChainDemo }) => ({ default: ChainDemo })));
const ShadeDemo = lazy(() => import("../components/demos/ShadeDemo").then(({ ShadeDemo }) => ({ default: ShadeDemo })));
const LocationDemo = lazy(() => import("../components/demos/LocationDemo").then(({ LocationDemo }) => ({ default: LocationDemo })));
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
    bgGradient: "linear-gradient(160deg, #1a2e26 0%, #1a1a1a 100%)",
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
    bgGradient: "linear-gradient(160deg, #2e2218 0%, #1a1a1a 100%)",
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
    bgGradient: "linear-gradient(160deg, #182530 0%, #1a1a1a 100%)",
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

/** Scroll-wheel on a <select> cycles through its options */
function wheelSelect<T>(value: T, opts: readonly T[], set: (v: T) => void) {
  return (e: React.WheelEvent) => {
    const i = opts.indexOf(value);
    if (i < 0) return;
    const next = e.deltaY < 0 ? Math.max(0, i - 1) : Math.min(opts.length - 1, i + 1);
    const nextVal = opts[next];
    if (next !== i && nextVal !== undefined) set(nextVal);
  };
}

function formatClueVisibility(value: number) {
  if (value <= 0) return "No hints";
  if (value >= 1) return "Full clues";
  return `${Math.round(value * 100)}% shown`;
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

function HomePageDesktop({ sessionId }: { sessionId: string }) {

  const zero = useZero();
  const navigate = useNavigate();
  const location = useLocation();
  const routeHighlight = useMemo(() => getHomeRouteGame(location.search), [location.search]);
  // Multiplayer is local-first: create / join / browse apply optimistically and
  // the Zero client flushes to the server on its own once sync reconnects, so we
  // never gate these controls on the connection or show a "sync connecting" state
  // on them. These stay as constants so the existing render sites collapse to the
  // clean, no-noise state.
  // ponytail: the inline `false &&` sync-status branches (spinner/wifi-off) are
  // now dead; scrub them from the JSX on the next pass through this file.
  const syncOffline = false;
  const syncPending = false;
  const syncAttention = false;
  const syncStatusTooltip = "Browse Public Games";
  const [name, setName] = useState(() => getOrCreateStoredName(sessionId));
  const [savedName, setSavedName] = useState(() => getOrCreateStoredName(sessionId));
  const [firstVisit, setFirstVisit] = useState(() => !hasVisited());
  const [activeRouteHighlight, setActiveRouteHighlight] = useState<HomeRouteGame | null>(routeHighlight);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Sync when name is changed externally (e.g. welcome modal)
  useEffect(() => {
    const handler = (e: Event) => {
      const newName = (e as CustomEvent<string>).detail || "";
      setName(newName);
      setSavedName(newName);
    };
    window.addEventListener("games:name-changed", handler);
    return () => window.removeEventListener("games:name-changed", handler);
  }, []);
  const [recentGames, setRecentGames] = useState(() => getRecentGames());
  const [joinCode, setJoinCode] = useState("");
  const [pendingAction, setPendingAction] = useState<"create-imposter" | "create-password" | "create-chain" | "create-shade" | "create-location" | "join" | null>(null);
  const [imposterMatches] = useQuery(queries.imposter.byCode({ code: joinCode || "______" }));
  const [passwordMatches] = useQuery(queries.password.byCode({ code: joinCode || "______" }));
  const [chainMatches] = useQuery(queries.chainReaction.byCode({ code: joinCode || "______" }));
  const [shadeMatches] = useQuery(queries.shadeSignal.byCode({ code: joinCode || "______" }));
  const [locationMatches] = useQuery(queries.locationSignal.byCode({ code: joinCode || "______" }));
  const [mySessionRows] = useQuery(queries.sessions.byId({ id: sessionId }));
  const [showInSessionModal, setShowInSessionModal] = useState(false);
  const [joiningFromOtherGame, setJoiningFromOtherGame] = useState(false);
  const [pendingJoinTarget, setPendingJoinTarget] = useState<{ gameType: SessionGameType; gameId: string; code: string; route: string } | null>(null);

  // Per-card browse mode
  const [imposterBrowsing, setImposterBrowsing] = useState(false);
  const [passwordBrowsing, setPasswordBrowsing] = useState(false);
  const [chainBrowsing, setChainBrowsing] = useState(false);
  const [shadeBrowsing, setShadeBrowsing] = useState(false);
  const [locationBrowsing, setLocationBrowsing] = useState(false);

  // Public game counts
  const imposterPublicCount = usePublicGameCount("imposter");
  const passwordPublicCount = usePublicGameCount("password");
  const chainPublicCount = usePublicGameCount("chain_reaction");
  const shadePublicCount = usePublicGameCount("shade_signal");
  const locationPublicCount = usePublicGameCount("location_signal");

  // Imposter config
  const [imposterExpanded, setImposterExpanded] = useState(false);
  const [imposterCategory, setImposterCategory] = useState("animals");
  const [imposterImposters, setImposterImposters] = useState(1);
  const [imposterRounds, setImposterRounds] = useState(3);
  const [imposterClueVisibility, setImposterClueVisibility] = useState(DEFAULT_IMPOSTER_CLUE_VISIBILITY);

  // Password config
  const [passwordExpanded, setPasswordExpanded] = useState(false);
  const [passwordCategory, setPasswordCategory] = useState("animals");
  const [passwordTeams, setPasswordTeams] = useState(2);
  const [passwordTargetScore, setPasswordTargetScore] = useState(10);

  // Chain Reaction config
  const [chainExpanded, setChainExpanded] = useState(false);
  const [chainCategory, setChainCategory] = useState("animals");
  const [chainLength, setChainLength] = useState(5);
  const [chainRounds, setChainRounds] = useState(3);
  const [chainMode, setChainMode] = useState<"premade" | "custom">("premade");

  // Shade Signal config
  const [shadeExpanded, setShadeExpanded] = useState(false);
  const [shadeRoundsPerPlayer, setShadeRoundsPerPlayer] = useState(1);
  const [shadeHardMode, setShadeHardMode] = useState(false);
  const [shadeLeaderPick, setShadeLeaderPick] = useState(false);
  const [locationExpanded, setLocationExpanded] = useState(false);
  const [locCluePairs, setLocCluePairs] = useState(2);
  const [locRoundsPerPlayer, setLocRoundsPerPlayer] = useState(1);
  const [activeDemo, setActiveDemo] = useState<string | null>(null);
  const [recentCollapsed, setRecentCollapsed] = useState(true);

  // Mobile scroll dot tracking
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeDot, setActiveDot] = useState(0);

  useEffect(() => {
    setActiveRouteHighlight(routeHighlight);
  }, [routeHighlight]);

  const dismissRouteHighlight = useCallback(() => {
    setActiveRouteHighlight(null);
  }, []);

  useEffect(() => {
    if (!activeRouteHighlight) return;
    const options = { once: true } as AddEventListenerOptions;
    window.addEventListener("pointermove", dismissRouteHighlight, options);
    window.addEventListener("pointerdown", dismissRouteHighlight, options);
    window.addEventListener("keydown", dismissRouteHighlight, options);
    window.addEventListener("touchstart", dismissRouteHighlight, options);
    return () => {
      window.removeEventListener("pointermove", dismissRouteHighlight);
      window.removeEventListener("pointerdown", dismissRouteHighlight);
      window.removeEventListener("keydown", dismissRouteHighlight);
      window.removeEventListener("touchstart", dismissRouteHighlight);
    };
  }, [activeRouteHighlight, dismissRouteHighlight]);

  useEffect(() => {
    if (!activeRouteHighlight) return;
    const animationFrame = window.requestAnimationFrame(() => {
      const card = scrollRef.current?.querySelector<HTMLElement>(`[data-home-game-card="${activeRouteHighlight}"]`);
      card?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [activeRouteHighlight]);

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

  // Auto-focus name input on first visit
  useEffect(() => {
    if (firstVisit && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [firstVisit]);

  /** Assign a random name if the user doesn't have one yet */
  const ensureName = useCallback(async () => {
    const resolved = await ensureSessionName(zero, sessionId);
    setName(resolved);
    setSavedName(resolved);
    return resolved;
  }, [zero, sessionId]);

  const dismissFirstVisit = useCallback(() => {
    if (firstVisit) {
      void ensureName();
      markVisited();
      setFirstVisit(false);
    }
  }, [firstVisit, ensureName]);

  // Dismiss first-visit state on any click anywhere on the page
  useEffect(() => {
    if (!firstVisit) return;
    const handler = () => dismissFirstVisit();
    window.addEventListener("click", handler, { capture: true });
    return () => window.removeEventListener("click", handler, { capture: true });
  }, [firstVisit, dismissFirstVisit]);

  const saveName = async (event: FormEvent) => {
    event.preventDefault();
    dismissFirstVisit();
    const sanitizedName = name.replace(/\s/g, "") || getDisplayName(null, sessionId);
    if (sanitizedName && isNameRestricted(sanitizedName)) {
      showToast("That name is restricted by admin. Pick another one.", "error");
      return;
    }

    try {
      await optimistic(zero.mutate(mutators.sessions.setName({ id: sessionId, name: sanitizedName })));
      setStoredName(sanitizedName);
      setName(sanitizedName);
      setSavedName(sanitizedName);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to save name.", "error");
    }
  };

  const createImposter = async () => {    setPendingAction("create-imposter");
    const id = nanoid();
    try {
      await ensureName();
      const result = await optimistic(zero.mutate(mutators.imposter.create({ id, hostId: sessionId, category: imposterCategory, rounds: imposterRounds, imposters: imposterImposters, clueVisibility: imposterClueVisibility })));
      if (result.type === "error") {
        showToast(result.error.message, "error");
        return;
      }
      navigate(`/imposter/${id}`);
    } finally {
      setPendingAction(null);
    }
  };

  const createPassword = async () => {    setPendingAction("create-password");
    const id = nanoid();
    try {
      await ensureName();
      const result = await optimistic(zero.mutate(mutators.password.create({ id, hostId: sessionId, teamCount: passwordTeams, targetScore: passwordTargetScore, category: passwordCategory })));
      if (result.type === "error") {
        showToast(result.error.message, "error");
        return;
      }
      navigate(`/password/${id}/begin`);
    } finally {
      setPendingAction(null);
    }
  };

  const createChainReaction = async () => {    setPendingAction("create-chain");
    const id = nanoid();
    try {
      await ensureName();
      const result = await optimistic(zero.mutate(mutators.chainReaction.create({ id, hostId: sessionId, chainLength, rounds: chainRounds, chainMode, category: chainCategory })));
      if (result.type === "error") {
        showToast(result.error.message, "error");
        return;
      }
      navigate(`/chain/${id}`);
    } finally {
      setPendingAction(null);
    }
  };

  const createShadeSignal = async () => {    setPendingAction("create-shade");
    const id = nanoid();
    try {
      await ensureName();
      const result = await optimistic(zero.mutate(mutators.shadeSignal.create({ id, hostId: sessionId, roundsPerPlayer: shadeRoundsPerPlayer, hardMode: shadeHardMode, leaderPick: shadeLeaderPick })));
      if (result.type === "error") {
        showToast(result.error.message, "error");
        return;
      }
      navigate(`/shade/${id}`);
    } finally {
      setPendingAction(null);
    }
  };

  const createLocationSignal = async () => {    setPendingAction("create-location");
    const id = nanoid();
    try {
      await ensureName();
      const result = await optimistic(zero.mutate(mutators.locationSignal.create({ id, hostId: sessionId, roundsPerPlayer: locRoundsPerPlayer, cluePairs: locCluePairs })));
      if (result.type === "error") {
        showToast(result.error.message, "error");
        return;
      }
      navigate(`/location/${id}`);
    } finally {
      setPendingAction(null);
    }
  };

  const joinAny = async () => {
    const normalizedCode = joinCode.trim().toUpperCase();
    if (!normalizedCode) {
      showToast("Enter a join code first.", "error");
      return;
    }    setPendingAction("join");
    // Make sure the player has a name before joining any game
    await ensureName();

    const mySession = mySessionRows[0] ?? null;
    const activeGameType = (mySession?.game_type ?? null) as SessionGameType | null;
    const activeGameId = mySession?.game_id ?? null;

    const queueJoinIfNeeded = (target: { gameType: SessionGameType; gameId: string; code: string; route: string }) => {
      const inAnotherGame = Boolean(activeGameType && activeGameId && (activeGameType !== target.gameType || activeGameId !== target.gameId));
      if (inAnotherGame) {
        if (activeGameType && activeGameId) {
          void leaveCurrentGame(zero, sessionId, activeGameType, activeGameId)
            .catch(() => showToast("Couldn't leave previous game cleanly", "error"));
        }
      }
      return false;
    };

    const performJoinTarget = async (target: { gameType: SessionGameType; gameId: string; code: string; route: string }) => {
      if (target.gameType === "imposter") {
        const result = await optimistic(zero.mutate(mutators.imposter.join({ gameId: target.gameId, sessionId })));
        if (result.type === "error") { showToast(result.error.message, "error"); return; }
      } else if (target.gameType === "password") {
        const result = await optimistic(zero.mutate(mutators.password.join({ gameId: target.gameId, sessionId })));
        if (result.type === "error") { showToast(result.error.message, "error"); return; }
      } else if (target.gameType === "chain_reaction") {
        const result = await optimistic(zero.mutate(mutators.chainReaction.join({ gameId: target.gameId, sessionId })));
        if (result.type === "error") { showToast(result.error.message, "error"); return; }
      } else if (target.gameType === "shade_signal") {
        const result = await optimistic(zero.mutate(mutators.shadeSignal.join({ gameId: target.gameId, sessionId })));
        if (result.type === "error") { showToast(result.error.message, "error"); return; }
      } else {
        const result = await optimistic(zero.mutate(mutators.locationSignal.join({ gameId: target.gameId, sessionId })));
        if (result.type === "error") { showToast(result.error.message, "error"); return; }
      }
      addRecentGame({ id: target.gameId, code: target.code, gameType: target.gameType });
      setRecentGames(getRecentGames());
      navigate(target.route);
    };

    try {
      const imposterGame = imposterMatches[0];
      if (imposterGame) {
        const target = { gameType: "imposter" as const, gameId: imposterGame.id, code: imposterGame.code, route: `/imposter/${imposterGame.id}` };
        if (queueJoinIfNeeded(target)) return;
        await performJoinTarget(target);
        return;
      }
      const passwordGame = passwordMatches[0];
      if (passwordGame) {
        const target = { gameType: "password" as const, gameId: passwordGame.id, code: passwordGame.code, route: `/password/${passwordGame.id}/begin` };
        if (queueJoinIfNeeded(target)) return;
        await performJoinTarget(target);
        return;
      }
      const chainGame = chainMatches[0];
      if (chainGame) {
        const target = { gameType: "chain_reaction" as const, gameId: chainGame.id, code: chainGame.code, route: `/chain/${chainGame.id}` };
        if (queueJoinIfNeeded(target)) return;
        await performJoinTarget(target);
        return;
      }
      const shadeGame = shadeMatches[0];
      if (shadeGame) {
        const target = { gameType: "shade_signal" as const, gameId: shadeGame.id, code: shadeGame.code, route: `/shade/${shadeGame.id}` };
        if (queueJoinIfNeeded(target)) return;
        await performJoinTarget(target);
        return;
      }

      const locationGame = locationMatches[0];
      if (locationGame) {
        const target = { gameType: "location_signal" as const, gameId: locationGame.id, code: locationGame.code, route: `/location/${locationGame.id}` };
        if (queueJoinIfNeeded(target)) return;
        await performJoinTarget(target);
        return;
      }
      showToast("No game found for that code.", "error");
    } finally {
      setPendingAction(null);
    }
  };

  const confirmLeaveAndJoin = () => {
    if (!pendingJoinTarget) {
      setShowInSessionModal(false);
      return;
    }
    const mySession = mySessionRows[0] ?? null;
    const activeGameType = (mySession?.game_type ?? null) as SessionGameType | null;
    const activeGameId = mySession?.game_id ?? null;
    if (!activeGameType || !activeGameId) {
      setShowInSessionModal(false);
      setPendingJoinTarget(null);
      return;
    }
    setJoiningFromOtherGame(true);
    void leaveCurrentGame(zero, sessionId, activeGameType, activeGameId)
      .then(async () => {
        const target = pendingJoinTarget;
        if (!target) return;
        if (target.gameType === "imposter") {
          const result = await optimistic(zero.mutate(mutators.imposter.join({ gameId: target.gameId, sessionId })));
          if (result.type === "error") { showToast(result.error.message, "error"); return; }
        } else if (target.gameType === "password") {
          const result = await optimistic(zero.mutate(mutators.password.join({ gameId: target.gameId, sessionId })));
          if (result.type === "error") { showToast(result.error.message, "error"); return; }
        } else if (target.gameType === "chain_reaction") {
          const result = await optimistic(zero.mutate(mutators.chainReaction.join({ gameId: target.gameId, sessionId })));
          if (result.type === "error") { showToast(result.error.message, "error"); return; }
        } else if (target.gameType === "shade_signal") {
          const result = await optimistic(zero.mutate(mutators.shadeSignal.join({ gameId: target.gameId, sessionId })));
          if (result.type === "error") { showToast(result.error.message, "error"); return; }
        } else {
          const result = await optimistic(zero.mutate(mutators.locationSignal.join({ gameId: target.gameId, sessionId })));
          if (result.type === "error") { showToast(result.error.message, "error"); return; }
        }
        addRecentGame({ id: target.gameId, code: target.code, gameType: target.gameType });
        setRecentGames(getRecentGames());
        navigate(target.route);
      })
      .catch(() => showToast("Couldn't leave current game", "error"))
      .finally(() => {
        setJoiningFromOtherGame(false);
        setShowInSessionModal(false);
        setPendingJoinTarget(null);
        setPendingAction(null);
      });
  };

  const firstVisitGlowClass = firstVisit && !activeRouteHighlight ? " home-card--glow" : "";
  const dimmedClass = (game: HomeRouteGame) =>
    firstVisit && activeRouteHighlight !== game ? " home-card--dimmed" : "";
  const routeHighlightClass = (game: HomeRouteGame) =>
    activeRouteHighlight === game ? " home-card--route-highlight" : "";

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
          {/* First-visit hint */}
          {firstVisit && (
            <div className="hc-first-visit-hint">
              <span className="hc-first-visit-hint-icon">&#9889;</span>
              <p>Welcome! Set a display name to get started, or just skip and jump into a game.</p>
            </div>
          )}


          {/* Join section */}
          <section className="hc-section">
            <h3 className="hc-label" data-tooltip="Enter a 6-character room code to join a friend's game" data-tooltip-variant="info">
              <FiSearch size={14} style={{ opacity: 0.6 }} /> Join Game
              {syncPending && <SyncMiniSpinner className="hc-sync-mini-spinner--label" />}
              {syncAttention && <FiWifiOff className="hc-sync-offline-icon hc-sync-offline-icon--label" size={14} />}
            </h3>
            <form
              className="hc-row"
              onSubmit={(e) => { e.preventDefault(); if (joinCode.length === 6 && pendingAction === null) void joinAny(); }}
            >
              <input
                className={`input flex-1 hc-join-input${joinCode.length === 6 ? " hc-join-input--ready" : ""}`}
                value={joinCode}
                onChange={(e) =>
                  setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))
                }
                onClick={() => { if (joinCode.length === 6 && pendingAction === null) void joinAny(); }}
                placeholder="ABCXYZ"
                maxLength={6}
                disabled={pendingAction === "join"}
                data-tooltip={syncOffline ? syncStatusTooltip : joinCode.length === 6 ? "Click or press Enter to join!" : "Paste or type a 6-letter code"}
                data-tooltip-variant={joinCode.length === 6 && !syncOffline ? "success" : "info"}
              />
            </form>
            <div className="hc-divider" />
          </section>
          {/* Name section - inline editable */}
          <section className="hc-section">
            <h3 className="hc-label" data-tooltip="Your in-game identity - visible to other players" data-tooltip-variant="info">Display Name</h3>
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
          <h2 className={`hc-game-title-lg${imposterExpanded || imposterBrowsing ? " hc-game-title-lg--compact" : ""}`}>Imposter</h2>

          {imposterBrowsing ? (
            <div className="hc-card-anim" key="browse">
              <PublicGamesList gameType="imposter" sessionId={sessionId} />
            </div>
          ) : imposterExpanded ? (
            <div className="hc-card-anim" key="config">
              <div className="hc-config">
                <div className="hc-config-field">
                  <label htmlFor="home-imposter-category" className="hc-config-label" data-tooltip="The theme for the word list. Everyone gets a word from this category - except the imposter." data-tooltip-variant="info">Category</label>
                  <select
                    id="home-imposter-category"
                    className="input"
                    value={imposterCategory}
                    onChange={(e) => setImposterCategory(e.target.value)}
                    onWheel={wheelSelect(imposterCategory, imposterCategories as string[], setImposterCategory)}
                  >
                    {imposterCategories.map((key) => (
                      <option key={key} value={key}>{imposterCategoryLabels[key] ?? key}</option>
                    ))}
                  </select>
                </div>
                <div className="hc-config-row">
                  <div className="hc-config-field flex-1">
                    <label htmlFor="home-imposter-count" className="hc-config-label" data-tooltip="How many players are secretly the imposter each round. More imposters = harder for the group." data-tooltip-variant="info">Imposters</label>
                    <select
                      id="home-imposter-count"
                      className="input"
                      value={imposterImposters}
                      onChange={(e) => setImposterImposters(Number(e.target.value))}
                      onWheel={wheelSelect(imposterImposters, [1, 2, 3], setImposterImposters)}
                    >
                      {[1, 2, 3].map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                  <div className="hc-config-field flex-1">
                    <label htmlFor="home-imposter-rounds" className="hc-config-label" data-tooltip="How many rounds to play. Each round, a new imposter is chosen and everyone votes." data-tooltip-variant="info">Rounds</label>
                    <select
                      id="home-imposter-rounds"
                      className="input"
                      value={imposterRounds}
                      onChange={(e) => setImposterRounds(Number(e.target.value))}
                      onWheel={wheelSelect(imposterRounds, [1, 2, 3, 5, 7, 10], setImposterRounds)}
                    >
                      {[1, 2, 3, 5, 7, 10].map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="hc-config-field">
                  <label htmlFor="home-imposter-clue-visibility" className="hc-config-label" data-tooltip="How much of submitted clues the imposter can peek at before sending their clue." data-tooltip-variant="info">Hint Visibility</label>
                  <select
                    id="home-imposter-clue-visibility"
                    className="input"
                    value={imposterClueVisibility}
                    onChange={(e) => setImposterClueVisibility(Number(e.target.value))}
                    onWheel={wheelSelect(imposterClueVisibility, IMPOSTER_CLUE_VISIBILITY_OPTIONS, setImposterClueVisibility)}
                  >
                    {IMPOSTER_CLUE_VISIBILITY_OPTIONS.map((value) => (
                      <option key={value} value={value}>{formatClueVisibility(value)}</option>
                    ))}
                  </select>
                </div>
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
              <>
              <div className="hc-row">
                <button className={`btn hc-browse-globe${imposterPublicCount === 0 ? " hc-globe-empty" : ""}${syncOffline ? " hc-sync-pending-control" : ""}${syncAttention ? " hc-sync-unavailable-control" : ""}`} onClick={() => { setImposterExpanded(false); setImposterBrowsing(true); }} data-tooltip={syncStatusTooltip} data-tooltip-variant="info">
                  {syncPending ? <SyncMiniSpinner /> : syncAttention ? <FiWifiOff size={18} /> : <FiGlobe size={18} />}
                  {!syncOffline && imposterPublicCount > 0 && <span className="hc-globe-badge">{imposterPublicCount}</span>}
                </button>
                <button className="btn btn-primary flex-1" onClick={() => setImposterExpanded(true)}>
                  Create Game
                </button>
                <button className="btn hc-help-btn" onClick={() => setActiveDemo("imposter")} data-tooltip="How to Play" data-tooltip-variant="info">
                  <FiHelpCircle size={18} />
                </button>
              </div>
              </>
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
          <h2 className={`hc-game-title-lg${passwordExpanded || passwordBrowsing ? " hc-game-title-lg--compact" : ""}`}>Password</h2>

          {passwordBrowsing ? (
            <div className="hc-card-anim" key="browse">
              <PublicGamesList gameType="password" sessionId={sessionId} />
            </div>
          ) : passwordExpanded ? (
            <div className="hc-card-anim" key="config">
              <div className="hc-config">
                <div className="hc-config-field">
                  <label htmlFor="home-password-category" className="hc-config-label" data-tooltip="The theme for the word list. Words will be drawn from this category." data-tooltip-variant="info">Category</label>
                  <select
                    id="home-password-category"
                    className="input"
                    value={passwordCategory}
                    onChange={(e) => setPasswordCategory(e.target.value)}
                    onWheel={wheelSelect(passwordCategory, passwordCategories as string[], setPasswordCategory)}
                  >
                    {passwordCategories.map((key) => (
                      <option key={key} value={key}>{passwordCategoryLabels[key] ?? key}</option>
                    ))}
                  </select>
                </div>
                <div className="hc-config-row">
                  <div className="hc-config-field flex-1">
                    <label htmlFor="home-password-teams" className="hc-config-label" data-tooltip="Split players into this many teams. Teams take turns giving and guessing clues." data-tooltip-variant="info">Teams</label>
                    <select
                      id="home-password-teams"
                      className="input"
                      value={passwordTeams}
                      onChange={(e) => setPasswordTeams(Number(e.target.value))}
                      onWheel={wheelSelect(passwordTeams, [2, 3, 4, 5, 6], setPasswordTeams)}
                    >
                      {[2, 3, 4, 5, 6].map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                  <div className="hc-config-field flex-1">
                    <label htmlFor="home-password-target-score" className="hc-config-label" data-tooltip="The score a team needs to win. Higher = longer game." data-tooltip-variant="info">Target Score</label>
                    <select
                      id="home-password-target-score"
                      className="input"
                      value={passwordTargetScore}
                      onChange={(e) => setPasswordTargetScore(Number(e.target.value))}
                      onWheel={wheelSelect(passwordTargetScore, [3, 5, 7, 10, 15, 20], setPasswordTargetScore)}
                    >
                      {[3, 5, 7, 10, 15, 20].map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                </div>
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
              <>
              <div className="hc-row">
                <button className={`btn hc-browse-globe${passwordPublicCount === 0 ? " hc-globe-empty" : ""}${syncOffline ? " hc-sync-pending-control" : ""}${syncAttention ? " hc-sync-unavailable-control" : ""}`} onClick={() => { setPasswordExpanded(false); setPasswordBrowsing(true); }} data-tooltip={syncStatusTooltip} data-tooltip-variant="info">
                  {syncPending ? <SyncMiniSpinner /> : syncAttention ? <FiWifiOff size={18} /> : <FiGlobe size={18} />}
                  {!syncOffline && passwordPublicCount > 0 && <span className="hc-globe-badge">{passwordPublicCount}</span>}
                </button>
                <button className="btn btn-primary flex-1" onClick={() => setPasswordExpanded(true)}>
                  Create Game
                </button>
                <button className="btn hc-help-btn" onClick={() => setActiveDemo("password")} data-tooltip="How to Play" data-tooltip-variant="info">
                  <FiHelpCircle size={18} />
                </button>
              </div>
              </>
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
          <h2 className={`hc-game-title-lg${chainExpanded || chainBrowsing ? " hc-game-title-lg--compact" : ""}`}>Chain Reaction</h2>

          {chainBrowsing ? (
            <div className="hc-card-anim" key="browse">
              <PublicGamesList gameType="chain_reaction" sessionId={sessionId} />
            </div>
          ) : chainExpanded ? (
            <div className="hc-card-anim" key="config">
              <div className="hc-config">
                <div className="hc-config-field">
                  <label htmlFor="home-chain-category" className="hc-config-label" data-tooltip="The theme for the word chains. Chains will be drawn from this category." data-tooltip-variant="info">Category</label>
                  <select
                    id="home-chain-category"
                    className="input"
                    value={chainCategory}
                    onChange={(e) => setChainCategory(e.target.value)}
                    onWheel={wheelSelect(chainCategory, chainCategories as string[], setChainCategory)}
                  >
                    {chainCategories.map((key) => (
                      <option key={key} value={key}>{chainCategoryLabels[key] ?? key}</option>
                    ))}
                  </select>
                </div>
                <div className="hc-config-row">
                  <div className="hc-config-field flex-1">
                    <label htmlFor="home-chain-length" className="hc-config-label" data-tooltip="How many words in the chain. Each word links to the next - longer chains are harder!" data-tooltip-variant="info">Length</label>
                    <select
                      id="home-chain-length"
                      className="input"
                      value={chainLength}
                      onChange={(e) => setChainLength(Number(e.target.value))}
                      onWheel={wheelSelect(chainLength, [5, 6, 7, 8, 9, 10], setChainLength)}
                    >
                      {[5, 6, 7, 8, 9, 10].map((n) => (
                        <option key={n} value={n}>{n} words</option>
                      ))}
                    </select>
                  </div>
                  <div className="hc-config-field flex-1">
                    <label htmlFor="home-chain-rounds" className="hc-config-label" data-tooltip="How many chains to play. Each round is a fresh chain for both players." data-tooltip-variant="info">Rounds</label>
                    <select
                      id="home-chain-rounds"
                      className="input"
                      value={chainRounds}
                      onChange={(e) => setChainRounds(Number(e.target.value))}
                      onWheel={wheelSelect(chainRounds, [1, 2, 3, 5, 7], setChainRounds)}
                    >
                      {[1, 2, 3, 5, 7].map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="hc-config-field">
                  <label htmlFor="home-chain-mode" className="hc-config-label" data-tooltip="Random uses pre-made chains. Custom lets both players write their own chain for the other to solve." data-tooltip-variant="info">Mode</label>
                  <select
                    id="home-chain-mode"
                    className="input"
                    value={chainMode}
                    onChange={(e) => setChainMode(e.target.value as "premade" | "custom")}
                    onWheel={wheelSelect(chainMode, ["premade", "custom"] as const, (v) => setChainMode(v as "premade" | "custom"))}
                  >
                    <option value="premade">Random (premade)</option>
                    <option value="custom">Custom (write your own)</option>
                  </select>
                </div>
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
              <>
              <div className="hc-row">
                <button className={`btn hc-browse-globe${chainPublicCount === 0 ? " hc-globe-empty" : ""}${syncOffline ? " hc-sync-pending-control" : ""}${syncAttention ? " hc-sync-unavailable-control" : ""}`} onClick={() => { setChainExpanded(false); setChainBrowsing(true); }} data-tooltip={syncStatusTooltip} data-tooltip-variant="info">
                  {syncPending ? <SyncMiniSpinner /> : syncAttention ? <FiWifiOff size={18} /> : <FiGlobe size={18} />}
                  {!syncOffline && chainPublicCount > 0 && <span className="hc-globe-badge">{chainPublicCount}</span>}
                </button>
                <button className="btn btn-primary flex-1" onClick={() => setChainExpanded(true)}>
                  Create Game
                </button>
                <button className="btn hc-help-btn" onClick={() => setActiveDemo("chain")} data-tooltip="How to Play" data-tooltip-variant="info">
                  <FiHelpCircle size={18} />
                </button>
              </div>
              </>
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
          <h2 className={`hc-game-title-lg${shadeExpanded || shadeBrowsing ? " hc-game-title-lg--compact" : ""}`}>Shade Signal</h2>

          {shadeBrowsing ? (
            <div className="hc-card-anim" key="browse">
              <PublicGamesList gameType="shade_signal" sessionId={sessionId} />
            </div>
          ) : shadeExpanded ? (
            <div className="hc-card-anim" key="config">
              <div className="hc-config">
                <div className="hc-config-row">
                  <div className="hc-config-field flex-1">
                    <label htmlFor="home-shade-rounds-per-player" className="hc-config-label" data-tooltip="Each player takes a turn as Leader. This controls how many turns each person gets, so more = longer game." data-tooltip-variant="info">Game Length</label>
                    <select
                      id="home-shade-rounds-per-player"
                      className="input"
                      value={shadeRoundsPerPlayer}
                      onChange={(e) => setShadeRoundsPerPlayer(Number(e.target.value))}
                      onWheel={wheelSelect(shadeRoundsPerPlayer, [1, 2, 3], setShadeRoundsPerPlayer)}
                    >
                      <option value={1}>Quick</option>
                      <option value={2}>Standard</option>
                      <option value={3}>Long</option>
                    </select>
                  </div>
                  <div className="hc-config-field flex-1">
                    <label htmlFor="home-shade-clue-rules" className="hc-config-label" data-tooltip="Controls what the Leader can say in their clue. &quot;No Color Names&quot; bans words like red, blue, green, etc." data-tooltip-variant="info">Clue Rules</label>
                    <select
                      id="home-shade-clue-rules"
                      className="input"
                      value={shadeHardMode ? "yes" : "no"}
                      onChange={(e) => setShadeHardMode(e.target.value === "yes")}
                    >
                      <option value="no">Normal</option>
                      <option value="yes">No Colors</option>
                    </select>
                  </div>
                </div>
                <label className="hc-config-check">
                  <input
                    type="checkbox"
                    checked={shadeLeaderPick}
                    onChange={(e) => setShadeLeaderPick(e.target.checked)}
                  />
                  🎨 Leader picks their own color
                </label>
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
              <>
              <div className="hc-row">
                <button className={`btn hc-browse-globe${shadePublicCount === 0 ? " hc-globe-empty" : ""}${syncOffline ? " hc-sync-pending-control" : ""}${syncAttention ? " hc-sync-unavailable-control" : ""}`} onClick={() => { setShadeExpanded(false); setShadeBrowsing(true); }} data-tooltip={syncStatusTooltip} data-tooltip-variant="info">
                  {syncPending ? <SyncMiniSpinner /> : syncAttention ? <FiWifiOff size={18} /> : <FiGlobe size={18} />}
                  {!syncOffline && shadePublicCount > 0 && <span className="hc-globe-badge">{shadePublicCount}</span>}
                </button>
                <button className="btn btn-primary flex-1" onClick={() => setShadeExpanded(true)}>
                  Create Game
                </button>
                <button className="btn hc-help-btn" onClick={() => setActiveDemo("shade")} data-tooltip="How to Play" data-tooltip-variant="info">
                  <FiHelpCircle size={18} />
                </button>
              </div>
              </>
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
          <h2 className={`hc-game-title-lg${locationExpanded || locationBrowsing ? " hc-game-title-lg--compact" : ""}`}>Location Signal</h2>

          {locationBrowsing ? (
            <div className="hc-card-anim" key="browse">
              <PublicGamesList gameType="location_signal" sessionId={sessionId} />
            </div>
          ) : locationExpanded ? (
            <div className="hc-card-anim" key="config">
              <div className="hc-config">
                <div className="hc-config-row">
                  <div className="hc-config-field flex-1">
                    <label htmlFor="home-location-clue-pairs" className="hc-config-label" data-tooltip="How many clue + guess pairs per round. More pairs means the leader gives more hints and guessers refine their answer." data-tooltip-variant="info">Clue Pairs</label>
                    <select
                      id="home-location-clue-pairs"
                      className="input"
                      value={locCluePairs}
                      onChange={(e) => setLocCluePairs(Number(e.target.value))}
                      onWheel={wheelSelect(locCluePairs, [1, 2, 3, 4], setLocCluePairs)}
                    >
                      <option value={1}>1 pair</option>
                      <option value={2}>2 pairs</option>
                      <option value={3}>3 pairs</option>
                      <option value={4}>4 pairs</option>
                    </select>
                  </div>
                  <div className="hc-config-field flex-1">
                    <label htmlFor="home-location-rounds-per-player" className="hc-config-label" data-tooltip="How many rounds each player leads. More rounds means a longer session." data-tooltip-variant="info">Rounds/Player</label>
                    <select
                      id="home-location-rounds-per-player"
                      className="input"
                      value={locRoundsPerPlayer}
                      onChange={(e) => setLocRoundsPerPlayer(Number(e.target.value))}
                      onWheel={wheelSelect(locRoundsPerPlayer, [1, 2, 3], setLocRoundsPerPlayer)}
                    >
                      <option value={1}>1 each</option>
                      <option value={2}>2 each</option>
                      <option value={3}>3 each</option>
                    </select>
                  </div>
                </div>
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
              <>
              <div className="hc-row">
                <button className={`btn hc-browse-globe${locationPublicCount === 0 ? " hc-globe-empty" : ""}${syncOffline ? " hc-sync-pending-control" : ""}${syncAttention ? " hc-sync-unavailable-control" : ""}`} onClick={() => { setLocationExpanded(false); setLocationBrowsing(true); }} data-tooltip={syncStatusTooltip} data-tooltip-variant="info">
                  {syncPending ? <SyncMiniSpinner /> : syncAttention ? <FiWifiOff size={18} /> : <FiGlobe size={18} />}
                  {!syncOffline && locationPublicCount > 0 && <span className="hc-globe-badge">{locationPublicCount}</span>}
                </button>
                <button className="btn btn-primary flex-1" onClick={() => setLocationExpanded(true)}>
                  Create Game
                </button>
                <button className="btn hc-help-btn" onClick={() => setActiveDemo("location")} data-tooltip="How to Play" data-tooltip-variant="info">
                  <FiHelpCircle size={18} />
                </button>
              </div>
              </>
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
