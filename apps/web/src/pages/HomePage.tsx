import { imposterCategories, imposterCategoryLabels, chainCategories, chainCategoryLabels, passwordCategories, passwordCategoryLabels, mutators, queries } from "@games/shared";
import { useQuery, useZero } from "../lib/zero";
import "../styles/home.css";
import { nanoid } from "nanoid";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { IconType } from "react-icons";
import { FiBookOpen, FiCheck, FiChevronDown, FiChevronLeft, FiChevronRight, FiClock, FiDroplet, FiEdit2, FiGlobe, FiHelpCircle, FiList, FiMapPin, FiSearch, FiSliders, FiTarget, FiTrash2, FiUserCheck, FiUsers, FiZap, FiGrid } from "react-icons/fi";
import { addRecentGame, clearRecentGames, getRecentGames, getStoredName, hasVisited, leaveCurrentGame, markVisited, RecentGame, removeRecentGame, SessionGameType, setStoredName } from "../lib/session";
import { showToast } from "../lib/toast";
import { isNameRestricted } from "../hooks/useAdminBroadcast";
import { useIsMobile } from "../hooks/useIsMobile";
import { MobileHomePage } from "../mobile/pages/MobileHomePage";
import { InSessionModal } from "../components/shared/InSessionModal";
import { ActiveGameModal } from "../components/shared/ActiveGameBanner";
import { PublicGamesList, usePublicGameCount } from "../components/shared/PublicGamesBrowser";
import { ImposterDemo } from "../components/demos/ImposterDemo";
import { PasswordDemo } from "../components/demos/PasswordDemo";
import { ChainDemo } from "../components/demos/ChainDemo";
import { ShadeDemo } from "../components/demos/ShadeDemo";
import { LocationDemo } from "../components/demos/LocationDemo";
import { SoloGameCard, type SoloGameDef } from "../components/shared/SoloGameCard";
import { useZeroConnected } from "../App";
import { useSyncCountdown } from "../lib/sync-wake";

const isDev = import.meta.env.DEV;

/* ── Solo game definitions ────────────────────────────────────── */
const SOLO_GAMES: SoloGameDef[] = [
  {
    id: "shikaku", title: "Shikaku",
    description: "Divide the grid into rectangles.",
    icon: FiGrid, accent: "#34d399",
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
    id: "pips", title: "Pips",
    description: "Fill the board with dominoes. No duplicates.",
    icon: FiZap, accent: "#fb923c",
    bgGradient: "linear-gradient(160deg, #2e2218 0%, #1a1a1a 100%)",
    preview: (
      <div className="solo-preview-pips">
        <div className="solo-pips-domino solo-pips-domino--placed">
          <span className="solo-pips-half">●●</span>
          <span className="solo-pips-half">●●●</span>
        </div>
        <div className="solo-pips-domino solo-pips-domino--placed">
          <span className="solo-pips-half">●</span>
          <span className="solo-pips-half">●●●●</span>
        </div>
        <div className="solo-pips-domino">
          <span className="solo-pips-half">●●●</span>
          <span className="solo-pips-half">●●●●●</span>
        </div>
      </div>
    ),
  },
  {
    id: "nexus", title: "Nexus",
    description: "Connect nodes to complete the circuit.",
    icon: FiZap, accent: "#38bdf8",
    bgGradient: "linear-gradient(160deg, #182530 0%, #1a1a1a 100%)",
    preview: (
      <div className="solo-preview-nexus">
        <div className="solo-nexus-node solo-nexus-node--lit" />
        <div className="solo-nexus-edge" />
        <div className="solo-nexus-node" />
        <div className="solo-nexus-edge solo-nexus-edge--v" />
        <div />
        <div className="solo-nexus-edge solo-nexus-edge--v" />
        <div className="solo-nexus-node" />
        <div className="solo-nexus-edge" />
        <div className="solo-nexus-node solo-nexus-node--lit" />
      </div>
    ),
  },
];

