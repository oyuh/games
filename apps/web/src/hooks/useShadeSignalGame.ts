import { mutators, queries } from "@games/shared";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { optimistic, useQuery, useZero } from "../lib/zero";
import { generateGridColor } from "../components/shade/ColorGrid";
import { callGameSecretPreReveal } from "../lib/game-secrets";
import { addRecentGame, ensureName, getDisplayName, leaveCurrentGame, SessionGameType } from "../lib/session";
import { showToast } from "../lib/toast";
import { useGameSounds, playSoundSubmit } from "./useGameSounds";

/** Declared in both page files before this; they import them from here now. */
export type ShadePhase = "lobby" | "picking" | "clue1" | "guess1" | "clue2" | "guess2" | "reveal" | "finished" | "ended";

export function chebyshevDist(a: { row: number; col: number }, b: { row: number; col: number }): number {
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
}

/**
 * The non-visual half of a shade signal round: queries, sounds, the
 * leave-on-unmount guard, the phase timer, the host-only auto reveal, and the
 * clue / guess / join handlers.
 *
 * Guess markers come back as data rather than finished tooltips, because the
 * two views word them differently: desktop writes multi line ("Distance: 3
 * away"), mobile writes one terse line ("3 away"). Everything up to that point
 * is the same, so only the wording lives in the views.
 */
