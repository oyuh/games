import { mutators, queries } from "@games/shared";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { FormEvent, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PasswordActiveRound } from "../components/password/PasswordActiveRound";
import { PasswordHeader } from "../components/password/PasswordHeader";
import { PasswordTeamGrid } from "../components/password/PasswordTeamGrid";
import { RoundCountdown } from "../components/shared/RoundCountdown";
import { usePresenceSocket } from "../hooks/usePresenceSocket";

export function PasswordGamePage({ sessionId }: { sessionId: string }) {
  const zero = useZero();
  const params = useParams();
  const gameId = params.id ?? "";
  const [games] = useQuery(queries.password.byId({ id: gameId }));
  const [sessions] = useQuery(queries.sessions.byGame({ gameType: "password", gameId }));
  const game = games[0];
  const [word, setWord] = useState("");
  const [clue, setClue] = useState("");
  const [guess, setGuess] = useState("");

  usePresenceSocket({
    sessionId,
    gameId,
    gameType: "password"
  });

  const names = useMemo(() => {
    return sessions.reduce<Record<string, string>>((acc, session) => {
      acc[session.id] = session.name ?? session.id.slice(0, 6);
      return acc;
    }, {});
  }, [sessions]);

  if (!game) {
    return <p>Password game not found.</p>;
  }

  const activeRound = game.active_round;
  const isHost = game.host_id === sessionId;
  const isClueGiver = activeRound?.clueGiverId === sessionId;
  const isGuesser = activeRound?.guesserId === sessionId;

  const submitClue = async (event: FormEvent) => {
    event.preventDefault();
    if (!word.trim() || !clue.trim()) {
      return;
    }
    await zero.mutate(mutators.password.submitClue({ gameId, sessionId, word: word.trim(), clue: clue.trim() })).server;
    setWord("");
    setClue("");
  };

  const submitGuess = async (event: FormEvent) => {
    event.preventDefault();
    if (!guess.trim()) {
      return;
    }
    await zero.mutate(mutators.password.submitGuess({ gameId, sessionId, guess: guess.trim() })).server;
    setGuess("");
  };

  return (
    <div className="card p-6 space-y-4 max-w-3xl mx-auto">
      <PasswordHeader title="Password" code={game.code} />

      <div className="flex flex-wrap items-center gap-2" style={{ fontSize: "0.875rem", color: "var(--muted-foreground)" }}>
        <span>Phase: {game.phase}</span>
        <span>•</span>
        <span>Round: {game.current_round}</span>
        <span>•</span>
        <span>Completed rounds: {game.rounds.length}</span>
        <span>•</span>
        <RoundCountdown endsAt={game.active_round?.endsAt} label="Round timer" />
      </div>

      <PasswordTeamGrid
        teams={game.teams}
        scores={game.scores}
        names={names}
        activeTeamIndex={activeRound?.teamIndex}
        sessionId={sessionId}
        showScores
      />

      {game.phase === "playing" && activeRound ? (
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
      ) : null}

      {game.phase === "results" ? (
        <div className="space-y-2">
          <p style={{ color: "var(--muted-foreground)", fontSize: "0.875rem" }}>Game finished. See final results.</p>
          <Link to={`/password/${game.id}/results`} className="btn btn-primary inline-flex">
            Open results
          </Link>
        </div>
      ) : (
        <Link to={`/password/${game.id}/results`} className="btn btn-ghost inline-flex">
          Live results view
        </Link>
      )}

      {isHost ? (
        <button className="btn btn-muted" onClick={() => zero.mutate(mutators.password.resetToLobby({ gameId, hostId: sessionId }))}>
          Reset to lobby
        </button>
      ) : null}
    </div>
  );
}
