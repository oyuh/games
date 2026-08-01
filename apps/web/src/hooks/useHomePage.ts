import { DEFAULT_IMPOSTER_CLUE_VISIBILITY, mutators, queries } from "@games/shared";
import { nanoid } from "nanoid";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { optimistic, useQuery, useZero } from "../lib/zero";
import { usePublicGameCount } from "../components/shared/PublicGamesBrowser";
import { getHomeRouteGame, type HomeRouteGame } from "../lib/home-route-highlight";
import { isNameRestricted } from "./useAdminBroadcast";
import {
  addRecentGame, ensureName as ensureSessionName, getDisplayName, getOrCreateStoredName,
  getRecentGames, hasVisited, leaveCurrentGame, markVisited, SessionGameType, setStoredName,
} from "../lib/session";
import { showToast } from "../lib/toast";

type JoinTarget = { gameType: SessionGameType; gameId: string; code: string; route: string };

/**
 * Everything the home screen does that isn't markup: the name flow, the
 * five create-a-game handlers, join by code, recent games, public counts, and
 * the first-visit and route-highlight behaviour.
 *
 * The two views keep their own layout state, which is where they genuinely
 * differ. Desktop tracks five separate expanded/browsing booleans plus a
 * horizontal scroll position and dot indicator; mobile uses one accordion key
 * for each. Neither belongs in here.
 */
