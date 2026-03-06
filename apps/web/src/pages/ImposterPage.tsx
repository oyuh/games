import { mutators, queries } from "@games/shared";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { FiLogIn } from "react-icons/fi";
import { ImposterClueSection } from "../components/imposter/ImposterClueSection";
import { ImposterHeader } from "../components/imposter/ImposterHeader";
import { ImposterLobbyActions } from "../components/imposter/ImposterLobbyActions";
import { ImposterPlayersCard } from "../components/imposter/ImposterPlayersCard";
import { ImposterResultsSection } from "../components/imposter/ImposterResultsSection";
import { ImposterVoteSection } from "../components/imposter/ImposterVoteSection";
import { usePresenceSocket } from "../hooks/usePresenceSocket";
import { addRecentGame } from "../lib/session";

export function ImposterPage({ sessionId }: { sessionId: string }) {
  const zero = useZero();
  const params = useParams();
  const gameId = params.id ?? "";
  const [games] = useQuery(queries.imposter.byId({ id: gameId }));
  const [sessions] = useQuery(queries.sessions.byGame({ gameType: "imposter", gameId }));
  useQuery(queries.sessions.byId({ id: sessionId }));
  const game = games[0];
  const [clue, setClue] = useState("");
  const [voteTarget, setVoteTarget] = useState("");

  usePresenceSocket({ sessionId, gameId, gameType: "imposter" });

  const isHost = game?.host_id === sessionId;
  const me = useMemo(() => game?.players.find((p) => p.sessionId === sessionId), [game, sessionId]);
  const inGame = Boolean(me);

  const sessionById = useMemo(() => {
    return sessions.reduce<Record<string, string>>((acc, s) => {
      acc[s.id] = s.name ?? s.id.slice(0, 6);
      return acc;
    }, {});
  }, [sessions]);

  const tally = useMemo(() => {
    if (!game) return {} as Record<string, number>;
    return game.votes.reduce<Record<string, number>>((acc, v) => {
      acc[v.targetId] = (acc[v.targetId] ?? 0) + 1;
      return acc;
    }, {});
  }, [game]);

  useEffect(() => {
    if (!game) return;
    addRecentGame({ id: game.id, code: game.code, gameType: "imposter" });
  }, [game]);

  if (!game) {
    return (
      <div className="game-page">
        <div className="game-empty"><p>Game not found</p></div>
      </div>
    );
  }

  const submitClue = async (event: FormEvent) => {
    event.preventDefault();
    if (!clue.trim()) return;
    await zero.mutate(mutators.imposter.submitClue({ gameId, sessionId, text: clue.trim() })).server;
    setClue("");
  };

  const submitVote = async () => {
    if (!voteTarget) return;
    await zero.mutate(mutators.imposter.submitVote({ gameId, voterId: sessionId, targetId: voteTarget })).server;
  };

  const isLastRound = game.settings.currentRound >= game.settings.rounds;

  return (
    <div className="game-page">
      <ImposterHeader
        code={game.code}
        phase={game.phase}
        currentRound={game.settings.currentRound}
        totalRounds={game.settings.rounds}
        phaseEndsAt={game.settings.phaseEndsAt}
      />

      <ImposterPlayersCard
        players={game.players}
        sessionId={sessionId}
        sessionById={sessionById}
        revealRoles={game.phase === "results"}
      />

      {game.phase === "lobby" && !inGame && (
        <div className="game-section game-join-prompt">
          <p className="game-join-text">You're not in this lobby yet.</p>
          <button
            className="btn btn-primary game-action-btn"
            onClick={() => void zero.mutate(mutators.imposter.join({ gameId, sessionId }))}
          >
            <FiLogIn size={16} /> Join Game
          </button>
        </div>
      )}

      {game.phase === "lobby" && inGame && (
        <ImposterLobbyActions
          canStart={Boolean(isHost && game.players.length >= 3)}
          playerCount={game.players.length}
          onStart={() => void zero.mutate(mutators.imposter.start({ gameId, hostId: sessionId }))}
          onLeave={() => void zero.mutate(mutators.imposter.leave({ gameId, sessionId }))}
        />
      )}

      {game.phase === "playing" && (
        <ImposterClueSection
          role={me?.role}
          secretWord={game.secret_word}
          clue={clue}
          clueCount={game.clues.length}
          playerCount={game.players.length}
          onClueChange={setClue}
          onSubmit={submitClue}
        />
      )}

      {game.phase === "voting" && (
        <ImposterVoteSection
          players={game.players}
          sessionId={sessionId}
          sessionById={sessionById}
          voteTarget={voteTarget}
          voteCount={game.votes.length}
          playerCount={game.players.length}
          clues={game.clues}
          onVoteTargetChange={setVoteTarget}
          onSubmit={() => void submitVote()}
        />
      )}

      {game.phase === "results" && (
        <ImposterResultsSection
          tally={tally}
          players={game.players}
          sessionById={sessionById}
          secretWord={game.secret_word}
          canAdvance={Boolean(isHost)}
          isLastRound={isLastRound}
          onNextRound={() => void zero.mutate(mutators.imposter.nextRound({ gameId, hostId: sessionId }))}
        />
      )}
    </div>
  );
}