/* ── Word bank for random names ──────────────────────── */
const adjectives = [
  "Swift", "Sneaky", "Cosmic", "Lucky", "Dizzy", "Frosty", "Bold", "Chill",
  "Witty", "Fierce", "Jolly", "Mystic", "Nifty", "Pixel", "Rapid", "Silent",
  "Turbo", "Vivid", "Wacky", "Zesty", "Brave", "Clever", "Funky", "Groovy",
  "Hyper", "Keen", "Lively", "Plucky", "Radiant", "Spunky", "Sleepy", "Stormy",
  "Sunny", "Fuzzy", "Crispy", "Bouncy", "Shifty", "Sparky", "Tricky", "Zippy",
];
const nouns = [
  "Panda", "Fox", "Falcon", "Otter", "Wolf", "Shark", "Raven", "Lynx",
  "Cobra", "Badger", "Hawk", "Tiger", "Bear", "Moose", "Owl", "Penguin",
  "Dragon", "Phoenix", "Pirate", "Knight", "Ninja", "Wizard", "Ghost", "Robot",
  "Yeti", "Gremlin", "Goblin", "Squid", "Toucan", "Ferret", "Walrus", "Jackal",
  "Beetle", "Puffin", "Coyote", "Mole", "Parrot", "Wasp", "Mantis", "Orca",
];

function randomName(): string {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)]!;
  const noun = nouns[Math.floor(Math.random() * nouns.length)]!;
  return `${adj}${noun}`;
}

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

type SummaryItem = { value: string; icon: IconType; label?: string; accent?: string };