export function useHomePage(sessionId: string) {
  const zero = useZero();
  const navigate = useNavigate();
  const location = useLocation();
  const routeHighlight = useMemo(() => getHomeRouteGame(location.search), [location.search]);

  const [name, setName] = useState(() => getOrCreateStoredName(sessionId));
  const [savedName, setSavedName] = useState(() => getOrCreateStoredName(sessionId));
  const [firstVisit, setFirstVisit] = useState(() => !hasVisited());
  const [activeRouteHighlight, setActiveRouteHighlight] = useState<HomeRouteGame | null>(routeHighlight);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [recentGames, setRecentGames] = useState(() => getRecentGames());
  const [joinCode, setJoinCode] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const [imposterMatches] = useQuery(queries.imposter.byCode({ code: joinCode || "______" }));
  const [passwordMatches] = useQuery(queries.password.byCode({ code: joinCode || "______" }));
  const [chainMatches] = useQuery(queries.chainReaction.byCode({ code: joinCode || "______" }));
  const [shadeMatches] = useQuery(queries.shadeSignal.byCode({ code: joinCode || "______" }));
  const [locationMatches] = useQuery(queries.locationSignal.byCode({ code: joinCode || "______" }));
  const [mySessionRows] = useQuery(queries.sessions.byId({ id: sessionId }));

  const [showInSessionModal, setShowInSessionModal] = useState(false);
  const [joiningFromOtherGame, setJoiningFromOtherGame] = useState(false);
  const [pendingJoinTarget, setPendingJoinTarget] = useState<JoinTarget | null>(null);

  const imposterPublicCount = usePublicGameCount("imposter");
  const passwordPublicCount = usePublicGameCount("password");
  const chainPublicCount = usePublicGameCount("chain_reaction");
  const shadePublicCount = usePublicGameCount("shade_signal");
  const locationPublicCount = usePublicGameCount("location_signal");

  // Per-game create options
  const [imposterCategory, setImposterCategory] = useState("animals");
  const [imposterImposters, setImposterImposters] = useState(1);
  const [imposterRounds, setImposterRounds] = useState(3);
  const [imposterClueVisibility, setImposterClueVisibility] = useState(DEFAULT_IMPOSTER_CLUE_VISIBILITY);
  const [passwordCategory, setPasswordCategory] = useState("animals");
  const [passwordTeams, setPasswordTeams] = useState(2);
  const [passwordTargetScore, setPasswordTargetScore] = useState(10);
  const [chainCategory, setChainCategory] = useState("animals");
  const [chainLength, setChainLength] = useState(5);
  const [chainRounds, setChainRounds] = useState(3);
  const [chainMode, setChainMode] = useState<"premade" | "custom">("premade");
  const [shadeRoundsPerPlayer, setShadeRoundsPerPlayer] = useState(1);
  const [shadeHardMode, setShadeHardMode] = useState(false);
  const [shadeLeaderPick, setShadeLeaderPick] = useState(false);
  const [locCluePairs, setLocCluePairs] = useState(2);
  const [locRoundsPerPlayer, setLocRoundsPerPlayer] = useState(1);

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

  /** Shared shape of the five create handlers. */
  const createGame = async (
    action: string,
    mutate: (id: string) => ReturnType<typeof zero.mutate>,
    route: (id: string) => string,
  ) => {
    setPendingAction(action);
    const id = nanoid();
    try {
      await ensureName();
      const result = await optimistic(mutate(id));
      if (result.type === "error") {
        showToast(result.error.message, "error");
        return;
      }
      navigate(route(id));
    } finally {
      setPendingAction(null);
    }
  };

  const joinTarget = async (target: JoinTarget) => {
    const join = {
      imposter: mutators.imposter.join,
      password: mutators.password.join,
      chain_reaction: mutators.chainReaction.join,
      shade_signal: mutators.shadeSignal.join,
      location_signal: mutators.locationSignal.join,
    }[target.gameType];
    const result = await optimistic(zero.mutate(join({ gameId: target.gameId, sessionId })));
    if (result.type === "error") {
      showToast(result.error.message, "error");
      return;
    }
    addRecentGame({ id: target.gameId, code: target.code, gameType: target.gameType });
    setRecentGames(getRecentGames());
    navigate(target.route);
  };

  const joinAny = async () => {
    const normalizedCode = joinCode.trim().toUpperCase();
    if (!normalizedCode) {
      showToast("Enter a join code first.", "error");
      return;
    }
    setPendingAction("join");
    // Make sure the player has a name before joining any game
    await ensureName();

    const mySession = mySessionRows[0] ?? null;
    const activeGameType = (mySession?.game_type ?? null) as SessionGameType | null;
    const activeGameId = mySession?.game_id ?? null;

    const leavePreviousIfNeeded = (target: JoinTarget) => {
      const inAnotherGame = Boolean(activeGameType && activeGameId && (activeGameType !== target.gameType || activeGameId !== target.gameId));
      if (inAnotherGame && activeGameType && activeGameId) {
        void leaveCurrentGame(zero, sessionId, activeGameType, activeGameId)
          .catch(() => showToast("Couldn't leave previous game cleanly", "error"));
      }
    };

    const candidates: (JoinTarget | undefined | "" | null)[] = [
      imposterMatches[0] && { gameType: "imposter", gameId: imposterMatches[0].id, code: imposterMatches[0].code, route: `/imposter/${imposterMatches[0].id}` },
      passwordMatches[0] && { gameType: "password", gameId: passwordMatches[0].id, code: passwordMatches[0].code, route: `/password/${passwordMatches[0].id}/begin` },
      chainMatches[0] && { gameType: "chain_reaction", gameId: chainMatches[0].id, code: chainMatches[0].code, route: `/chain/${chainMatches[0].id}` },
      shadeMatches[0] && { gameType: "shade_signal", gameId: shadeMatches[0].id, code: shadeMatches[0].code, route: `/shade/${shadeMatches[0].id}` },
      locationMatches[0] && { gameType: "location_signal", gameId: locationMatches[0].id, code: locationMatches[0].code, route: `/location/${locationMatches[0].id}` },
    ];

    try {
      const target = candidates.find(Boolean) as JoinTarget | undefined;
      if (!target) {
        showToast("No game found for that code.", "error");
        return;
      }
      leavePreviousIfNeeded(target);
      await joinTarget(target);
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
        if (pendingJoinTarget) await joinTarget(pendingJoinTarget);
      })
      .catch(() => showToast("Couldn't leave current game", "error"))
      .finally(() => {
        setJoiningFromOtherGame(false);
        setShowInSessionModal(false);
        setPendingJoinTarget(null);
        setPendingAction(null);
      });
  };

  return {
    zero, navigate, sessionId,
    name, setName, savedName, firstVisit, nameInputRef,
    activeRouteHighlight, dismissRouteHighlight,
    recentGames, setRecentGames,
    joinCode, setJoinCode, pendingAction, setPendingAction,
    mySessionRows,
    showInSessionModal, setShowInSessionModal,
    joiningFromOtherGame, setJoiningFromOtherGame,
    pendingJoinTarget, setPendingJoinTarget,
    imposterPublicCount, passwordPublicCount, chainPublicCount, shadePublicCount, locationPublicCount,

    imposterCategory, setImposterCategory,
    imposterImposters, setImposterImposters,
    imposterRounds, setImposterRounds,
    imposterClueVisibility, setImposterClueVisibility,
    passwordCategory, setPasswordCategory,
    passwordTeams, setPasswordTeams,
    passwordTargetScore, setPasswordTargetScore,
    chainCategory, setChainCategory,
    chainLength, setChainLength,
    chainRounds, setChainRounds,
    chainMode, setChainMode,
    shadeRoundsPerPlayer, setShadeRoundsPerPlayer,
    shadeHardMode, setShadeHardMode,
    shadeLeaderPick, setShadeLeaderPick,
    locCluePairs, setLocCluePairs,
    locRoundsPerPlayer, setLocRoundsPerPlayer,

    ensureName, dismissFirstVisit, saveName, joinAny, confirmLeaveAndJoin,

    createImposter: () => createGame(
      "create-imposter",
      (id) => zero.mutate(mutators.imposter.create({ id, hostId: sessionId, category: imposterCategory, rounds: imposterRounds, imposters: imposterImposters, clueVisibility: imposterClueVisibility })),
      (id) => `/imposter/${id}`,
    ),
    createPassword: () => createGame(
      "create-password",
      (id) => zero.mutate(mutators.password.create({ id, hostId: sessionId, teamCount: passwordTeams, targetScore: passwordTargetScore, category: passwordCategory })),
      (id) => `/password/${id}/begin`,
    ),
    createChainReaction: () => createGame(
      "create-chain",
      (id) => zero.mutate(mutators.chainReaction.create({ id, hostId: sessionId, chainLength, rounds: chainRounds, chainMode, category: chainCategory })),
      (id) => `/chain/${id}`,
    ),
    createShadeSignal: () => createGame(
      "create-shade",
      (id) => zero.mutate(mutators.shadeSignal.create({ id, hostId: sessionId, roundsPerPlayer: shadeRoundsPerPlayer, hardMode: shadeHardMode, leaderPick: shadeLeaderPick })),
      (id) => `/shade/${id}`,
    ),
    createLocationSignal: () => createGame(
      "create-location",
      (id) => zero.mutate(mutators.locationSignal.create({ id, hostId: sessionId, roundsPerPlayer: locRoundsPerPlayer, cluePairs: locCluePairs })),
      (id) => `/location/${id}`,
    ),

    firstVisitGlowClass: firstVisit && !activeRouteHighlight ? " home-card--glow" : "",
    dimmedClass: (game: HomeRouteGame) => (firstVisit && activeRouteHighlight !== game ? " home-card--dimmed" : ""),
    routeHighlightClass: (game: HomeRouteGame) => (activeRouteHighlight === game ? " home-card--route-highlight" : ""),
  };
}
