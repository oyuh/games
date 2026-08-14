import { mutators, passwordCategoryLabels } from "@games/shared";
import { optimistic } from "../lib/zero";
import "../styles/game-shared.css";
import { useState } from "react";
import { FiBookOpen } from "react-icons/fi";
import { GameShellHeader, ShellPill } from "../components/shared/GameShellHeader";
import { GameEmpty, GamePanel } from "../components/shared/GameKit";
import { PASSWORD_PHASES, PasswordLobby } from "../components/password/PasswordLobby";
import { InSessionModal } from "../components/shared/InSessionModal";
import { LobbyVisibilityToggle } from "../components/shared/LobbyVisibilityToggle";
import { ensureName, leaveCurrentGame } from "../lib/session";
import { showToast } from "../lib/toast";
import { useIsMobile } from "../hooks/useIsMobile";
import { MobilePasswordBeginPage } from "../mobile/pages/MobilePasswordBeginPage";
import { PasswordDemo } from "../components/demos/PasswordDemo";
import { usePasswordBegin } from "../hooks/usePasswordBegin";

/**
 * Password's lobby, assembled out of the game kit. Every state of it is a
 * component with its own states, all of them visible at /dev/password, so this
 * file is only the wiring: who you are in the room, and which mutator a button
 * reaches for.
 */
function PasswordBeginPageDesktop({ sessionId }: { sessionId: string }) {
  const {
    zero, navigate, gameId, game, names, isHost,
    inGame, isSpectator, activeGameType, activeGameId, inAnotherGame,
    startingGame, startGame,
    showInSessionModal, setShowInSessionModal,
    joiningFromOtherGame, setJoiningFromOtherGame,
  } = usePasswordBegin(sessionId);
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

  const joinGame = async () => {
    await ensureName(zero, sessionId);
    if (isSpectator) {
      void zero.mutate(mutators.password.leaveSpectator({ gameId, sessionId }))
        .client.then(() => zero.mutate(mutators.password.join({ gameId, sessionId })))
        .catch(() => showToast("Couldn't join game", "error"));
      return;
    }
    void zero.mutate(mutators.password.join({ gameId, sessionId }))
      .client.catch(() => showToast("Couldn't join game", "error"));
  };

  const handleJoinClick = () => {
    if (inAnotherGame && activeGameType && activeGameId) {
      setJoiningFromOtherGame(true);
      void leaveCurrentGame(zero, sessionId, activeGameType, activeGameId)
        .catch(() => showToast("Couldn't leave current game", "error"))
        .finally(() => {
          setJoiningFromOtherGame(false);
          void joinGame();
        });
      return;
    }
    void joinGame();
  };

  const confirmLeaveAndJoin = () => {
    if (!activeGameType || !activeGameId) {
      setShowInSessionModal(false);
      void joinGame();
      return;
    }
    setJoiningFromOtherGame(true);
    void leaveCurrentGame(zero, sessionId, activeGameType, activeGameId)
      .then(() => {
        setShowInSessionModal(false);
        void joinGame();
      })
      .catch(() => showToast("Couldn't leave current game", "error"))
      .finally(() => setJoiningFromOtherGame(false));
  };

  const bank = game.settings.category
    ? passwordCategoryLabels[game.settings.category] ?? game.settings.category
    : null;

  return (
    <div className="game-page" data-game-theme="password">
      <GameShellHeader
        collapsible
        game="password"
        title="Password"
        phases={PASSWORD_PHASES}
        phase={game.phase}
        code={game.code}
        isHost={isHost}
        isSpectator={isSpectator}
        {...(bank ? { pills: <ShellPill icon={<FiBookOpen />} tooltip="Which word bank this game is drawing from">{bank}</ShellPill> } : {})}
      />

      <PasswordLobby
        teams={game.teams}
        sessionId={sessionId}
        hostId={game.host_id}
        names={names}
        settings={game.settings}
        isHost={isHost}
        inGame={inGame}
        isSpectator={isSpectator}
        starting={startingGame}
        onStart={() => void startGame()}
        onLeave={() => {
          void optimistic(zero.mutate(mutators.password.leave({ gameId, sessionId })))
            .catch((error) => showToast(error instanceof Error ? error.message : "Couldn't leave game", "error"));
        }}
        onJoin={handleJoinClick}
        onJoinTeam={(teamName) =>
          void zero.mutate(mutators.password.switchTeam({ gameId, sessionId, teamName }))
            .client.catch(() => showToast("Couldn't switch team", "error"))
        }
        {...(isHost
          ? {
              onMovePlayer: (playerId: string, teamName: string) =>
                void zero.mutate(mutators.password.movePlayer({ gameId, hostId: sessionId, playerId, teamName }))
                  .client.catch(() => showToast("Couldn't move player", "error")),
              onToggleLock: () =>
                void zero.mutate(mutators.password.lockTeams({ gameId, hostId: sessionId, locked: !game.settings.teamsLocked }))
                  .client.catch(() => showToast("Couldn't lock the teams", "error")),
              actions: <LobbyVisibilityToggle gameType="password" gameId={gameId} sessionId={sessionId} isPublic={game.is_public} />,
            }
          : {})}
      />

      {showDemo && <PasswordDemo onClose={() => setShowDemo(false)} />}

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

export function PasswordBeginPage({ sessionId }: { sessionId: string }) {
  const isMobile = useIsMobile();
  if (isMobile) return <MobilePasswordBeginPage sessionId={sessionId} />;
  return <PasswordBeginPageDesktop sessionId={sessionId} />;
}
