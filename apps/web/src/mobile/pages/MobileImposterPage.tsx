import { DEFAULT_IMPOSTER_CLUE_VISIBILITY, imposterCategoryLabels, mutators } from "@games/shared";
import { FiBookOpen } from "react-icons/fi";
import { GameShellHeader, ShellPill } from "../../components/shared/GameShellHeader";
import { IMPOSTER_PHASES, ImposterLobby } from "../../components/imposter/ImposterLobby";
import { ImposterCluePhase } from "../../components/imposter/ImposterClues";
import { ImposterVotePhase } from "../../components/imposter/ImposterVote";
import { ImposterRoundResult } from "../../components/imposter/ImposterRoundResult";
import { ImposterGameOver } from "../../components/imposter/ImposterGameOver";
import { InSessionModal } from "../../components/shared/InSessionModal";
import { LobbyVisibilityToggle } from "../../components/shared/LobbyVisibilityToggle";
import { SpectatorOverlay } from "../../components/shared/SpectatorOverlay";
import { useImposterGame } from "../../hooks/useImposterGame";
import { getDisplayName } from "../../lib/session";
import { useMobileHostRegister } from "../../lib/mobile-host-context";
import { showToast } from "../../lib/toast";
import { PageLoading } from "../../components/shared/PageLoading";
import "../../styles/game-shared.css";
import { roomStats } from "../../lib/host-room";

/**
 * Imposter on a phone: the desktop page's phase components, one column. The
 * host's kick, visibility and end-game controls live in the Host tab rather
 * than on the page, and How to Play is in the Info tab.
 */
