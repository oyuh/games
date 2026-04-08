import { decryptSecret, isEncrypted, mutators, queries } from "@games/shared";
import { useQuery, useZero } from "../lib/zero";
import "../styles/game-shared.css";
import "../styles/password.css";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PasswordActiveRound } from "../components/password/PasswordActiveRound";
import { PasswordHeader } from "../components/password/PasswordHeader";
import { PasswordRoundsTable } from "../components/password/PasswordRoundsTable";
import { PasswordTeamGrid } from "../components/password/PasswordTeamGrid";
import { SpectatorOverlay } from "../components/shared/SpectatorOverlay";
import { usePresenceSocket } from "../hooks/usePresenceSocket";
import { showToast } from "../lib/toast";
import { useIsMobile } from "../hooks/useIsMobile";
import { MobilePasswordGamePage } from "../mobile/pages/MobilePasswordGamePage";
import { useGameSecret } from "../lib/game-secrets";
import { getSessionRequestHeaders } from "../lib/session";
import { useGameSounds, playSoundSubmit } from "../hooks/useGameSounds";

function PasswordGamePageDesktop({ sessionId }: { sessionId: string }) {

  const zero = useZero();
  const params = useParams();
  const navigate = useNavigate();
  const gameId = params.id ?? "";
  const [games] = useQuery(queries.password.byId({ id: gameId }));
  const [sessions] = useQuery(queries.sessions.byGame({ gameType: "password", gameId }));
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

  usePresenceSocket({ sessionId, gameId, gameType: "password" });

  const names = useMemo(() => {
    return sessions.reduce<Record<string, string>>((acc, s) => {
      acc[s.id] = s.name ?? s.id.slice(0, 6);
      return acc;
    }, {});
  }, [sessions]);

  // Find the player's team index
  const myTeamIndex = useMemo(() => {
    if (!game) return -1;
    return game.teams.findIndex((t) => t.members.includes(sessionId));
  }, [game?.teams, sessionId]);

  // Find this player's team's active round
  const myActiveRound = useMemo(() => {
    if (!game || !game.active_rounds.length || myTeamIndex === -1) return undefined;
    return game.active_rounds.find((r) => r.teamIndex === myTeamIndex);
  }, [game?.active_rounds, myTeamIndex]);

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
    enabled: Boolean(game && game.phase !== "lobby")
  });

  const encryptedActiveWord = myActiveRound?.encryptedWord
    ?? (myActiveRound?.word && isEncrypted(myActiveRound.word) ? myActiveRound.word : null);

  useEffect(() => {
    if (!game || game.phase !== "playing" || !encryptedActiveWord || fallbackKey) return;
    if (myActiveRound?.guesserId === sessionId) return;
    const apiBase = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    void fetch(`${apiBase}/api/game-secret/key`, {
      method: "POST",
      credentials: "include",
      headers: getSessionRequestHeaders(sessionId, {
        "Content-Type": "application/json"
      }),
      body: JSON.stringify({ gameType: "password", gameId, sessionId })
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = await res.json() as { key?: string };
        return data.key ?? null;
      })
      .then((key) => {
        if (!cancelled && key) {
          setFallbackKey(key);
        }
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

  useEffect(() => {
    let active = false;
    const timer = setTimeout(() => {
      active = true;
    }, 500);

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
      if (!cancelled) {
        setDecryptedActiveWord(fallbackValue);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [myActiveRound?.word, myActiveRound?.encryptedWord, decryptValue, fallbackKey]);

  useEffect(() => {
    let cancelled = false;
    const rounds = game?.rounds ?? [];
    if (rounds.length === 0) {
      setDecryptedRoundWords({});
      return;
    }
    void Promise.all(
      rounds.map(async (round, index) => ({
        index,
        value: await decryptValue(round.word)
      }))
    ).then((rows) => {
      if (cancelled) return;
      setDecryptedRoundWords(
        rows.reduce<Record<number, string | null>>((acc, row) => {
          acc[row.index] = row.value;
          return acc;
        }, {})
      );
    });
    return () => {
      cancelled = true;
    };
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
    if (game?.phase === "results") {
      navigate(`/password/${game.id}/results`);
    }
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

  // Announcement watcher (skip for host — they sent it)
  useEffect(() => {
    if (!game?.announcement || isHost) return;
    const prev = prevAnnouncementRef.current;
    const cur = game.announcement;
    if (prev && prev.text === cur.text && Math.abs(cur.ts - prev.ts) < 3000) return;
    prevAnnouncementRef.current = cur;
    showToast(`📢 ${cur.text}`, "info");
  }, [game?.announcement, isHost]);

  useEffect(() => {
    if (game) return;
    const timer = setTimeout(() => navigate("/"), 3000);
    return () => clearTimeout(timer);
  }, [game, navigate]);

  if (!game) {
    return (
      <div className="game-page">
        <div className="game-empty">
          <p className="game-empty-title">Game not found</p>
          <p className="game-empty-sub">Redirecting home…</p>
          <button className="btn btn-primary" onClick={() => navigate("/")}>Go Home</button>
        </div>
      </div>
    );
  }

  const myTeam = myTeamIndex >= 0 ? game.teams[myTeamIndex] : undefined;
  const myTeamMembers = myTeam?.members ?? [];

  const submitClue = async (event: FormEvent) => {
    event.preventDefault();
    if (!clue.trim()) return;
    try {
      await zero.mutate(mutators.password.submitClue({ gameId, sessionId, clue: clue.trim() })).server;
      setClue("");
      playSoundSubmit();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn't submit clue", "error");
    }
  };

  const submitGuess = async (event: FormEvent) => {
    event.preventDefault();
    if (!guess.trim()) return;
    try {
      await zero.mutate(mutators.password.submitGuess({ gameId, sessionId, guess: guess.trim() })).server;
      setGuess("");
      playSoundSubmit();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn't submit guess", "error");
    }
  };

  const skipWord = async () => {
    try {
      await zero.mutate(mutators.password.skipWord({ gameId, sessionId })).server;
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn't skip word", "error");
    }
  };

  const myTeamSkips = myTeam ? (game.settings.skipsRemaining?.[myTeam.name] ?? 0) : 0;
  const isSpectator = game.spectators?.some((s) => s.sessionId === sessionId) ?? false;
  const activeRoundView = myActiveRound
    ? {
        ...myActiveRound,
        word:
          decryptedActiveWord ??
          (myActiveRound.word && !isEncrypted(myActiveRound.word) ? myActiveRound.word : null),
      }
    : undefined;
  const roundsForView = game.rounds.map((round, index) => ({
    ...round,
    word: decryptedRoundWords[index] ?? (isEncrypted(round.word) ? "••••" : round.word)
  }));

  return (
    <div className="game-page" data-game-theme="password">
      <PasswordHeader
        title="Password"
        code={game.code}
        phase={game.phase}
        currentRound={game.current_round}
        endsAt={game.settings.roundEndsAt}
        isHost={isHost}
        category={game.settings.category ?? null}
        isSpectator={isSpectator}
      />

      <PasswordTeamGrid
        teams={game.teams}
        scores={game.scores}
        names={names}
        activeTeamIndex={undefined}
        sessionId={sessionId}
        showScores
        targetScore={game.settings.targetScore}
      />

      {isSpectator && (
        <SpectatorOverlay
          playerCount={game.teams.reduce((n, t) => n + t.members.length, 0)}
          phase={game.phase}
          onLeave={() => void zero.mutate(mutators.password.leaveSpectator({ gameId, sessionId })).client.then(() => navigate("/"))}
        />
      )}

      {!isSpectator && game.phase === "playing" && activeRoundView && (
        <PasswordActiveRound
          activeRound={activeRoundView}
          names={names}
          sessionId={sessionId}
          teamMembers={myTeamMembers}
          clue={clue}
          guess={guess}
          skipsRemaining={myTeamSkips}
          onClueChange={setClue}
          onGuessChange={setGuess}
          onSubmitClue={submitClue}
          onSubmitGuess={submitGuess}
          onSkip={skipWord}
          onRetryWordLoad={() => setFallbackRetryNonce((n) => n + 1)}
        />
      )}

      {!isSpectator && game.phase === "playing" && !myActiveRound && (
        <div className="game-section">
          <div className="game-waiting">
            <div className="game-waiting-pulse" />
            <p>All teams are racing! Watch the scores update in real time.</p>
          </div>
        </div>
      )}

      {!isSpectator && game.phase === "results" && (
        <div className="game-section">
          <div className="game-reveal-card game-reveal-card--success">
            <p className="game-reveal-title">Game Over!</p>
            <p className="game-reveal-sub">Check the results to see who won.</p>
          </div>
          <div className="game-actions">
            <Link to={`/password/${game.id}/results`} className="btn btn-primary game-action-btn">
              View Results
            </Link>
          </div>
        </div>
      )}

      <PasswordRoundsTable rounds={roundsForView} teams={game.teams} names={names} />
    </div>
  );
}

export function PasswordGamePage({ sessionId }: { sessionId: string }) {
  const isMobile = useIsMobile();
  if (isMobile) return <MobilePasswordGamePage sessionId={sessionId} />;
  return <PasswordGamePageDesktop sessionId={sessionId} />;
}