export function useShadeSignalGame(sessionId: string) {
  const zero = useZero();
  const navigate = useNavigate();
  const params = useParams();
  const gameId = params.id ?? "";

  const [games] = useQuery(queries.shadeSignal.byId({ id: gameId }));
  const [sessions] = useQuery(queries.sessions.byGame({ gameType: "shade_signal", gameId }));
  const [mySessionRows] = useQuery(queries.sessions.byId({ id: sessionId }));
  const game = games[0];

  const [clue, setClue] = useState("");
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [guessLocked, setGuessLocked] = useState(false);
  const [lobbyPreviewTarget, setLobbyPreviewTarget] = useState<{ row: number; col: number } | null>(null);
  const [showInSessionModal, setShowInSessionModal] = useState(false);
  const [joiningFromOtherGame, setJoiningFromOtherGame] = useState(false);
  const clueInputRef = useRef<HTMLInputElement>(null);
  const prevAnnouncementRef = useRef<{ text: string; ts: number } | null>(null);

  const isHost = game?.host_id === sessionId;
  const isLeader = game?.leader_id === sessionId;
  const me = useMemo(() => game?.players.find((p) => p.sessionId === sessionId), [game, sessionId]);
  const inGame = Boolean(me);

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
  const inAnotherGame = Boolean(activeGameType && activeGameId && (activeGameType !== "shade_signal" || activeGameId !== gameId));

  const inGameRef = useRef(inGame);
  const phaseRef = useRef(game?.phase);
  const isSpectatorRef = useRef(isSpectator);
  inGameRef.current = inGame;
  phaseRef.current = game?.phase;
  isSpectatorRef.current = isSpectator;

  useEffect(() => {
    if (isSpectator) showToast("You are a spectator", "info");
  }, [isSpectator]);

  // Cleanup on unmount
  useEffect(() => {
    let active = false;
    const timer = setTimeout(() => { active = true; }, 500);
    return () => {
      clearTimeout(timer);
      if (active && isSpectatorRef.current) {
        void zero.mutate(mutators.shadeSignal.leaveSpectator({ gameId, sessionId }));
      } else if (active && inGameRef.current && phaseRef.current !== "ended") {
        void zero.mutate(mutators.shadeSignal.leave({ gameId, sessionId }));
      }
    };
  }, [gameId, sessionId, zero]);

  const sessionById = useMemo(() => {
    return sessions.reduce<Record<string, string>>((acc, s) => {
      acc[s.id] = getDisplayName(s.name, s.id);
      return acc;
    }, {});
  }, [sessions]);

  const playerIndexMap = useMemo(() => {
    return game?.players.reduce<Record<string, number>>((acc, player, playerIndex) => {
      acc[player.sessionId] = playerIndex;
      return acc;
    }, {}) ?? {};
  }, [game?.players]);

  useEffect(() => {
    if (!game) return;
    addRecentGame({ id: game.id, code: game.code, gameType: "shade_signal" });
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

  // Timer auto-advance
  useEffect(() => {
    if (!game) return;
    const phaseEnd = game.settings.phaseEndsAt;
    if (!phaseEnd) return;
    const activePhases: ShadePhase[] = ["clue1", "guess1", "clue2", "guess2", "reveal"];
    if (!activePhases.includes(game.phase as ShadePhase)) return;
    const remaining = phaseEnd - Date.now();
    if (remaining <= 0) {
      void zero.mutate(mutators.shadeSignal.advanceTimer({ gameId }));
      return;
    }
    const timer = setTimeout(() => {
      void zero.mutate(mutators.shadeSignal.advanceTimer({ gameId }));
    }, remaining + 500);
    return () => clearTimeout(timer);
  }, [game?.settings.phaseEndsAt, game?.phase, gameId, zero]);

  // Announcement watcher
  useEffect(() => {
    if (!game?.announcement || isHost) return;
    const prev = prevAnnouncementRef.current;
    const cur = game.announcement;
    if (prev && prev.text === cur.text && Math.abs(cur.ts - prev.ts) < 3000) return;
    prevAnnouncementRef.current = cur;
    showToast(`📢 ${cur.text}`, "info");
  }, [game?.announcement, isHost]);

  // Reset selected cell on phase change (pre-select guess1 position when entering guess2)
  useEffect(() => {
    if (game?.phase === "guess2") {
      const g1 = game.guesses.find((g) => g.sessionId === sessionId && g.round === 1);
      setSelectedCell(g1 ? { row: g1.row, col: g1.col } : null);
    } else {
      setSelectedCell(null);
    }
    setGuessLocked(false);
  }, [game?.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-reveal: when entering reveal phase, auto-calculate scores
  useEffect(() => {
    if (!game || game.phase !== "reveal") return;
    // Only the host triggers the reveal mutator to avoid duplicates
    if (game.host_id !== sessionId) return;
    const latest = game.round_history[game.round_history.length - 1];
    if (latest && latest.round === game.settings.currentRound) return; // already revealed this round
    const timer = setTimeout(() => {
      void callGameSecretPreReveal("shade_signal", gameId, sessionId)
        .then(() => zero.mutate(mutators.shadeSignal.reveal({ gameId })));
    }, 600);
    return () => clearTimeout(timer);
  }, [game?.phase, game?.round_history.length, gameId, sessionId, zero]);

  const phase = (game?.phase ?? "lobby") as ShadePhase;

  useEffect(() => {
    if ((phase !== "clue1" && phase !== "clue2") || !isLeader || isSpectator) return;
    const input = clueInputRef.current;
    if (!input) return;
    const timer = window.setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [phase, isLeader, isSpectator]);

  const target = game?.target_row != null && game?.target_col != null && game.target_row >= 0 && game.target_col >= 0
    ? { row: game.target_row, col: game.target_col }
    : null;

  const targetColor = target && game
    ? generateGridColor(target.row, target.col, game.grid_rows, game.grid_cols, game.grid_seed)
    : null;

  /** Marker facts without the wording; each view builds its own tooltip. */
  const guessMarkerData = useMemo(() => {
    if (!game || (phase !== "reveal" && phase !== "finished")) return [];
    const latest = game.round_history[game.round_history.length - 1];
    return game.guesses.map((g) => ({
      sessionId: g.sessionId,
      name: sessionById[g.sessionId] ?? getDisplayName(null, g.sessionId),
      row: g.row,
      col: g.col,
      isOwn: g.sessionId === sessionId,
      dist: target ? chebyshevDist({ row: g.row, col: g.col }, target) : null,
      pts: latest?.scores[g.sessionId] ?? null,
      roundLabel: g.round === 1 ? "Clue 1" : "Clue 2",
    }));
  }, [game, phase, sessionById, sessionId, target]);

  const myCurrentGuess = useMemo(() => {
    if (!game || (phase !== "guess1" && phase !== "guess2")) return null;
    const round = phase === "guess1" ? 1 : 2;
    return game.guesses.find((g) => g.sessionId === sessionId && g.round === round) ?? null;
  }, [game, phase, sessionId]);

  // Auto-lock if user already submitted a guess (e.g. page reload)
  useEffect(() => {
    if (myCurrentGuess && !guessLocked) setGuessLocked(true);
  }, [myCurrentGuess]); // eslint-disable-line react-hooks/exhaustive-deps

  const lockedInIds = useMemo(() => {
    if (!game || (phase !== "guess1" && phase !== "guess2")) return new Set<string>();
    const round = phase === "guess1" ? 1 : 2;
    return game.guesses.reduce<Set<string>>((ids, guess) => {
      if (guess.round === round) ids.add(guess.sessionId);
      return ids;
    }, new Set());
  }, [game, phase]);

  // No such game: don't strand the player on an empty screen.
  useEffect(() => {
    if (game) return;
    const timer = setTimeout(() => navigate("/"), 3000);
    return () => clearTimeout(timer);
  }, [game, navigate]);

  const latestRoundRaw = game?.round_history[game.round_history.length - 1];

  const joinGame = async () => {
    await ensureName(zero, sessionId);
    if (isSpectator) {
      void zero.mutate(mutators.shadeSignal.leaveSpectator({ gameId, sessionId }))
        .client.then(() => zero.mutate(mutators.shadeSignal.join({ gameId, sessionId })))
        .catch(() => showToast("Couldn't join game", "error"));
      return;
    }
    void zero.mutate(mutators.shadeSignal.join({ gameId, sessionId }))
      .client.catch(() => showToast("Couldn't join game", "error"));
  };

  return {
    zero, navigate, gameId, game, me, isHost, isLeader, inGame, isSpectator,
    sessionById, playerIndexMap, phase, target, targetColor,
    clue, setClue, selectedCell, setSelectedCell,
    guessLocked, setGuessLocked, lobbyPreviewTarget, setLobbyPreviewTarget,
    clueInputRef,
    activeGameType, activeGameId, inAnotherGame,
    showInSessionModal, setShowInSessionModal,
    joiningFromOtherGame, setJoiningFromOtherGame,
    guessMarkerData, myCurrentGuess, lockedInIds,
    currentRoundGuesses: lockedInIds.size,
    isGameActive: phase !== "lobby" && phase !== "ended" && phase !== "finished" && phase !== "picking",
    leaderName: game?.leader_id ? (sessionById[game.leader_id] ?? "???") : "",
    totalRounds: game ? game.leader_order.length * game.settings.roundsPerPlayer : 0,
    guessersCount: game ? game.players.filter((p) => p.sessionId !== game.leader_id).length : 0,
    latestRound: latestRoundRaw && game && latestRoundRaw.round === game.settings.currentRound ? latestRoundRaw : undefined,

    submitClue: async (e: FormEvent) => {
      e.preventDefault();
      if (!clue.trim()) return;
      try {
        const result = await optimistic(zero.mutate(mutators.shadeSignal.submitClue({ gameId, sessionId, text: clue.trim() })));
        if (result.type === "error") {
          showToast(result.error.message, "error");
          return;
        }
        setClue("");
        playSoundSubmit();
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : "Failed to submit clue", "error");
      }
    },

    submitGuess: async () => {
      if (!selectedCell) return;
      try {
        const result = await optimistic(zero.mutate(
          mutators.shadeSignal.submitGuess({ gameId, sessionId, row: selectedCell.row, col: selectedCell.col })
        ));
        if (result.type === "error") {
          showToast(result.error.message, "error");
        } else {
          setGuessLocked(true);
          playSoundSubmit();
        }
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : "Failed to submit guess", "error");
      }
    },

    joinGame,

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
