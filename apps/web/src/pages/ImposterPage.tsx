import { mutators, DEFAULT_IMPOSTER_CLUE_VISIBILITY } from "@games/shared";
import { useZero } from "../lib/zero";
import "../styles/game-shared.css";
import { useState } from "react";
import { FiBookOpen } from "react-icons/fi";
import { GameShellHeader, ShellPill } from "../components/shared/GameShellHeader";
import { GameEmpty, GamePanel } from "../components/shared/GameKit";
import { IMPOSTER_PHASES, ImposterLobby } from "../components/imposter/ImposterLobby";
import { ImposterCluePhase } from "../components/imposter/ImposterClues";
import { ImposterVotePhase } from "../components/imposter/ImposterVote";
import { ImposterRoundResult } from "../components/imposter/ImposterRoundResult";
import { ImposterGameOver } from "../components/imposter/ImposterGameOver";
import { InSessionModal } from "../components/shared/InSessionModal";
import { LobbyVisibilityToggle } from "../components/shared/LobbyVisibilityToggle";
import { SpectatorOverlay } from "../components/shared/SpectatorOverlay";
import { showToast } from "../lib/toast";
import { useIsMobile } from "../hooks/useIsMobile";
import { MobileImposterPage } from "../mobile/pages/MobileImposterPage";
import { ImposterDemo } from "../components/demos/ImposterDemo";
import { useImposterGame } from "../hooks/useImposterGame";
import { imposterCategoryLabels } from "@games/shared";

/**
 * Imposter, assembled out of the game kit. Every phase is its own component
 * with its own states, all of them visible at /dev/imposter, so this file is
 * only the wiring: which phase is on, who you are in it, and which mutator a
 * button reaches for.
 */
function ImposterPageDesktop({ sessionId }: { sessionId: string }) {
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
  const [showDemo, setShowDemo] = useState(false);

  if (!game) {
    return (
      <div className="game-page">
        <GamePanel>
          <GameEmpty title="No game here" hint="Taking you home…" />
        </GamePanel>
      </div>
    );
  }

  /* Everyone still standing. Eliminated players watch from here on, so almost
     every phase counts and lists this rather than the full roster. */
  const active = game.players.filter((p) => !p.eliminated);
  const out = Boolean(me?.eliminated);
  /* A spectator or a player already voted out reads the room and does nothing
     in it. Both land in the same place, so both get the same flag. */
  const canPlay = inGame && !out && !isSpectator;
  const bank = game.category ? imposterCategoryLabels[game.category] ?? game.category : null;

  return (
    <div className="game-page" data-game-theme="imposter">
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
          /* The stored words are encrypted, so hand over the readable ones. */
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

      {showDemo && <ImposterDemo onClose={() => setShowDemo(false)} />}

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

export function ImposterPage({ sessionId }: { sessionId: string }) {
  const isMobile = useIsMobile();
  if (isMobile) return <MobileImposterPage sessionId={sessionId} />;
  return <ImposterPageDesktop sessionId={sessionId} />;
}
