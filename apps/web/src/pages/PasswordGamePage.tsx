import { mutators, queries } from "@games/shared";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PasswordActiveRound } from "../components/password/PasswordActiveRound";
import { PasswordHeader } from "../components/password/PasswordHeader";
import { PasswordRoundsTable } from "../components/password/PasswordRoundsTable";
import { PasswordTeamGrid } from "../components/password/PasswordTeamGrid";
import { ChatWindow } from "../components/shared/ChatWindow";
import { usePresenceSocket } from "../hooks/usePresenceSocket";
import { showToast } from "../lib/toast";

export function PasswordGamePage({ sessionId }: { sessionId: string }) {
  const zero = useZero();
  const params = useParams();
  const navigate = useNavigate();
  const gameId = params.id ?? "";
  const [games] = useQuery(queries.password.byId({ id: gameId }));
  const [sessions] = useQuery(queries.sessions.byGame({ gameType: "password", gameId }));
  const game = games[0];
  const [word, setWord] = useState("");
  const [clue, setClue] = useState("");
  const [guess, setGuess] = useState("");
  const prevAnnouncementTs = useRef<number | null>(null);

  usePresenceSocket({ sessionId, gameId, gameType: "password" });

  const names = useMemo(() => {
    return sessions.reduce<Record<string, string>>((acc, s) => {
      acc[s.id] = s.name ?? s.id.slice(0, 6);
      return acc;
    }, {});
  }, [sessions]);

  // Auto-advance timer
  useEffect(() => {
    if (!game || game.phase !== "playing" || !game.active_round) return;
    const remaining = game.active_round.endsAt - Date.now();
    if (remaining <= 0) {
      void zero.mutate(mutators.password.advanceTimer({ gameId }));
      return;
    }
    const timer = setTimeout(() => {
      void zero.mutate(mutators.password.advanceTimer({ gameId }));
    }, remaining + 500);
    return () => clearTimeout(timer);
  }, [game?.active_round?.endsAt, game?.phase, gameId, zero]);

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

  // Announcement watcher
  useEffect(() => {
    if (!game?.announcement) return;
    if (prevAnnouncementTs.current !== game.announcement.ts) {
      prevAnnouncementTs.current = game.announcement.ts;
      showToast(`📢 ${game.announcement.text}`, "info");
    }
  }, [game?.announcement]);

  if (!game) {
    return (
      <div className="game-page">
        <div className="game-empty"><p>Game not found</p></div>
      </div>
    );
  }

  const activeRound = game.active_round;
  const isHost = game.host_id === sessionId;
  const activeTeam = activeRound ? game.teams[activeRound.teamIndex] : undefined;
  const teamMembers = activeTeam?.members ?? [];

  const setSecretWord = async (event: FormEvent) => {
    event.preventDefault();
    if (!word.trim()) return;
    await zero.mutate(mutators.password.setWord({ gameId, sessionId, word: word.trim() })).server;
    setWord("");
  };

  const submitClue = async (event: FormEvent) => {
    event.preventDefault();
    if (!clue.trim()) return;
    await zero.mutate(mutators.password.submitClue({ gameId, sessionId, clue: clue.trim() })).server;
    setClue("");
  };

  const submitGuess = async (event: FormEvent) => {
    event.preventDefault();
    if (!guess.trim()) return;
    await zero.mutate(mutators.password.submitGuess({ gameId, sessionId, guess: guess.trim() })).server;
    setGuess("");
  };

  return (
    <div className="game-page">
      <PasswordHeader
        title="Password"
        code={game.code}
        phase={game.phase}
        currentRound={game.current_round}
        endsAt={activeRound?.endsAt}
        isHost={isHost}
      />

      <PasswordTeamGrid
        teams={game.teams}
        scores={game.scores}
        names={names}
        activeTeamIndex={activeRound?.teamIndex}
        sessionId={sessionId}
        showScores
      />

      {game.phase === "playing" && activeRound && (
        <PasswordActiveRound
          activeRound={activeRound}
          names={names}
          sessionId={sessionId}
          teamMembers={teamMembers}
          word={word}
          clue={clue}
          guess={guess}
          onWordChange={setWord}
          onClueChange={setClue}
          onGuessChange={setGuess}
          onSetWord={setSecretWord}
          onSubmitClue={submitClue}
          onSubmitGuess={submitGuess}
        />
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

      {/* In-game Chat */}
      {game && game.phase !== "ended" && (
        <ChatWindow
          gameType="password"
          gameId={gameId}
          hostId={game.host_id}
          myBadge={getPasswordBadge()}
          myName={names[sessionId] ?? sessionId.slice(0, 6)}
        />
      )}
    </div>
  );

  function getPasswordBadge() {
    const parts: string[] = [];
    if (isHost) parts.push("Host");
    const myTeam = game?.teams.find((t) => t.members.includes(sessionId));
    if (myTeam) parts.push(myTeam.name);
    return parts.join(" \u00b7 ") || undefined;
  }
}
