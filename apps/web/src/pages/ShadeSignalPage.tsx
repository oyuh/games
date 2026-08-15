import { mutators } from "@games/shared";
import { optimistic } from "../lib/zero";
import "../styles/game-shared.css";
/* The old sheet. Nothing on this page reaches for it any more, but the mobile
   page below still draws its own markup and has not moved onto the kit yet. */
import "../styles/shade-signal.css";
import { useState } from "react";
import { FiClock, FiEye } from "react-icons/fi";

import { GameShellHeader } from "../components/shared/GameShellHeader";
import { GameEmpty, GamePanel } from "../components/shared/GameKit";
import { ShadeLobby, shadePhases } from "../components/shade/ShadeLobby";
import { ShadeClue, ShadePick } from "../components/shade/ShadeClue";
import { ShadeGuess } from "../components/shade/ShadeGuess";
import { ShadeResult, shadeFinalGuesses } from "../components/shade/ShadeResult";
import { ShadeGameOver } from "../components/shade/ShadeGameOver";
import { InSessionModal } from "../components/shared/InSessionModal";
import { LobbyVisibilityToggle } from "../components/shared/LobbyVisibilityToggle";
import { SpectatorOverlay } from "../components/shared/SpectatorOverlay";
import { getDisplayName } from "../lib/session";
import { showToast } from "../lib/toast";
import { useIsMobile } from "../hooks/useIsMobile";
import { callGameSecretInit } from "../lib/game-secrets";

import { MobileShadeSignalPage } from "../mobile/pages/MobileShadeSignalPage";
import { useShadeSignalGame } from "../hooks/useShadeSignalGame";

/**
 * Shade Signal, assembled out of the game kit. Every phase is a component with
 * its own states, all of them visible at /dev/shade, so this file is only the
 * wiring: who you are this round, and which mutator a button reaches for.
 */
