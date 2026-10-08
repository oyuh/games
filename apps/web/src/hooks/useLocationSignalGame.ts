import { mutators, queries } from "@games/shared";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePublishedAvatars } from "./useAvatars";
import { useNavigate, useParams } from "react-router-dom";
import { optimistic, useQuery, useZero } from "../lib/zero";
import { addRecentGame, ensureName, getDisplayName, leaveCurrentGame, SessionGameType } from "../lib/session";
import { showToast } from "../lib/toast";
import { useMissingGameRedirect } from "./useMissingGameRedirect";
import { useGameSounds, playSoundSubmit } from "./useGameSounds";

/** Declared in both page files before this; they import them from here now. */
export type LocPhase =
  | "lobby" | "picking"
  | "clue1" | "guess1" | "clue2" | "guess2" | "clue3" | "guess3" | "clue4" | "guess4"
  | "reveal" | "finished" | "ended";

export const PLAYER_COLORS = [
  "#06d6a0", "#7ecbff", "#ef476f", "#a78bfa", "#fb923c",
  "#38bdf8", "#f472b6", "#4ade80", "#facc15", "#34d399",
];

/**
 * The non-visual half of a location signal round: queries, sounds, the
 * leave-on-unmount guard, the host-only phase timer, and the clue / guess /
 * target / join handlers. Each phase component brings its own map.
 *
 * buildMarkers stays in the views: the marker colours, labels and sizes are
 * styled per platform.
 */
