import { mutators, queries } from "@games/shared";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PasswordActiveRound } from "../components/password/PasswordActiveRound";
import { PasswordHeader } from "../components/password/PasswordHeader";
import { PasswordRoundsTable } from "../components/password/PasswordRoundsTable";
import { PasswordTeamGrid } from "../components/password/PasswordTeamGrid";
import { usePresenceSocket } from "../hooks/usePresenceSocket";
import { showToast } from "../lib/toast";
import { useIsMobile } from "../hooks/useIsMobile";
import { MobilePasswordGamePage } from "../mobile/pages/MobilePasswordGamePage";

export function PasswordGamePage({ sessionId }: { sessionId: string }) {
  const isMobile = useIsMobile();
  if (isMobile) return <MobilePasswordGamePage sessionId={sessionId} />;

  const zero = useZero();
  const params = useParams();
  const navigate = useNavigate();
  const gameId = params.id ?? "";
  const [games] = useQuery(queries.password.byId({ id: gameId }));
  const [sessions] = useQuery(queries.sessions.byGame({ gameType: "password", gameId }));
  const game = games[0];
  const [clue, setClue] = useState("");
  const [guess, setGuess] = useState("");
  const prevAnnouncementRef = useRef<{ text: string; ts: number } | null>(null);

  usePresenceSocket({ sessionId, gameId, gameType: "password" });

  const isHost = game?.host_id === sessionId;

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

  return (
    <div className="game-page" data-game-theme="password">
      <PasswordHeader
        title="Password"
        code={game.code}
        phase={game.phase}
        currentRound={game.current_round}
        endsAt={game.settings.roundEndsAt}
        isHost={isHost}
        category={game.settings.category}
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

      {game.phase === "playing" && myActiveRound && (
        <PasswordActiveRound
          activeRound={myActiveRound}
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
        />
      )}

      {game.phase === "playing" && !myActiveRound && (
        <div className="game-section">
          <div className="game-waiting">
            <div className="game-waiting-pulse" />
            <p>All teams are racing! Watch the scores update in real time.</p>
          </div>
        </div>
      )}

      {game.phase === "results" && (
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

      <PasswordRoundsTable rounds={game.rounds} teams={game.teams} names={names} />

      {isHost && (
        <div className="game-section">
          <button
            className="btn btn-muted"
            onClick={() => {
              void zero.mutate(mutators.password.resetToLobby({ gameId, hostId: sessionId }));
              void navigate(`/password/${game.id}/begin`);
            }}
          >
            Reset to Lobby
          </button>
        </div>
      )}
    </div>
  );
}
