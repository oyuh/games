import { decryptSecret, isEncrypted, mutators, queries } from "@games/shared";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { usePublishedAvatars } from "./useAvatars";
import { useNavigate, useParams } from "react-router-dom";
import { optimistic, useQuery, useZero } from "../lib/zero";
import { buildPasswordPlayerNames } from "../lib/password-names";
import { useGameSecret } from "../lib/game-secrets";
import { getSessionRequestHeaders } from "../lib/session";
import { showToast } from "../lib/toast";
import { usePasswordLiveTyping } from "./usePasswordLiveTyping";
import { useGameSounds, playSoundSubmit } from "./useGameSounds";

/**
 * The whole non-visual half of an in-progress password game: queries, live
 * typing, sounds, word decryption (including the fallback-key fetch for
 * non-guessers), the round timer, the navigation watchers, and the submit
 * handlers.
 *
 * Desktop and mobile ran character-identical copies of all of this. What each
 * view still owns is its own markup plus the bits that are genuinely
 * platform-specific: mobile keeps its input refs and autofocus, its spectator
 * cleanup, and its host registration.
 */
export function usePasswordGame(sessionId: string) {
  const zero = useZero();
  const params = useParams();
  const navigate = useNavigate();
  const gameId = params.id ?? "";

  const [games] = useQuery(queries.password.byId({ id: gameId }));
  const [sessions] = useQuery(queries.sessions.byGame({ gameType: "password", gameId }));
  usePublishedAvatars(sessions);
  const game = games[0];
  const isHost = game?.host_id === sessionId;

  const [clue, setClue] = useState("");
  const [guess, setGuess] = useState("");
  const [decryptedActiveWord, setDecryptedActiveWord] = useState<string | null>(null);
  const [decryptedRoundWords, setDecryptedRoundWords] = useState<Record<number, string | null>>({});
  const [fallbackKey, setFallbackKey] = useState<string | null>(null);
  const [fallbackRetryNonce, setFallbackRetryNonce] = useState(0);
  const prevAnnouncementRef = useRef<{ text: string; ts: number } | null>(null);
  const navHandledRef = useRef(false);
  const isHostRef = useRef(Boolean(isHost));
  const phaseRef = useRef(game?.phase);

  isHostRef.current = Boolean(isHost);
  phaseRef.current = game?.phase;

  const names = useMemo(() => buildPasswordPlayerNames(game, sessions), [game, sessions]);

  const myTeamIndex = useMemo(() => {
    if (!game) return -1;
    return game.teams.findIndex((t) => t.members.includes(sessionId));
  }, [game?.teams, sessionId]);

  const myActiveRound = useMemo(() => {
    if (!game || !game.active_rounds.length || myTeamIndex === -1) return undefined;
    return game.active_rounds.find((r) => r.teamIndex === myTeamIndex);
  }, [game?.active_rounds, myTeamIndex]);

  const activeRoundId = myActiveRound?.roundId ?? (myTeamIndex >= 0 && game ? `legacy-${game.current_round}-${myTeamIndex}` : null);
  const isSpectator = game?.spectators?.some((s) => s.sessionId === sessionId) ?? false;

  const { liveEntries, publishDraft, clearDraft } = usePasswordLiveTyping({
    enabled: Boolean(game?.phase === "playing" && myTeamIndex >= 0 && !isSpectator),
    gameId,
    teamIndex: myTeamIndex,
    sessionId,
    roundId: activeRoundId,
  });

  useGameSounds({
    phase: game?.phase,
    sessionId,
    isMyTurn: Boolean(myActiveRound),
    phaseEndsAt: game?.settings.roundEndsAt,
  });

  const { decryptValue } = useGameSecret({
    gameType: "password",
    gameId,
    sessionId,
    enabled: Boolean(game && game.phase !== "lobby"),
  });

  const encryptedActiveWord = myActiveRound?.encryptedWord
    ?? (myActiveRound?.word && isEncrypted(myActiveRound.word) ? myActiveRound.word : null);

  // Non-guessers fetch the round key directly, retrying until it lands.
  useEffect(() => {
    if (!game || game.phase !== "playing" || !encryptedActiveWord || fallbackKey) return;
    if (myActiveRound?.guesserId === sessionId) return;
    const apiBase = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    void fetch(`${apiBase}/api/game-secret/key`, {
      method: "POST",
      credentials: "include",
      headers: getSessionRequestHeaders(sessionId, { "Content-Type": "application/json" }),
      body: JSON.stringify({ gameType: "password", gameId, sessionId }),
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = await res.json() as { key?: string };
        return data.key ?? null;
      })
      .then((key) => {
        if (!cancelled && key) setFallbackKey(key);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled && !fallbackKey) {
          retryTimer = setTimeout(() => setFallbackRetryNonce((n) => n + 1), 1500);
        }
      });

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [game?.phase, encryptedActiveWord, fallbackKey, myActiveRound?.guesserId, sessionId, gameId, fallbackRetryNonce]);

  // A host who navigates away mid-game leaves, so the lobby isn't left hostless.
  useEffect(() => {
    let active = false;
    const timer = setTimeout(() => { active = true; }, 500);
    return () => {
      clearTimeout(timer);
      if (!active) return;
      if (!isHostRef.current) return;
      if (phaseRef.current === "results" || phaseRef.current === "ended") return;
      void zero.mutate(mutators.password.leave({ gameId, sessionId }));
    };
  }, [gameId, sessionId, zero]);

  useEffect(() => {
    let cancelled = false;
    const encryptedOrPlain = myActiveRound?.word ?? myActiveRound?.encryptedWord ?? null;
    if (!encryptedOrPlain) {
      setDecryptedActiveWord(null);
      return;
    }
    void decryptValue(encryptedOrPlain).then(async (value) => {
      if (cancelled) return;
      if (value !== null) {
        setDecryptedActiveWord(value);
        return;
      }
      if (!fallbackKey || !isEncrypted(encryptedOrPlain)) {
        setDecryptedActiveWord(null);
        return;
      }
      const fallbackValue = await decryptSecret(encryptedOrPlain, fallbackKey).catch(() => null);
      if (!cancelled) setDecryptedActiveWord(fallbackValue);
    });
    return () => { cancelled = true; };
  }, [myActiveRound?.word, myActiveRound?.encryptedWord, decryptValue, fallbackKey]);

  useEffect(() => {
    setClue("");
    setGuess("");
    clearDraft("clue");
    clearDraft("guess");
  }, [activeRoundId, clearDraft]);

  useEffect(() => {
    let cancelled = false;
    const rounds = game?.rounds ?? [];
    if (rounds.length === 0) {
      setDecryptedRoundWords({});
      return;
    }
    void Promise.all(
      rounds.map(async (round, index) => ({ index, value: await decryptValue(round.word) }))
    ).then((rows) => {
      if (cancelled) return;
      setDecryptedRoundWords(
        rows.reduce<Record<number, string | null>>((acc, row) => {
          acc[row.index] = row.value;
          return acc;
        }, {})
      );
    });
    return () => { cancelled = true; };
  }, [game?.rounds, decryptValue]);

  // Auto-advance timer
  useEffect(() => {
    if (!game || game.phase !== "playing" || !game.settings.roundEndsAt) return;
    const remaining = game.settings.roundEndsAt - Date.now();
    if (remaining <= 0) {
      void zero.mutate(mutators.password.advanceTimer({ gameId }));
      return;
    }
    const timer = setTimeout(() => {
      void zero.mutate(mutators.password.advanceTimer({ gameId }));
    }, remaining + 500);
    return () => clearTimeout(timer);
  }, [game?.settings.roundEndsAt, game?.phase, gameId, zero]);

  // Auto-navigate to results when game ends
  useEffect(() => {
    if (game?.phase === "results") navigate(`/password/${game.id}/results`);
  }, [game?.phase, game?.id, navigate]);

  useEffect(() => {
    if (!game) return;
    if (navHandledRef.current) return;
    if (game.phase === "ended") {
      navHandledRef.current = true;
      showToast("The host ended the game", "info");
      navigate("/");
      return;
    }
    if (game.kicked.includes(sessionId)) {
      navHandledRef.current = true;
      showToast("You were kicked from the game", "error");
      navigate("/");
    }
  }, [game?.phase, game?.kicked, sessionId, navigate]);

  // Announcement watcher (skip for host - they sent it)
  useEffect(() => {
    if (!game?.announcement || isHost) return;
    const prev = prevAnnouncementRef.current;
    const cur = game.announcement;
    if (prev && prev.text === cur.text && Math.abs(cur.ts - prev.ts) < 3000) return;
    prevAnnouncementRef.current = cur;
    showToast(`📢 ${cur.text}`, "info");
  }, [game?.announcement, isHost]);

  // No such game: don't strand the player on an empty screen.
  useEffect(() => {
    if (game) return;
    const timer = setTimeout(() => navigate("/"), 3000);
    return () => clearTimeout(timer);
  }, [game, navigate]);

  const myTeam = myTeamIndex >= 0 ? game?.teams[myTeamIndex] : undefined;

  const submitClue = async (event: FormEvent) => {
    event.preventDefault();
    if (!clue.trim()) return;
    try {
      await optimistic(zero.mutate(mutators.password.submitClue({ gameId, sessionId, clue: clue.trim() })));
      setClue("");
      clearDraft("clue");
      playSoundSubmit();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn't submit clue", "error");
    }
  };

  const submitGuess = async (event: FormEvent) => {
    event.preventDefault();
    if (!guess.trim()) return;
    try {
      await optimistic(zero.mutate(mutators.password.submitGuess({ gameId, sessionId, guess: guess.trim() })));
      setGuess("");
      clearDraft("guess");
      playSoundSubmit();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn't submit guess", "error");
    }
  };

  const skipWord = async () => {
    try {
      await optimistic(zero.mutate(mutators.password.skipWord({ gameId, sessionId })));
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn't skip word", "error");
    }
  };

  return {
    zero, gameId, game, navigate, isHost, names,
    myTeamIndex, myActiveRound, activeRoundId, isSpectator,
    liveEntries,
    clue, guess,
    handleClueChange: (value: string) => { setClue(value); publishDraft("clue", value); },
    handleGuessChange: (value: string) => { setGuess(value); publishDraft("guess", value); },
    submitClue, submitGuess, skipWord,
    /** Kick the fallback-key fetch again when the word fails to load. */
    retryWordLoad: () => setFallbackRetryNonce((n) => n + 1),
    decryptedActiveWord,
    myTeam,
    myTeamMembers: myTeam?.members ?? [],
    myTeamSkips: myTeam && game ? (game.settings.skipsRemaining?.[myTeam.name] ?? 0) : 0,
    gameProgress: game
      ? Math.min(1, Math.max(0, ...Object.values(game.scores)) / Math.max(1, game.settings.targetScore))
      : 0,
    activeRoundView: myActiveRound
      ? {
          ...myActiveRound,
          roundId: activeRoundId ?? myActiveRound.roundId,
          clues: myActiveRound.clues ?? [],
          guesses: myActiveRound.guesses ?? [],
          guessCount: myActiveRound.guessCount ?? myActiveRound.guesses?.length ?? 0,
          word:
            decryptedActiveWord ??
            (myActiveRound.word && !isEncrypted(myActiveRound.word) ? myActiveRound.word : null),
        }
      : undefined,
    roundsForView: (game?.rounds ?? []).map((round, index) => ({
      ...round,
      roundId: round.roundId ?? `legacy-${round.round}-${round.teamIndex}`,
      clues: round.clues ?? [],
      guesses: round.guesses ?? [],
      guessCount: round.guessCount ?? round.guesses?.length ?? 0,
      points: round.points ?? (round.correct ? 1 : 0),
      word: decryptedRoundWords[index] ?? (isEncrypted(round.word) ? "••••" : round.word),
    })),
  };
}
