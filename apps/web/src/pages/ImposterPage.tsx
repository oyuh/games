import { mutators, queries } from "@games/shared";
import { Card } from "flowbite-react";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ImposterClueSection } from "../components/imposter/ImposterClueSection";
import { ImposterHeader } from "../components/imposter/ImposterHeader";
import { ImposterLobbyActions } from "../components/imposter/ImposterLobbyActions";
import { ImposterPlayersCard } from "../components/imposter/ImposterPlayersCard";
import { ImposterResultsSection } from "../components/imposter/ImposterResultsSection";
import { ImposterVoteSection } from "../components/imposter/ImposterVoteSection";
import { RoundCountdown } from "../components/shared/RoundCountdown";
import { usePresenceSocket } from "../hooks/usePresenceSocket";
import { addRecentGame } from "../lib/session";

export function ImposterPage({ sessionId }: { sessionId: string }) {
  const zero = useZero();
  const params = useParams();
  const gameId = params.id ?? "";
  const [games] = useQuery(queries.imposter.byId({ id: gameId }));
  const [sessions] = useQuery(queries.sessions.byGame({ gameType: "imposter", gameId }));
  const game = games[0];
  const [clue, setClue] = useState("");
  const [voteTarget, setVoteTarget] = useState("");

  useEffect(() => {
    if (!gameId) {
      return;
    }
    void zero.mutate(mutators.imposter.join({ gameId, sessionId }));
  }, [zero, gameId, sessionId]);

  usePresenceSocket({
    sessionId,
    gameId,
    gameType: "imposter"
  });

  const isHost = game?.hostId === sessionId;
  const me = useMemo(() => game?.players.find((player) => player.sessionId === sessionId), [game, sessionId]);
  const sessionById = useMemo(() => {
    return sessions.reduce<Record<string, string>>((acc, session) => {
      acc[session.id] = session.name ?? session.id.slice(0, 6);
      return acc;
    }, {});
  }, [sessions]);

  const tally = useMemo(() => {
    if (!game) {
      return {} as Record<string, number>;
    }
    return game.votes.reduce<Record<string, number>>((acc, vote) => {
      acc[vote.targetId] = (acc[vote.targetId] ?? 0) + 1;
      return acc;
    }, {});
  }, [game]);

  useEffect(() => {
    if (!game) {
      return;
    }
    addRecentGame({
      id: game.id,
      code: game.code,
      gameType: "imposter"
    });
  }, [game]);

  if (!game) {
    return <p>Imposter game not found.</p>;
  }

  const submitClue = async (event: FormEvent) => {
    event.preventDefault();
    if (!clue.trim()) {
      return;
    }
    await zero.mutate(mutators.imposter.submitClue({ gameId, sessionId, text: clue.trim() })).server;
    setClue("");
  };

  const submitVote = async () => {
    if (!voteTarget) {
      return;
    }
    await zero.mutate(mutators.imposter.submitVote({ gameId, voterId: sessionId, targetId: voteTarget })).server;
  };

  return (
    <Card className="space-y-4">
      <ImposterHeader code={game.code} />

      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
        <span>Phase: {game.phase}</span>
        <span>•</span>
        <span>Round: {game.settings.currentRound}/{game.settings.rounds}</span>
        <span>•</span>
        <span>Players: {game.players.length}</span>
        <span>•</span>
        <RoundCountdown endsAt={game.settings.phaseEndsAt} label="Time left" />
      </div>

      <ImposterPlayersCard
        players={game.players}
        sessionId={sessionId}
        sessionById={sessionById}
        revealRoles={game.phase !== "lobby"}
      />

      {game.phase === "lobby" ? (
        <ImposterLobbyActions
          canStart={Boolean(isHost && game.players.length >= 3)}
          onStart={() => void zero.mutate(mutators.imposter.start({ gameId, hostId: sessionId }))}
          onLeave={() => void zero.mutate(mutators.imposter.leave({ gameId, sessionId }))}
        />
      ) : null}

      {game.phase === "playing" ? (
        <ImposterClueSection
          role={me?.role}
          secretWord={game.secretWord}
          clue={clue}
          clueCount={game.clues.length}
          playerCount={game.players.length}
          onClueChange={setClue}
          onSubmit={submitClue}
        />
      ) : null}

      {game.phase === "voting" ? (
        <ImposterVoteSection
          players={game.players}
          sessionById={sessionById}
          voteTarget={voteTarget}
          voteCount={game.votes.length}
          playerCount={game.players.length}
          onVoteTargetChange={setVoteTarget}
          onSubmit={() => void submitVote()}
        />
      ) : null}

      {game.phase === "results" ? (
        <ImposterResultsSection
          tally={tally}
          players={game.players}
          sessionById={sessionById}
          canAdvance={Boolean(isHost)}
          onNextRound={() => void zero.mutate(mutators.imposter.nextRound({ gameId, hostId: sessionId }))}
        />
      ) : null}
    </Card>
  );
}
