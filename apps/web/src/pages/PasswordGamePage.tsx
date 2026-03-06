import { mutators, queries } from "@games/shared";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PasswordActiveRound } from "../components/password/PasswordActiveRound";
import { PasswordHeader } from "../components/password/PasswordHeader";
import { PasswordRoundsTable } from "../components/password/PasswordRoundsTable";
import { PasswordTeamGrid } from "../components/password/PasswordTeamGrid";
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

  usePresenceSocket({ sessionId, gameId, gameType: "password" });

  const names = useMemo(() => {
    return sessions.reduce<Record<string, string>>((acc, s) => {
      acc[s.id] = s.name ?? s.id.slice(0, 6);
      return acc;
    }, {});
  }, [sessions]);

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

  if (!game) {
    return (
      <div className="game-page">
        <div className="game-empty"><p>Game not found</p></div>
      </div>
    );
  }

  const activeRound = game.active_round;
  const isHost = game.host_id === sessionId;
  const isClueGiver = activeRound?.clueGiverId === sessionId;
  const isGuesser = activeRound?.guesserId === sessionId;

  const submitClue = async (event: FormEvent) => {
    event.preventDefault();
    if (!word.trim() || !clue.trim()) return;
    await zero.mutate(mutators.password.submitClue({ gameId, sessionId, word: word.trim(), clue: clue.trim() })).server;
    setWord("");
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
          isClueGiver={Boolean(isClueGiver)}
          isGuesser={Boolean(isGuesser)}
          word={word}
          clue={clue}
          guess={guess}
          onWordChange={setWord}
          onClueChange={setClue}
          onGuessChange={setGuess}
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
    </div>
  );
}
