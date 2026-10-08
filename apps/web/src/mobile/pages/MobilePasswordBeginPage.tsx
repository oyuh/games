import { mutators, passwordCategoryLabels } from "@games/shared";
import { useEffect, useRef } from "react";
import { FiBookOpen } from "react-icons/fi";
import { GameShellHeader, ShellPill } from "../../components/shared/GameShellHeader";
import { PASSWORD_PHASES, PasswordLobby } from "../../components/password/PasswordLobby";
import { InSessionModal } from "../../components/shared/InSessionModal";
import { LobbyVisibilityToggle } from "../../components/shared/LobbyVisibilityToggle";
import { usePasswordBegin } from "../../hooks/usePasswordBegin";
import { getPasswordPlayerName } from "../../lib/password-names";
import { useMobileHostRegister } from "../../lib/mobile-host-context";
import { showToast } from "../../lib/toast";
import { optimistic } from "../../lib/zero";
import { PageLoading } from "../../components/shared/PageLoading";
import "../../styles/game-shared.css";
import { roomStats } from "../../lib/host-room";

/** Password's lobby on a phone: the desktop lobby component, one column. */
export function MobilePasswordBeginPage({ sessionId }: { sessionId: string }) {
  const {
    zero, gameId, game, names, isHost,
    inGame, isSpectator, activeGameType,
    startingGame, startGame,
    showInSessionModal, setShowInSessionModal,
    joiningFromOtherGame, handleJoinClick, confirmLeaveAndJoin,
  } = usePasswordBegin(sessionId);

  /* Leaving the lobby as a spectator drops the spectator slot. The ref keeps
     the unmount cleanup from closing over a stale value, and the half-second
     arm keeps StrictMode's mount-unmount-mount from firing it. */
  const isSpectatorRef = useRef(false);
  useEffect(() => {
    isSpectatorRef.current = isSpectator;
  }, [isSpectator]);

  useEffect(() => {
    let armed = false;
    const timer = setTimeout(() => { armed = true; }, 500);
    return () => {
      clearTimeout(timer);
      if (armed && isSpectatorRef.current) {
        void zero.mutate(mutators.password.leaveSpectator({ gameId, sessionId }));
      }
    };
  }, [gameId, sessionId, zero]);

  useMobileHostRegister(
    isHost && game
      ? {
          type: "password", gameId, hostId: game.host_id, isPublic: game.is_public, ...roomStats(game),
          players: game.teams.flatMap((t) => t.members.map((id) => ({ id, name: getPasswordPlayerName(names, id) }))),
          spectators: game.spectators ?? [],
        }
      : null
  );

  if (!game) return <PageLoading />;

  const bank = game.settings.category
    ? passwordCategoryLabels[game.settings.category] ?? game.settings.category
    : null;

  return (
    <div className="game-page m-game" data-game-theme="password">
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
        onSettingsChange={(settings) => void zero.mutate(mutators.password.updateSettings({ gameId, hostId: sessionId, settings }))
          .client.catch(() => showToast("Couldn't change that setting", "error"))}
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