export function MobileImposterPage({ sessionId }: { sessionId: string }) {
  const {
    zero, navigate, gameId, game, me, isHost, inGame, isSpectator,
    sessionById, visibleSecretWord, decryptedRoundWords,
    clue, setClue, voteTarget, setVoteTarget,
    typing, announceTyping,
    activeGameType,
    showInSessionModal, setShowInSessionModal,
    joiningFromOtherGame,
    submitClue, submitVote, handleJoinClick, confirmLeaveAndJoin,
  } = useImposterGame(sessionId);

  useMobileHostRegister(
    isHost && game
      ? {
          type: "imposter", gameId, hostId: game.host_id, isPublic: game.is_public, ...roomStats(game),
          players: game.players.map((p) => ({ sessionId: p.sessionId, name: sessionById[p.sessionId] ?? getDisplayName(p.name, p.sessionId), connected: p.connected })),
          spectators: game.spectators ?? [],
        }
      : null
  );

  if (!game) return <PageLoading />;

  const active = game.players.filter((p) => !p.eliminated);
  const out = Boolean(me?.eliminated);
  const canPlay = inGame && !out && !isSpectator;
  const bank = game.category ? imposterCategoryLabels[game.category] ?? game.category : null;

  return (
    <div className="game-page m-game" data-game-theme="imposter">
      <GameShellHeader
        collapsible
        game="imposter"
        title="Imposter"
        phases={IMPOSTER_PHASES}
        phase={game.phase}
        {...(game.phase === "lobby" ? {} : { round: { current: game.settings.currentRound, total: game.settings.rounds } })}
        endsAt={game.settings.phaseEndsAt}
        duration={game.phase === "voting" ? game.settings.votingDurationSec : game.settings.roundDurationSec}
        code={game.code}
        isHost={isHost}
        isSpectator={isSpectator}
        {...(bank ? { pills: <ShellPill icon={<FiBookOpen />} tooltip="Which word bank this game is drawing from">{bank}</ShellPill> } : {})}
      />

      {game.phase === "lobby" && (
        <ImposterLobby
          players={game.players}
          sessionId={sessionId}
          hostId={game.host_id}
          sessionById={sessionById}
          settings={game.settings}
          category={game.category}
          isHost={isHost}
          inGame={inGame}
          isSpectator={isSpectator}
          onSettingsChange={(settings) => void zero.mutate(mutators.imposter.updateSettings({ gameId, hostId: sessionId, settings }))
            .client.catch(() => showToast("Couldn't change that setting", "error"))}
          onStart={() => void zero.mutate(mutators.imposter.start({ gameId, hostId: sessionId }))}
          onLeave={() => void zero.mutate(mutators.imposter.leave({ gameId, sessionId }))}
          onJoin={handleJoinClick}
          onKick={(targetId) => void zero.mutate(mutators.imposter.kick({ gameId, hostId: sessionId, targetId }))
            .client.catch(() => showToast("Couldn't remove them", "error"))}
          {...(isHost
            ? { actions: <LobbyVisibilityToggle gameType="imposter" gameId={gameId} sessionId={sessionId} isPublic={game.is_public} /> }
            : {})}
        />
      )}

      {game.phase === "playing" && (
        <ImposterCluePhase
          role={me?.role}
          secretWord={visibleSecretWord}
          category={game.category}
          imposters={game.settings.imposters}
          players={active}
          clues={game.clues}
          typing={typing}
          sessionId={sessionId}
          sessionById={sessionById}
          clueVisibility={game.settings.clueVisibility ?? DEFAULT_IMPOSTER_CLUE_VISIBILITY}
          clue={clue}
          submitted={game.clues.some((c) => c.sessionId === sessionId)}
          canWrite={canPlay}
          onClueChange={setClue}
          onSubmit={submitClue}
          onTyping={announceTyping}
        />
      )}

      {game.phase === "voting" && (
        <ImposterVotePhase
          players={active}
          clues={game.clues}
          sessionId={sessionId}
          sessionById={sessionById}
          voted={game.votes.map((v) => v.voterId)}
          voteTarget={voteTarget}
          submittedTarget={game.votes.find((v) => v.voterId === sessionId)?.targetId ?? null}
          canVote={canPlay}
          onVoteTargetChange={setVoteTarget}
          onSubmit={() => void submitVote()}
        />
      )}

      {game.phase === "results" && (
        <ImposterRoundResult
          players={active}
          votes={game.votes}
          clues={game.clues}
          sessionById={sessionById}
          secretWord={visibleSecretWord}
          skipVotes={(game.settings.skipVotes ?? []).length}
          hasVotedSkip={(game.settings.skipVotes ?? []).includes(sessionId)}
          canSkip={canPlay}
          onSkip={() => void zero.mutate(mutators.imposter.voteSkipResults({ gameId, sessionId }))}
        />
      )}

      {game.phase === "finished" && (
        <ImposterGameOver
          players={game.players}
          sessionId={sessionId}
          sessionById={sessionById}
          isHost={isHost}
          rounds={(game.round_history ?? []).map((round) => ({
            round: round.round,
            secretWord: round.secretWord ? decryptedRoundWords[round.round] ?? null : null,
            votedOutId: round.votedOutId,
            wasImposter: round.wasImposter,
            clues: round.clues,
            votes: round.votes,
          }))}
          onPlayAgain={() => void zero.mutate(mutators.imposter.resetToLobby({ gameId, hostId: sessionId }))}
          onEnd={() => {
            void zero.mutate(mutators.imposter.endGame({ gameId, hostId: sessionId }))
              .client.then(() => navigate("/"))
              .catch(() => showToast("Couldn't end game", "error"));
          }}
          onHome={() => navigate("/")}
        />
      )}

      {isSpectator && game.phase !== "lobby" && (
        <SpectatorOverlay
          playerCount={active.length}
          phase={game.phase}
          onLeave={() => void zero.mutate(mutators.imposter.leaveSpectator({ gameId, sessionId })).client.then(() => navigate("/"))}
        />
      )}

      {showInSessionModal && activeGameType && (
        <InSessionModal
          gameType={activeGameType}
          busy={joiningFromOtherGame}
          onCancel={() => setShowInSessionModal(false)}
          onConfirm={confirmLeaveAndJoin}
        />
      )}
    </div>
  );
}
