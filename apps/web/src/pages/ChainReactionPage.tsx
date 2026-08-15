import { mutators, chainCategoryLabels } from "@games/shared";
import { optimistic } from "../lib/zero";
import "../styles/game-shared.css";
/* The old sheet. Nothing on this page reaches for it any more, but the mobile
   page below still draws its own markup and has not moved onto the kit yet. */
import "../styles/chain-reaction.css";
import { useState } from "react";
import { FiBookOpen, FiClock, FiEye } from "react-icons/fi";
import { GameShellHeader, ShellPill } from "../components/shared/GameShellHeader";
import { GameEmpty, GamePanel } from "../components/shared/GameKit";
import { ChainLobby, chainPhases } from "../components/chain/ChainLobby";
import { ChainRound, ChainWrite } from "../components/chain/ChainRound";
import { ChainGameOver } from "../components/chain/ChainGameOver";
import { InSessionModal } from "../components/shared/InSessionModal";
import { LobbyVisibilityToggle } from "../components/shared/LobbyVisibilityToggle";
import { SpectatorOverlay } from "../components/shared/SpectatorOverlay";
import { showToast } from "../lib/toast";
import { useIsMobile } from "../hooks/useIsMobile";
import { MobileChainReactionPage } from "../mobile/pages/MobileChainReactionPage";
import { useChainReactionGame } from "../hooks/useChainReactionGame";

/**
 * Chain Reaction, assembled out of the game kit. Every phase is a component
 * with its own states, all of them visible at /dev/chain, so this file is only
 * the wiring: who you are in the duel, and which mutator a button reaches for.
 */