function ShadeSignalPageDesktop({ sessionId }: { sessionId: string }) {
  /* Held while a mutator is in the air, so nothing can be pressed twice into
     two of the same thing. */
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  const [locking, setLocking] = useState(false);

  /* The leader's cell before they confirm it. Local because nobody else has
     any business knowing what they are hovering over. */
  const [picking, setPicking] = useState<{ row: number; col: number } | null>(null);

  const {
    zero, navigate, gameId, game, isHost, isLeader, inGame, isSpectator,
    sessionById, phase, target,
    clue, setClue, selectedCell, setSelectedCell,
    guessLocked, setGuessLocked,
    activeGameType,
    showInSessionModal, setShowInSessionModal,
    joiningFromOtherGame, confirmLeaveAndJoin,
    myCurrentGuess, currentRoundGuesses,
    leaderName, totalRounds, guessersCount, latestRound,
    submitClue, submitGuess, handleJoinClick,
  } = useShadeSignalGame(sessionId);

  if (!game) {
    return (
      <div className="game-page">
        <GamePanel>
          <GameEmpty title="No game here" hint="Taking you home…" />
        </GamePanel>
      </div>
    );
  }

  const grid = { rows: game.grid_rows, cols: game.grid_cols, seed: game.grid_seed };
  const leader = { sessionId: game.leader_id ?? "", name: leaderName };
  const nameOf = (id: string, fallback: string | null = null) => sessionById[id] ?? getDisplayName(fallback, id);

  const clueRound = phase === "clue1" ? 1 : 2;
  const guessRound = phase === "guess1" ? 1 : 2;
  const lastRound = game.settings.currentRound >= totalRounds;

  /* Where the room went on the first clue. The leader writing a second one is
     the only person who gets these, and they are the reason it exists. */
  const guess1Markers = game.guesses
    .filter((g) => g.round === 1)
    .map((g) => ({ sessionId: g.sessionId, name: nameOf(g.sessionId), row: g.row, col: g.col }));

  /* Where you went on the first clue, so the second one can offer to leave you
     there rather than making you find it again. */
  const myFirstGuess = game.guesses.find((g) => g.sessionId === sessionId && g.round === 1);

  const held = selectedCell ?? (myCurrentGuess ? { row: myCurrentGuess.row, col: myCurrentGuess.col } : null);

  /* Two phases hand out the same shape, so it is built once. The mutator scores
     the second guess if there is one, and so does this. */
  const finals = shadeFinalGuesses(game.guesses);

  const lock = (cell: { row: number; col: number }) => {
    setLocking(true);
    void optimistic(zero.mutate(mutators.shadeSignal.submitGuess({ gameId, sessionId, row: cell.row, col: cell.col })))
      .then(() => setGuessLocked(true))
      .catch((error) => showToast(error instanceof Error ? error.message : "Couldn't lock that in", "error"))
      .finally(() => setLocking(false));
  };

  return (
    <div className="game-page" data-game-theme="shade">
      <GameShellHeader
        collapsible
        game="shade"
        title="Shade Signal"
        phases={shadePhases(game.settings.leaderPick)}
        phase={game.phase}
        code={game.code}
        endsAt={game.settings.phaseEndsAt}
        isHost={isHost}
        isSpectator={isSpectator}
        {...(phase === "clue1" || phase === "clue2" ? { duration: game.settings.clueDurationSec } : {})}
        {...(phase === "guess1" || phase === "guess2" ? { duration: game.settings.guessDurationSec } : {})}
        {...(phase !== "lobby" && totalRounds > 0
          ? { round: { current: game.settings.currentRound, total: totalRounds } }
          : {})}
      />

      {phase === "lobby" && (
        <ShadeLobby
          players={game.players}
          sessionId={sessionId}
          hostId={game.host_id}
          sessionById={sessionById}
          settings={game.settings}
          grid={grid}
          isHost={isHost}
          inGame={inGame}
          isSpectator={isSpectator}
          starting={starting}
          onStart={() => {
            setStarting(true);
            void optimistic(zero.mutate(mutators.shadeSignal.start({ gameId, hostId: sessionId })))
              .catch((error) => showToast(error instanceof Error ? error.message : "Couldn't start the round", "error"))
              .finally(() => setStarting(false));
          }}
          onLeave={() => {
            void optimistic(zero.mutate(mutators.shadeSignal.leave({ gameId, sessionId })))
              .then(() => navigate("/"))
              .catch((error) => showToast(error instanceof Error ? error.message : "Couldn't leave", "error"));
          }}
          onJoin={handleJoinClick}
          {...(isHost
            ? {
                onKick: (targetId: string) =>
                  void zero.mutate(mutators.shadeSignal.kick({ gameId, hostId: sessionId, targetId }))
                    .client.catch(() => showToast("Couldn't remove them", "error")),
                actions: <LobbyVisibilityToggle gameType="shade_signal" gameId={gameId} sessionId={sessionId} isPublic={game.is_public} />,
              }
            : {})}
        />
      )}

      {isSpectator && phase !== "lobby" && (
        <SpectatorOverlay
          playerCount={game.players.length}
          phase={phase}
          onLeave={() => void zero.mutate(mutators.shadeSignal.leaveSpectator({ gameId, sessionId })).client.then(() => navigate("/"))}
        />
      )}

      {!isSpectator && phase === "picking" && (
        <ShadePick
          grid={grid}
          isLeader={isLeader}
          leader={leader}
          picked={picking}
          submitting={sending}
          onPick={setPicking}
          onConfirm={() => {
            if (!picking) return;
            setSending(true);
            void zero.mutate(mutators.shadeSignal.setTarget({ gameId, sessionId, row: picking.row, col: picking.col }))
              .server.then(() => callGameSecretInit("shade_signal", gameId, sessionId))
              .catch((error) => showToast(error instanceof Error ? error.message : "Couldn't set that", "error"))
              .finally(() => { setSending(false); setPicking(null); });
          }}
        />
      )}

      {!isSpectator && (phase === "clue1" || phase === "clue2") && (
        <ShadeClue
          round={clueRound}
          grid={grid}
          isLeader={isLeader}
          leader={leader}
          /* Only the leader is handed the answer. */
          {...(isLeader ? { target } : {})}
          clue1={game.clue1}
          guesses={guess1Markers}
          hardMode={game.settings.hardMode}
          value={clue}
          submitting={sending}
          onChange={setClue}
          onSubmit={(event) => {
            setSending(true);
            void submitClue(event).finally(() => setSending(false));
          }}
        />
      )}

      {!isSpectator && (phase === "guess1" || phase === "guess2") && (
        <ShadeGuess
          round={guessRound}
          grid={grid}
          isGuessing={inGame && !isLeader}
          clue1={game.clue1}
          clue2={game.clue2}
          {...(isLeader ? { target } : {})}
          selected={held}
          locked={guessLocked}
          submitting={locking}
          {...(myFirstGuess ? { previous: { row: myFirstGuess.row, col: myFirstGuess.col } } : {})}
          lockedCount={currentRoundGuesses}
          guesserCount={guessersCount}
          onSelect={setSelectedCell}
          onLock={() => {
            setLocking(true);
            void submitGuess().finally(() => setLocking(false));
          }}
          onUnlock={() => {
            setGuessLocked(false);
            setSelectedCell(held);
          }}
          {...(myFirstGuess
            ? {
                onKeep: () => {
                  setSelectedCell({ row: myFirstGuess.row, col: myFirstGuess.col });
                  lock({ row: myFirstGuess.row, col: myFirstGuess.col });
                },
              }
            : {})}
        />
      )}

      {!isSpectator && phase === "reveal" && (
        target && latestRound ? (
          <ShadeResult
            grid={grid}
            target={target}
            clue1={game.clue1}
            clue2={game.clue2}
            last={lastRound}
            leader={{
              sessionId: leader.sessionId,
              name: leader.name,
              points: latestRound.leaderScore,
              ...(leader.sessionId === sessionId ? { you: true } : {}),
            }}
            players={game.players
              .filter((player) => player.sessionId !== game.leader_id)
              .map((player) => {
                const guess = finals.find((g) => g.sessionId === player.sessionId);

                return {
                  sessionId: player.sessionId,
                  name: nameOf(player.sessionId, player.name),
                  points: latestRound.scores[player.sessionId] ?? 0,
                  ...(guess ? { guess: { row: guess.row, col: guess.col } } : {}),
                  ...(player.sessionId === sessionId ? { you: true } : {}),
                };
              })}
          />
        ) : (
          <GamePanel>
            <GameEmpty icon={<FiClock />} title="Working out the scores" hint="The board comes back in a second with everybody on it." />
          </GamePanel>
        )
      )}

      {!isSpectator && phase === "finished" && (
        <ShadeGameOver
          grid={{ rows: game.grid_rows, cols: game.grid_cols }}
          isHost={isHost}
          players={game.players.map((player) => ({
            sessionId: player.sessionId,
            name: nameOf(player.sessionId, player.name),
            score: player.totalScore,
            ...(player.sessionId === sessionId ? { you: true } : {}),
          }))}
          rounds={game.round_history.map((round) => ({
            round: round.round,
            leaderId: round.leaderId,
            target: round.target,
            seed: round.seed,
            clue1: round.clue1,
            clue2: round.clue2,
            guesses: shadeFinalGuesses(round.guesses),
            scores: round.scores,
            leaderScore: round.leaderScore,
          }))}
          onPlayAgain={() =>
            void zero.mutate(mutators.shadeSignal.resetToLobby({ gameId, hostId: sessionId }))
              .client.catch(() => showToast("Couldn't run it back", "error"))
          }
          onEnd={() => {
            void zero.mutate(mutators.shadeSignal.endGame({ gameId, hostId: sessionId }))
              .client.then(() => navigate("/"))
              .catch(() => showToast("Couldn't end game", "error"));
          }}
          onHome={() => navigate("/")}
        />
      )}

      {!isSpectator && !inGame && phase !== "lobby" && phase !== "finished" && phase !== "reveal" && (
        <GamePanel>
          <GameEmpty icon={<FiEye />} title="This round is under way" hint="You can watch it out, or join and you are in the next one." />
        </GamePanel>
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

export function ShadeSignalPage({ sessionId }: { sessionId: string }) {
  const isMobile = useIsMobile();
  if (isMobile) return <MobileShadeSignalPage sessionId={sessionId} />;
  return <ShadeSignalPageDesktop sessionId={sessionId} />;
}