function ConfigSummary({ items }: { items: SummaryItem[] }) {
  return (
    <div className="hc-summary" aria-label="Selected options">
      <div className="hc-summary-row">
        {items.map((item, idx) => (
          <span
            key={`${item.value}-${idx}`}
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

function HomePageDesktop({ sessionId }: { sessionId: string }) {

  const zero = useZero();
  const navigate = useNavigate();
  const zeroConnected = useZeroConnected();
  const syncOffline = !zeroConnected;
  const syncCountdown = useSyncCountdown();
  const [name, setName] = useState(getStoredName());
  const [savedName, setSavedName] = useState(getStoredName());
  const [firstVisit, setFirstVisit] = useState(() => !hasVisited());
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
  const [recentGames, setRecentGames] = useState(getRecentGames());
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
  const CARD_COUNT = 6;

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setActiveDot(Math.min(idx, CARD_COUNT - 1));
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
  const ensureName = useCallback(() => {
    if (!getStoredName()) {
      const generated = randomName();
      setStoredName(generated);
      setName(generated);
      setSavedName(generated);
      void zero.mutate(mutators.sessions.setName({ id: sessionId, name: generated }));
    }
  }, [zero, sessionId]);

  const dismissFirstVisit = useCallback(() => {
    if (firstVisit) {
      ensureName();
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
    const sanitizedName = name.replace(/\s/g, "");
    if (sanitizedName && isNameRestricted(sanitizedName)) {
      showToast("That name is restricted by admin. Pick another one.", "error");
      return;
    }

    try {
      if (sanitizedName) {
        await zero.mutate(mutators.sessions.setName({ id: sessionId, name: sanitizedName })).server;
      } else {
        await zero.mutate(mutators.sessions.upsert({ id: sessionId, name: null })).server;
      }
      setStoredName(sanitizedName);
      setSavedName(sanitizedName);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to save name.", "error");
    }
  };

  const createImposter = async () => {
    setPendingAction("create-imposter");
    const id = nanoid();
    try {
      const result = await zero.mutate(mutators.imposter.create({ id, hostId: sessionId, category: imposterCategory, rounds: imposterRounds, imposters: imposterImposters })).server;
      if (result.type === "error") {
        showToast(result.error.message, "error");
        return;
      }
      navigate(`/imposter/${id}`);
    } finally {
      setPendingAction(null);
    }
  };

  const createPassword = async () => {
    setPendingAction("create-password");
    const id = nanoid();
    try {
      const result = await zero.mutate(mutators.password.create({ id, hostId: sessionId, teamCount: passwordTeams, targetScore: passwordTargetScore, category: passwordCategory })).server;
      if (result.type === "error") {
        showToast(result.error.message, "error");
        return;
      }
      navigate(`/password/${id}/begin`);
    } finally {
      setPendingAction(null);
    }
  };

  const createChainReaction = async () => {
    setPendingAction("create-chain");
    const id = nanoid();
    try {
      const result = await zero.mutate(mutators.chainReaction.create({ id, hostId: sessionId, chainLength, rounds: chainRounds, chainMode, category: chainCategory })).server;
      if (result.type === "error") {
        showToast(result.error.message, "error");
        return;
      }
      navigate(`/chain/${id}`);
    } finally {
      setPendingAction(null);
    }
  };

  const createShadeSignal = async () => {
    setPendingAction("create-shade");
    const id = nanoid();
    try {
      const result = await zero.mutate(mutators.shadeSignal.create({ id, hostId: sessionId, roundsPerPlayer: shadeRoundsPerPlayer, hardMode: shadeHardMode, leaderPick: shadeLeaderPick })).server;
      if (result.type === "error") {
        showToast(result.error.message, "error");
        return;
      }
      navigate(`/shade/${id}`);
    } finally {
      setPendingAction(null);
    }
  };

  const createLocationSignal = async () => {
    setPendingAction("create-location");
    const id = nanoid();
    try {
      const result = await zero.mutate(mutators.locationSignal.create({ id, hostId: sessionId, roundsPerPlayer: locRoundsPerPlayer, cluePairs: locCluePairs })).server;
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
    setPendingAction("join");
    const normalizedCode = joinCode.trim().toUpperCase();
    if (!normalizedCode) {
      showToast("Enter a join code first.", "error");
      setPendingAction(null);
      return;
    }
    // Make sure the player has a name before joining any game
    ensureName();

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
        const result = await zero.mutate(mutators.imposter.join({ gameId: target.gameId, sessionId })).server;
        if (result.type === "error") { showToast(result.error.message, "error"); return; }
      } else if (target.gameType === "password") {
        const result = await zero.mutate(mutators.password.join({ gameId: target.gameId, sessionId })).server;
        if (result.type === "error") { showToast(result.error.message, "error"); return; }
      } else if (target.gameType === "chain_reaction") {
        const result = await zero.mutate(mutators.chainReaction.join({ gameId: target.gameId, sessionId })).server;
        if (result.type === "error") { showToast(result.error.message, "error"); return; }
      } else if (target.gameType === "shade_signal") {
        const result = await zero.mutate(mutators.shadeSignal.join({ gameId: target.gameId, sessionId })).server;
        if (result.type === "error") { showToast(result.error.message, "error"); return; }
      } else {
        const result = await zero.mutate(mutators.locationSignal.join({ gameId: target.gameId, sessionId })).server;
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
          const result = await zero.mutate(mutators.imposter.join({ gameId: target.gameId, sessionId })).server;
          if (result.type === "error") { showToast(result.error.message, "error"); return; }
        } else if (target.gameType === "password") {
          const result = await zero.mutate(mutators.password.join({ gameId: target.gameId, sessionId })).server;
          if (result.type === "error") { showToast(result.error.message, "error"); return; }
        } else if (target.gameType === "chain_reaction") {
          const result = await zero.mutate(mutators.chainReaction.join({ gameId: target.gameId, sessionId })).server;
          if (result.type === "error") { showToast(result.error.message, "error"); return; }
        } else if (target.gameType === "shade_signal") {
          const result = await zero.mutate(mutators.shadeSignal.join({ gameId: target.gameId, sessionId })).server;
          if (result.type === "error") { showToast(result.error.message, "error"); return; }
        } else {
          const result = await zero.mutate(mutators.locationSignal.join({ gameId: target.gameId, sessionId })).server;
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

  return (
    <>
    <ActiveGameModal sessionId={sessionId} suppress={pendingAction !== null} />
    <div className="home-cards" ref={scrollRef}>
      <div className="home-layout">

      {/* ── Multiplayer section ─────────────────────────────── */}
      <div className="home-section-multi">

      {/* ── Card 1: Utils ──────────────────────────────────── */}
      <div className={`home-card home-card--utils${firstVisit ? " home-card--glow" : ""}`} onClick={dismissFirstVisit}>
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
            </h3>
            {syncOffline && (
              <p className="hc-sync-offline-hint">Waiting for sync server…</p>
            )}
            <form
              className="hc-row"
              onSubmit={(e) => { e.preventDefault(); if (joinCode.length === 6 && pendingAction === null && !syncOffline) void joinAny(); }}
            >
              <input
                className={`input flex-1 hc-join-input${joinCode.length === 6 ? " hc-join-input--ready" : ""}${syncOffline ? " hc-join-input--disabled" : ""}`}
                value={joinCode}
                onChange={(e) =>
                  setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))
                }
                onClick={() => { if (joinCode.length === 6 && pendingAction === null && !syncOffline) void joinAny(); }}
                placeholder={syncOffline ? "Offline…" : "ABCXYZ"}
                maxLength={6}
                disabled={syncOffline}
                data-tooltip={syncOffline ? "Sync server is still connecting" : joinCode.length === 6 ? "Click or press Enter to join!" : "Paste or type a 6-letter code"}
                data-tooltip-variant={syncOffline ? "warn" : joinCode.length === 6 ? "success" : "info"}
              />
            </form>
            <div className="hc-divider" />
          </section>
          {/* Name section — inline editable */}
          <section className="hc-section">
            <h3 className="hc-label" data-tooltip="Your in-game identity — visible to other players" data-tooltip-variant="info">Display Name</h3>
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

          {/* Recent games — collapsible */}
          {recentGames.length > 0 && (
            <>
              <div className="hc-divider" />
              <section className="hc-section">
                <div className="hc-recent-header">
                  <button className="hc-collapse-toggle" onClick={() => setRecentCollapsed(!recentCollapsed)}>
                    <span className="hc-label" data-tooltip="Games you've recently played or joined" data-tooltip-variant="info">Recent</span>
                    <FiChevronDown size={14} className={`hc-collapse-icon${!recentCollapsed ? " hc-collapse-icon--open" : ""}`} />
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
      <div className={`home-card home-card--imposter${firstVisit ? " home-card--dimmed" : ""}`} onClick={firstVisit ? dismissFirstVisit : undefined}>
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
                  <label className="hc-config-label" data-tooltip="The theme for the word list. Everyone gets a word from this category — except the imposter." data-tooltip-variant="info">Category</label>
                  <select
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
                    <label className="hc-config-label" data-tooltip="How many players are secretly the imposter each round. More imposters = harder for the group." data-tooltip-variant="info">Imposters</label>
                    <select
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
                    <label className="hc-config-label" data-tooltip="How many rounds to play. Each round, a new imposter is chosen and everyone votes." data-tooltip-variant="info">Rounds</label>
                    <select
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
                      <span className="hc-mini-clue">"Uhh..."</span>
                      <span className="hc-mini-badge hc-mini-badge--caught">🕵️</span>
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
                  { value: `${imposterRounds}r`, icon: FiClock, label: "Rounds" }
                ]}
              />
            )}
            {imposterBrowsing ? (
              <div className="hc-row">
                <button className="btn btn-muted flex-1" onClick={() => setImposterBrowsing(false)}>
                  Back
                </button>
              </div>
            ) : !imposterExpanded ? (
              <>
              <div className="hc-row">
                <button className={`btn hc-browse-globe${imposterPublicCount === 0 ? " hc-globe-empty" : ""}`} disabled={syncOffline} onClick={() => { setImposterExpanded(false); setImposterBrowsing(true); }} data-tooltip={syncOffline ? "Sync server offline" : "Browse Public Games"} data-tooltip-variant={syncOffline ? "warn" : "info"}>
                  <FiGlobe size={18} />
                  {imposterPublicCount > 0 && <span className="hc-globe-badge">{imposterPublicCount}</span>}
                </button>
                <button className="btn btn-primary flex-1" onClick={() => setImposterExpanded(true)}>
                  Create Game
                </button>
                <button className="btn hc-help-btn" onClick={() => setActiveDemo("imposter")} data-tooltip="How to Play" data-tooltip-variant="info">
                  <FiHelpCircle size={18} />
                </button>
              </div>
              {syncOffline && <p className="hc-sync-wait-hint">Please wait{syncCountdown != null ? ` ~${syncCountdown}s` : "…"}</p>}
              </>
            ) : (
              <div className="hc-row">
                <button className="btn btn-muted flex-1" onClick={() => setImposterExpanded(false)}>
                  Back
                </button>
                <button
                  className="btn btn-primary flex-1 hc-go-btn"
                  onClick={() => void createImposter()}
                  disabled={pendingAction !== null || syncOffline}
                  data-creating={pendingAction === "create-imposter" ? "true" : "false"}
                >
                  {pendingAction === "create-imposter" ? "Creating…" : syncOffline ? `Wait ~${syncCountdown ?? "?"}s` : "Go"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Card 3: Password ───────────────────────────────── */}
      <div className={`home-card home-card--password${firstVisit ? " home-card--dimmed" : ""}`} onClick={firstVisit ? dismissFirstVisit : undefined}>
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
                  <label className="hc-config-label" data-tooltip="The theme for the word list. Words will be drawn from this category." data-tooltip-variant="info">Category</label>
                  <select
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
                    <label className="hc-config-label" data-tooltip="Split players into this many teams. Teams take turns giving and guessing clues." data-tooltip-variant="info">Teams</label>
                    <select
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
                    <label className="hc-config-label" data-tooltip="The score a team needs to win. Higher = longer game." data-tooltip-variant="info">Target Score</label>
                    <select
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
                  <div className="hc-pw-word">? ? ? ? ?</div>
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
              <div className="hc-row">
                <button className="btn btn-muted flex-1" onClick={() => setPasswordBrowsing(false)}>
                  Back
                </button>
              </div>
            ) : !passwordExpanded ? (
              <>
              <div className="hc-row">
                <button className={`btn hc-browse-globe${passwordPublicCount === 0 ? " hc-globe-empty" : ""}`} disabled={syncOffline} onClick={() => { setPasswordExpanded(false); setPasswordBrowsing(true); }} data-tooltip={syncOffline ? "Sync server offline" : "Browse Public Games"} data-tooltip-variant={syncOffline ? "warn" : "info"}>
                  <FiGlobe size={18} />
                  {passwordPublicCount > 0 && <span className="hc-globe-badge">{passwordPublicCount}</span>}
                </button>
                <button className="btn btn-primary flex-1" onClick={() => setPasswordExpanded(true)}>
                  Create Game
                </button>
                <button className="btn hc-help-btn" onClick={() => setActiveDemo("password")} data-tooltip="How to Play" data-tooltip-variant="info">
                  <FiHelpCircle size={18} />
                </button>
              </div>
              {syncOffline && <p className="hc-sync-wait-hint">Please wait{syncCountdown != null ? ` ~${syncCountdown}s` : "…"}</p>}
              </>
            ) : (
              <div className="hc-row">
                <button className="btn btn-muted flex-1" onClick={() => setPasswordExpanded(false)}>
                  Back
                </button>
                <button
                  className="btn btn-primary flex-1 hc-go-btn"
                  onClick={() => void createPassword()}
                  disabled={pendingAction !== null || syncOffline}
                  data-creating={pendingAction === "create-password" ? "true" : "false"}
                >
                  {pendingAction === "create-password" ? "Creating…" : syncOffline ? `Wait ~${syncCountdown ?? "?"}s` : "Go"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Card 4: Chain Reaction ─────────────────────────── */}
      <div className={`home-card home-card--chain${firstVisit ? " home-card--dimmed" : ""}`} onClick={firstVisit ? dismissFirstVisit : undefined}>
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
                  <label className="hc-config-label" data-tooltip="The theme for the word chains. Chains will be drawn from this category." data-tooltip-variant="info">Category</label>
                  <select
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
                    <label className="hc-config-label" data-tooltip="How many words in the chain. Each word links to the next — longer chains are harder!" data-tooltip-variant="info">Length</label>
                    <select
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
                    <label className="hc-config-label" data-tooltip="How many chains to play. Each round is a fresh chain for both players." data-tooltip-variant="info">Rounds</label>
                    <select
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
                  <label className="hc-config-label" data-tooltip="Random uses pre-made chains. Custom lets both players write their own chain for the other to solve." data-tooltip-variant="info">Mode</label>
                  <select
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
                  <span className="hc-chain-word hc-chain-word--hidden">_ _ _ _</span>
                  <span className="hc-chain-word hc-chain-word--hidden">_ _ _ _</span>
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
              <div className="hc-row">
                <button className="btn btn-muted flex-1" onClick={() => setChainBrowsing(false)}>
                  Back
                </button>
              </div>
            ) : !chainExpanded ? (
              <>
              <div className="hc-row">
                <button className={`btn hc-browse-globe${chainPublicCount === 0 ? " hc-globe-empty" : ""}`} disabled={syncOffline} onClick={() => { setChainExpanded(false); setChainBrowsing(true); }} data-tooltip={syncOffline ? "Sync server offline" : "Browse Public Games"} data-tooltip-variant={syncOffline ? "warn" : "info"}>
                  <FiGlobe size={18} />
                  {chainPublicCount > 0 && <span className="hc-globe-badge">{chainPublicCount}</span>}
                </button>
                <button className="btn btn-primary flex-1" onClick={() => setChainExpanded(true)}>
                  Create Game
                </button>
                <button className="btn hc-help-btn" onClick={() => setActiveDemo("chain")} data-tooltip="How to Play" data-tooltip-variant="info">
                  <FiHelpCircle size={18} />
                </button>
              </div>
              {syncOffline && <p className="hc-sync-wait-hint">Please wait{syncCountdown != null ? ` ~${syncCountdown}s` : "…"}</p>}
              </>
            ) : (
              <div className="hc-row">
                <button className="btn btn-muted flex-1" onClick={() => setChainExpanded(false)}>
                  Back
                </button>
                <button
                  className="btn btn-primary flex-1 hc-go-btn"
                  onClick={() => void createChainReaction()}
                  disabled={pendingAction !== null || syncOffline}
                  data-creating={pendingAction === "create-chain" ? "true" : "false"}
                >
                  {pendingAction === "create-chain" ? "Creating…" : syncOffline ? `Wait ~${syncCountdown ?? "?"}s` : "Go"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Card 5: Shade Signal ──────────────────────────── */}
      <div className={`home-card home-card--shade${firstVisit ? " home-card--dimmed" : ""}`} onClick={firstVisit ? dismissFirstVisit : undefined}>
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
                    <label className="hc-config-label" data-tooltip="Each player takes a turn as Leader. This controls how many turns each person gets, so more = longer game." data-tooltip-variant="info">Game Length</label>
                    <select
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
                    <label className="hc-config-label" data-tooltip="Controls what the Leader can say in their clue. &quot;No Color Names&quot; bans words like red, blue, green, etc." data-tooltip-variant="info">Clue Rules</label>
                    <select
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
                  {Array.from({ length: 20 }, (_, i) => (
                    <div
                      key={i}
                      className="hc-shade-cell"
                      style={{ background: `hsl(${i * 18}, 60%, ${45 + (i % 3) * 10}%)` }}
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
              <div className="hc-row">
                <button className="btn btn-muted flex-1" onClick={() => setShadeBrowsing(false)}>
                  Back
                </button>
              </div>
            ) : !shadeExpanded ? (
              <>
              <div className="hc-row">
                <button className={`btn hc-browse-globe${shadePublicCount === 0 ? " hc-globe-empty" : ""}`} disabled={syncOffline} onClick={() => { setShadeExpanded(false); setShadeBrowsing(true); }} data-tooltip={syncOffline ? "Sync server offline" : "Browse Public Games"} data-tooltip-variant={syncOffline ? "warn" : "info"}>
                  <FiGlobe size={18} />
                  {shadePublicCount > 0 && <span className="hc-globe-badge">{shadePublicCount}</span>}
                </button>
                <button className="btn btn-primary flex-1" onClick={() => setShadeExpanded(true)}>
                  Create Game
                </button>
                <button className="btn hc-help-btn" onClick={() => setActiveDemo("shade")} data-tooltip="How to Play" data-tooltip-variant="info">
                  <FiHelpCircle size={18} />
                </button>
              </div>
              {syncOffline && <p className="hc-sync-wait-hint">Please wait{syncCountdown != null ? ` ~${syncCountdown}s` : "…"}</p>}
              </>
            ) : (
              <div className="hc-row">
                <button className="btn btn-muted flex-1" onClick={() => setShadeExpanded(false)}>
                  Back
                </button>
                <button
                  className="btn btn-primary flex-1 hc-go-btn"
                  onClick={() => void createShadeSignal()}
                  disabled={pendingAction !== null || syncOffline}
                  data-creating={pendingAction === "create-shade" ? "true" : "false"}
                >
                  {pendingAction === "create-shade" ? "Creating…" : syncOffline ? `Wait ~${syncCountdown ?? "?"}s` : "Go"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Card 6: Location Signal ──────────────────────────── */}
      <div className={`home-card home-card--location${firstVisit ? " home-card--dimmed" : ""}`} onClick={firstVisit ? dismissFirstVisit : undefined}>
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
                    <label className="hc-config-label" data-tooltip="How many clue + guess pairs per round. More pairs means the leader gives more hints and guessers refine their answer." data-tooltip-variant="info">Clue Pairs</label>
                    <select
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
                    <label className="hc-config-label" data-tooltip="How many rounds each player leads. More rounds means a longer session." data-tooltip-variant="info">Rounds/Player</label>
                    <select
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
                <div className="hc-loc-preview">
                  <div className="hc-loc-map">
                    <div className="hc-loc-pin hc-loc-pin--guess" style={{ top: "25%", left: "30%" }} />
                    <div className="hc-loc-pin hc-loc-pin--guess" style={{ top: "55%", left: "72%" }} />
                    <div className="hc-loc-pin hc-loc-pin--close" style={{ top: "38%", left: "53%" }} />
                    <div className="hc-loc-pin hc-loc-pin--target" style={{ top: "36%", left: "56%" }} />
                  </div>
                  <div className="hc-loc-clue-row">
                    <span className="hc-loc-clue-tag">Clue</span>
                    <span className="hc-loc-clue-text">"Ancient empire"</span>
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
              <div className="hc-row">
                <button className="btn btn-muted flex-1" onClick={() => setLocationBrowsing(false)}>
                  Back
                </button>
              </div>
            ) : !locationExpanded ? (
              <>
              <div className="hc-row">
                <button className={`btn hc-browse-globe${locationPublicCount === 0 ? " hc-globe-empty" : ""}`} disabled={syncOffline} onClick={() => { setLocationExpanded(false); setLocationBrowsing(true); }} data-tooltip={syncOffline ? "Sync server offline" : "Browse Public Games"} data-tooltip-variant={syncOffline ? "warn" : "info"}>
                  <FiGlobe size={18} />
                  {locationPublicCount > 0 && <span className="hc-globe-badge">{locationPublicCount}</span>}
                </button>
                <button className="btn btn-primary flex-1" onClick={() => setLocationExpanded(true)}>
                  Create Game
                </button>
                <button className="btn hc-help-btn" onClick={() => setActiveDemo("location")} data-tooltip="How to Play" data-tooltip-variant="info">
                  <FiHelpCircle size={18} />
                </button>
              </div>
              {syncOffline && <p className="hc-sync-wait-hint">Please wait{syncCountdown != null ? ` ~${syncCountdown}s` : "…"}</p>}
              </>
            ) : (
              <div className="hc-row">
                <button className="btn btn-muted flex-1" onClick={() => setLocationExpanded(false)}>
                  Back
                </button>
                <button
                  className="btn btn-primary flex-1 hc-go-btn"
                  onClick={() => void createLocationSignal()}
                  disabled={pendingAction !== null || syncOffline}
                  data-creating={pendingAction === "create-location" ? "true" : "false"}
                >
                  {pendingAction === "create-location" ? "Creating…" : syncOffline ? `Wait ~${syncCountdown ?? "?"}s` : "Go"}
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
          <SoloGameCard key={game.id} game={game} />
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
      {Array.from({ length: CARD_COUNT }, (_, i) => (
        <span
          key={i}
          className={`home-cards-dot${activeDot === i ? " home-cards-dot--active" : ""}`}
          onClick={() => scrollRef.current?.scrollTo({ left: i * (scrollRef.current?.clientWidth ?? 0), behavior: "smooth" })}
        />
      ))}
    </div>

    {activeDemo === "imposter" && <ImposterDemo onClose={() => setActiveDemo(null)} />}
    {activeDemo === "password" && <PasswordDemo onClose={() => setActiveDemo(null)} />}
    {activeDemo === "chain" && <ChainDemo onClose={() => setActiveDemo(null)} />}
    {activeDemo === "shade" && <ShadeDemo onClose={() => setActiveDemo(null)} />}
    {activeDemo === "location" && <LocationDemo onClose={() => setActiveDemo(null)} />}
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
        { id: nanoid(), gameType: "imposter" as const, gameId: id, senderId: "demo-p2", senderName: "Alice", text: "Charlie seems nervous..." },
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
      roundEndsAt: phase === "playing" ? ts + 45_000 : null,
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
    navigate(`/chain-reaction/${id}`);
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

/* ── Recent game item with deleted check + hover results ───── */

function RecentGameItem({ game, sessionId, onRemove }: { game: RecentGame; sessionId: string; onRemove: () => void }) {
  const [imposterResults] = useQuery(game.gameType === "imposter" ? queries.imposter.byId({ id: game.id }) : queries.imposter.byId({ id: "__none__" }));
  const [passwordResults] = useQuery(game.gameType === "password" ? queries.password.byId({ id: game.id }) : queries.password.byId({ id: "__none__" }));
  const [chainResults] = useQuery(game.gameType === "chain_reaction" ? queries.chainReaction.byId({ id: game.id }) : queries.chainReaction.byId({ id: "__none__" }));
  const [shadeResults] = useQuery(game.gameType === "shade_signal" ? queries.shadeSignal.byId({ id: game.id }) : queries.shadeSignal.byId({ id: "__none__" }));
  const [locationResults] = useQuery(game.gameType === "location_signal" ? queries.locationSignal.byId({ id: game.id }) : queries.locationSignal.byId({ id: "__none__" }));

  const gameData = game.gameType === "imposter" ? imposterResults[0]
    : game.gameType === "password" ? passwordResults[0]
    : game.gameType === "chain_reaction" ? chainResults[0]
    : game.gameType === "shade_signal" ? shadeResults[0]
    : locationResults[0];

  const isDeleted = !gameData;
  const isEnded = gameData && (gameData.phase === "finished" || gameData.phase === "ended");

  const link = game.gameType === "imposter"
    ? `/imposter/${game.id}`
    : game.gameType === "password"
    ? `/password/${game.id}/begin`
    : game.gameType === "shade_signal"
    ? `/shade/${game.id}`
    : game.gameType === "location_signal"
    ? `/location/${game.id}`
    : `/chain/${game.id}`;

  const typeLabel = game.gameType === "chain_reaction" ? "chain reaction" : game.gameType === "shade_signal" ? "shade signal" : game.gameType === "location_signal" ? "location signal" : game.gameType;

  // Tooltip content for finished games
  const tooltip = useMemo(() => {
    if (!isEnded || !gameData) return null;

    if (game.gameType === "imposter" && "round_history" in gameData) {
      const g = gameData as typeof imposterResults[0];
      if (!g) return null;
      const lines: string[] = [];

      for (const r of g.round_history ?? []) {
        const votedOut = r.votedOutName ?? "no one";
        lines.push(`R${r.round}: "${r.secretWord}" — voted out ${votedOut} (${r.wasImposter ? "imposter" : "innocent"})`);
      }
      return lines.join("\n") || "No rounds played";
    }

    if (game.gameType === "password" && "teams" in gameData) {
      const g = gameData as typeof passwordResults[0];
      if (!g) return null;
      const lines: string[] = [];
      const teams = g.teams ?? [];
      for (const [teamKey, score] of Object.entries(g.scores ?? {})) {
        const team = teams.find((t) => t.name === teamKey);
        const teamName = team?.name ?? teamKey;
        lines.push(`${teamName}: ${score} pts`);
      }
      return lines.join("\n") || "No scores";
    }

    if (game.gameType === "chain_reaction" && "round_history" in gameData) {
      const g = gameData as typeof chainResults[0];
      if (!g) return null;
      const players = g.players ?? [];
      const nameOf = (id: string) => players.find((p) => p.sessionId === id)?.name ?? id.slice(0, 6);
      const lines: string[] = [];

      // Final scores
      const sorted = Object.entries(g.scores ?? {}).sort(([, a], [, b]) => b - a);
      lines.push(sorted.map(([id, s]) => `${nameOf(id)}: ${s}`).join(" vs "));

      // Per round
      for (const r of g.round_history ?? []) {
        const roundScores = Object.entries(r.scores ?? {})
          .map(([id, s]) => `${nameOf(id)} ${s}`)
          .join(" / ");
        lines.push(`R${r.round}: ${roundScores}`);
      }
      return lines.join("\n") || "No rounds played";
    }

    return null;
  }, [isEnded, gameData, game.gameType]);

  if (isDeleted) {
    return (
      <div className="hc-recent-item hc-recent-item--deleted">
        <span className="hc-recent-type">{typeLabel}</span>
        <span className="hc-recent-code">{game.code}</span>
        <span className="hc-recent-badge hc-recent-badge--deleted">deleted</span>
        <button className="hc-recent-edge" onClick={onRemove} aria-label="Remove from list" />
      </div>
    );
  }

  if (isEnded) {
    return (
      <Link to={link} className="hc-recent-item hc-recent-item--ended" data-tooltip={tooltip ?? undefined} data-tooltip-variant="info">
        <span className="hc-recent-type">{typeLabel}</span>
        <span className="hc-recent-code">{game.code}</span>
        <span className="hc-recent-badge hc-recent-badge--ended">{gameData.phase}</span>
        <button className="hc-recent-edge" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }} aria-label="Remove from list" />
      </Link>
    );
  }

  return (
    <Link to={link} className="hc-recent-item">
      <span className="hc-recent-type">{typeLabel}</span>
      <span className="hc-recent-code">{game.code}</span>
      <span className="hc-recent-badge">{gameData.phase}</span>
      <button className="hc-recent-edge" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }} aria-label="Remove from list" />
    </Link>
  );
}

export function HomePage({ sessionId }: { sessionId: string }) {
  const isMobile = useIsMobile();
  if (isMobile) return <MobileHomePage sessionId={sessionId} />;
  return <HomePageDesktop sessionId={sessionId} />;
}