export function useLocationSignalGame(sessionId: string) {
  const zero = useZero();
  const navigate = useNavigate();
  const params = useParams();
  const gameId = params.id ?? "";

  const [games, gamesResult] = useQuery(queries.locationSignal.byId({ id: gameId }));
  const [sessions] = useQuery(queries.sessions.byGame({ gameType: "location_signal", gameId }));
  usePublishedAvatars(sessions);
  const [mySessionRows] = useQuery(queries.sessions.byId({ id: sessionId }));
  const game = games[0];

  const [draftClue, setDraftClue] = useState("");
  const [draftMarker, setDraftMarker] = useState<{ lat: number; lng: number } | null>(null);
  const [showInSessionModal, setShowInSessionModal] = useState(false);
  const [joiningFromOtherGame, setJoiningFromOtherGame] = useState(false);
  const [leaderTarget, setLeaderTarget] = useState<{ lat: number; lng: number } | null>(null);
  const prevAnnouncementRef = useRef<{ text: string; ts: number } | null>(null);

  const isHost = game?.host_id === sessionId;
  const me = useMemo(() => game?.players.find((p) => p.sessionId === sessionId), [game, sessionId]);
  const inGame = Boolean(me);
  const isLeader = game?.leader_id === sessionId;

  useGameSounds({
    phase: game?.phase,
    sessionId,
    isMyTurn: Boolean(inGame && (
      (isLeader && (game?.phase === "picking" || game?.phase?.startsWith("clue"))) ||
      (!isLeader && game?.phase?.startsWith("guess"))
    )),
    phaseEndsAt: game?.settings.phaseEndsAt,
  });

  const isSpectator = useMemo(() => game?.spectators?.some((s) => s.sessionId === sessionId) ?? false, [game, sessionId]);
  const mySession = mySessionRows[0];
  const activeGameType = (mySession?.game_type ?? null) as SessionGameType | null;
  const activeGameId = mySession?.game_id ?? null;
  const inAnotherGame = Boolean(activeGameType && activeGameId && (activeGameType !== "location_signal" || activeGameId !== gameId));

  const inGameRef = useRef(inGame);
  const phaseRef = useRef(game?.phase);
  const isSpectatorRef = useRef(isSpectator);
  inGameRef.current = inGame;
  phaseRef.current = game?.phase;
  isSpectatorRef.current = isSpectator;

  useEffect(() => {
    if (isSpectator) showToast("You are a spectator", "info");
  }, [isSpectator]);

  useEffect(() => {
    let active = false;
    const timer = setTimeout(() => { active = true; }, 500);
    return () => {
      clearTimeout(timer);
      /* ponytail: both branches call leave, which is how both pages already
         behaved. The spectator branch probably wants leaveSpectator like the
         other games use; left alone here so this stays a pure refactor. */
      if (active && isSpectatorRef.current) {
        void zero.mutate(mutators.locationSignal.leave({ gameId, sessionId }));
      } else if (active && inGameRef.current && phaseRef.current !== "ended") {
        void zero.mutate(mutators.locationSignal.leave({ gameId, sessionId }));
      }
    };
  }, [gameId, sessionId, zero]);

  const sessionById = useMemo(() => {
    return sessions.reduce<Record<string, string>>((acc, s) => {
      acc[s.id] = getDisplayName(s.name, s.id);
      return acc;
    }, {});
  }, [sessions]);

  const playerName = (id: string) => sessionById[id] ?? getDisplayName(null, id);

  const myRoundGuess = useMemo(() => {
    if (!game) return null;
    const p = game.phase;
    const round = p.startsWith("guess") ? Number(p.replace("guess", "")) : 0;
    if (!round) return null;
    return game.guesses.find((g) => g.sessionId === sessionId && g.round === round) ?? null;
  }, [game, sessionId]);

  useEffect(() => {
    if (!game) return;
    addRecentGame({ id: game.id, code: game.code, gameType: "location_signal" });
  }, [game]);

  useEffect(() => {
    if (!game) return;
    if (game.phase === "ended") {
      showToast("The host ended the game", "info");
      navigate("/");
      return;
    }
    if (game.kicked.includes(sessionId)) {
      showToast("You were kicked from the game", "error");
      navigate("/");
    }
  }, [game?.phase, game?.kicked, sessionId, navigate]);

  useEffect(() => {
    if (!game?.announcement) return;
    const prev = prevAnnouncementRef.current;
    const cur = game.announcement;
    if (prev && prev.text === cur.text && Math.abs(cur.ts - prev.ts) < 3000) return;
    prevAnnouncementRef.current = cur;
    showToast(cur.text, "info");
  }, [game?.announcement]);

  useEffect(() => {
    setDraftClue("");
    // For guess rounds 2+, pre-populate draft marker with previous round's guess
    if (game) {
      const p = game.phase;
      const guessRound = p.startsWith("guess") ? Number(p.replace("guess", "")) : 0;
      if (guessRound > 1) {
        const prevGuess = game.guesses.find((g) => g.sessionId === sessionId && g.round === guessRound - 1);
        if (prevGuess) {
          setDraftMarker({ lat: prevGuess.lat, lng: prevGuess.lng });
          return;
        }
      }
    }
    setDraftMarker(null);
  }, [game?.settings.currentRound, game?.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset leader target on round change
  useEffect(() => {
    setLeaderTarget(null);
  }, [game?.settings.currentRound]);

  // Timer auto-advance (host only)
  useEffect(() => {
    if (!game) return;
    if (!isHost) return;
    const phaseEnd = game.settings.phaseEndsAt;
    if (!phaseEnd) return;
    const activePhases: string[] = ["clue1", "guess1", "clue2", "guess2", "clue3", "guess3", "clue4", "guess4", "reveal"];
    if (!activePhases.includes(game.phase)) return;
    const advance = () => void zero.mutate(mutators.locationSignal.advanceTimer({ gameId }));
    const remaining = phaseEnd - Date.now();
    if (remaining <= 0) {
      advance();
      return;
    }
    const timer = setTimeout(advance, remaining + 500);
    return () => clearTimeout(timer);
  }, [game, game?.settings.phaseEndsAt, game?.phase, gameId, zero, isHost, sessionId]);

  // Per-player color assignment (guessers only, stable by index).
  // Must be above the caller's `if (!game)` guard so hook count stays constant.
  const guesserColorMap = useMemo(() => {
    if (!game) return {} as Record<string, string>;
    const guessers = game.players.filter((p) => p.sessionId !== game.leader_id);
    const map: Record<string, string> = {};
    guessers.forEach((p, i) => {
      map[p.sessionId] = PLAYER_COLORS[i % PLAYER_COLORS.length]!;
    });
    return map;
  }, [game]);

  useMissingGameRedirect(Boolean(game), gamesResult.type);

  const phase = (game?.phase ?? "lobby") as LocPhase;
  const cluePairs = (game?.settings as { cluePairs?: number } | undefined)?.cluePairs ?? 2;
  const currentClueRound = phase.startsWith("clue") ? Number(phase.replace("clue", "")) : 0;
  const currentGuessRound = phase.startsWith("guess") ? Number(phase.replace("guess", "")) : 0;
  const isGuessPhase = currentGuessRound > 0;

  const getClue = (n: number): string | null => {
    if (!game) return null;
    if (n === 1) return game.clue1;
    if (n === 2) return game.clue2;
    if (n === 3) return (game as Record<string, unknown>).clue3 as string | null;
    if (n === 4) return (game as Record<string, unknown>).clue4 as string | null;
    return null;
  };

  const joinGame = async () => {
    if (!game) return;
    await ensureName(zero, sessionId);
    void optimistic(zero.mutate(mutators.locationSignal.join({ gameId: game.id, sessionId })))
      .catch(() => showToast("Couldn't join", "error"));
  };

  return {
    zero, navigate, gameId, game, me, isHost, isLeader, inGame, isSpectator, sessionById,
    playerName, myRoundGuess, guesserColorMap, draftClue, setDraftClue, draftMarker,
    setDraftMarker, leaderTarget, setLeaderTarget, activeGameType, showInSessionModal, setShowInSessionModal, joiningFromOtherGame,
    phase, cluePairs, currentClueRound, currentGuessRound,
    isCluePhase: currentClueRound > 0,
    isGuessPhase,
    isGameActive: phase !== "lobby" && phase !== "finished" && phase !== "ended",

    leaderName: game?.leader_id
      ? getDisplayName(game.players.find((p) => p.sessionId === game.leader_id)?.name, game.leader_id)
      : "---",
    roundGuessers: game ? game.players.filter((p) => p.sessionId !== game.leader_id) : [],
    guessesThisRound: (round: number) => game?.guesses.filter((g) => g.round === round) ?? [],
    totalRounds: game ? game.settings.roundsPerPlayer * game.players.length : 0,

    visibleClues: (upTo: number) => {
      const clues: { round: number; text: string }[] = [];
      for (let i = 1; i <= upTo; i++) {
        const c = getClue(i);
        if (c) clues.push({ round: i, text: c });
      }
      return clues;
    },

    submitClue: async (event: FormEvent, round: number) => {
      event.preventDefault();
      if (!draftClue.trim() || !game) return;
      try {
        await optimistic(zero.mutate(mutators.locationSignal.submitClue({
          gameId: game.id, sessionId, round: round as 1 | 2 | 3 | 4, text: draftClue.trim(),
        })));
        setDraftClue("");
        playSoundSubmit();
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Clue failed", "error");
      }
    },

    submitGuess: async (round: number) => {
      if (!draftMarker || !game) return;
      try {
        await optimistic(zero.mutate(mutators.locationSignal.submitGuess({
          gameId: game.id, sessionId, round: round as 1 | 2 | 3 | 4, lat: draftMarker.lat, lng: draftMarker.lng,
        })));
        showToast("Guess placed!", "success");
        playSoundSubmit();
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Guess failed", "error");
      }
    },

    handleJoinClick: () => {
      if (inAnotherGame && activeGameType && activeGameId) {
        setJoiningFromOtherGame(true);
        void leaveCurrentGame(zero, sessionId, activeGameType, activeGameId)
          .catch(() => showToast("Couldn't leave current game", "error"))
          .finally(() => {
            setJoiningFromOtherGame(false);
            void joinGame();
          });
        return;
      }
      void joinGame();
    },

    confirmLeaveAndJoin: () => {
      if (!activeGameType || !activeGameId) {
        setShowInSessionModal(false);
        void joinGame();
        return;
      }
      setJoiningFromOtherGame(true);
      void leaveCurrentGame(zero, sessionId, activeGameType, activeGameId)
        .then(() => {
          setShowInSessionModal(false);
          void joinGame();
        })
        .catch(() => showToast("Couldn't leave current game", "error"))
        .finally(() => setJoiningFromOtherGame(false));
    },
  };
}