function ChainReactionPageDesktop({ sessionId }: { sessionId: string }) {
  /* Both held while a mutator is in the air, so neither button can be pressed
     twice into two of the same thing. */
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    zero, navigate, gameId, game, isHost, inGame, isSpectator, opponentId,
    sessionById,
    editingIndex, setEditingIndex, guess, setGuess,
    submissionWords, setSubmissionWords, hasSubmitted, submissionFirstInputRef,
    viewingTarget, setViewingTarget,
    activeGameType,
    showInSessionModal, setShowInSessionModal,
    joiningFromOtherGame, confirmLeaveAndJoin,
    myChain, oppChain, viewingLiveDraft,
    myDone, oppDone,
    myScore, opponentScore, myName, oppName,
    myProgress, myTotal, oppProgress, oppTotal,
    handleSlotClick, handleInlineGuess, handleHint, giveUp, handleNavigate,
    submitChain, handleJoinClick,
  } = useChainReactionGame(sessionId);

  if (!game) {
    return (
      <div className="game-page">
        <GamePanel>
          <GameEmpty title="No game here" hint="Taking you home…" />
        </GamePanel>
      </div>
    );
  }

  const bank = game.settings.category
    ? chainCategoryLabels[game.settings.category] ?? game.settings.category
    : null;

  /* The two of you, as every part of the kit wants you. Built once rather than
     at each call, since the lobby, the round and the end screen are all asking
     the same question. */
  const you = { sessionId, name: myName, score: myScore };
  const them = { sessionId: opponentId ?? "", name: oppName, score: opponentScore };

  const stopEditing = () => {
    setEditingIndex(null);
    setGuess("");
  };

  return (
    <div className="game-page" data-game-theme="chain">
      <GameShellHeader
        collapsible
        game="chain"
        title="Chain Reaction"
        phases={chainPhases(game.settings.chainMode)}
        phase={game.phase}
        code={game.code}
        endsAt={game.settings.phaseEndsAt}
        isHost={isHost}
        isSpectator={isSpectator}
        {...(game.phase !== "lobby"
          ? { round: { current: game.settings.currentRound, total: game.settings.rounds } }
          : {})}
        {...(bank ? { pills: <ShellPill icon={<FiBookOpen />} tooltip="Which word bank the chains come from">{bank}</ShellPill> } : {})}
      />

      {game.phase === "lobby" && (
        <ChainLobby
          players={game.players}
          sessionId={sessionId}
          hostId={game.host_id}
          sessionById={sessionById}
          settings={game.settings}
          isHost={isHost}
          inGame={inGame}
          isSpectator={isSpectator}
          starting={starting}
          onStart={() => {
            setStarting(true);
            void optimistic(zero.mutate(mutators.chainReaction.start({ gameId, hostId: sessionId })))
              .catch((error) => showToast(error instanceof Error ? error.message : "Couldn't start the duel", "error"))
              .finally(() => setStarting(false));
          }}
          onLeave={() => {
            void optimistic(zero.mutate(mutators.chainReaction.leave({ gameId, sessionId })))
              .then(() => navigate("/"))
              .catch((error) => showToast(error instanceof Error ? error.message : "Couldn't leave", "error"));
          }}
          onJoin={handleJoinClick}
          {...(isHost
            ? {
                onKick: (targetId: string) =>
                  void zero.mutate(mutators.chainReaction.kick({ gameId, hostId: sessionId, targetId }))
                    .client.catch(() => showToast("Couldn't remove them", "error")),
                actions: <LobbyVisibilityToggle gameType="chain_reaction" gameId={gameId} sessionId={sessionId} isPublic={game.is_public} />,
              }
            : {})}
        />
      )}

      {isSpectator && game.phase !== "lobby" && (
        <SpectatorOverlay
          playerCount={game.players.length}
          phase={game.phase}
          onLeave={() => void zero.mutate(mutators.chainReaction.leaveSpectator({ gameId, sessionId })).client.then(() => navigate("/"))}
        />
      )}

      {!isSpectator && game.phase === "submitting" && (
        inGame ? (
          <ChainWrite
            /* Locked in, the boxes show what you actually handed over rather
               than whatever is still sitting in local state. */
            words={hasSubmitted ? game.submitted_chains[sessionId] ?? submissionWords : submissionWords}
            firstInputRef={submissionFirstInputRef}
            {...(game.settings.category ? { category: game.settings.category } : {})}
            {...(hasSubmitted ? { locked: true, waitingOn: oppName } : {})}
            submitting={submitting}
            onChange={(index, value) =>
              setSubmissionWords((words) => words.map((word, i) => (i === index ? value : word)))
            }
            onSubmit={(event) => {
              setSubmitting(true);
              void submitChain(event).finally(() => setSubmitting(false));
            }}
          />
        ) : (
          <GamePanel>
            <GameEmpty icon={<FiClock />} title="They are writing their chains" hint="The duel starts the moment both are in." />
          </GamePanel>
        )
      )}

      {!isSpectator && game.phase === "playing" && (
        inGame ? (
          <ChainRound
            you={{ ...you, progress: myProgress, total: myTotal, ...(myDone ? { done: true } : {}) }}
            them={{ ...them, progress: oppProgress, total: oppTotal, ...(oppDone ? { done: true } : {}) }}
            yourLinks={myChain}
            theirLinks={oppChain}
            viewing={viewingTarget === "self" ? sessionId : them.sessionId}
            editing={editingIndex}
            guess={guess}
            draft={viewingLiveDraft}
            names={sessionById}
            onView={(id) => {
              setViewingTarget(id === sessionId ? "self" : "opponent");
              stopEditing();
            }}
            onSelect={handleSlotClick}
            onChange={setGuess}
            onGuess={() => void handleInlineGuess()}
            onNavigate={handleNavigate}
            onCancel={stopEditing}
            onHint={(index) => void handleHint(index)}
            onSkip={(index) => void giveUp(index)}
          />
        ) : (
          <GamePanel>
            <GameEmpty icon={<FiEye />} title="The duel is under way" hint="Two chains, both being cracked at once." />
          </GamePanel>
        )
      )}

      {!isSpectator && game.phase === "finished" && (
        <ChainGameOver
          you={you}
          them={them}
          rounds={game.round_history}
          names={sessionById}
          isHost={isHost}
          onPlayAgain={() =>
            void zero.mutate(mutators.chainReaction.resetToLobby({ gameId, hostId: sessionId }))
              .client.catch(() => showToast("Couldn't run it back", "error"))
          }
          onEnd={() => {
            void zero.mutate(mutators.chainReaction.endGame({ gameId, hostId: sessionId }))
              .client.then(() => navigate("/"))
              .catch(() => showToast("Couldn't end game", "error"));
          }}
          onHome={() => navigate("/")}
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

export function ChainReactionPage({ sessionId }: { sessionId: string }) {
  const isMobile = useIsMobile();
  if (isMobile) return <MobileChainReactionPage sessionId={sessionId} />;
  return <ChainReactionPageDesktop sessionId={sessionId} />;
}
