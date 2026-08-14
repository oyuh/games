import { mutators, passwordCategoryLabels } from "@games/shared";
import "../styles/game-shared.css";
import { FiBookOpen } from "react-icons/fi";
import { GameShellHeader, ShellPill } from "../components/shared/GameShellHeader";
import { GameEmpty, GamePanel } from "../components/shared/GameKit";
import { PASSWORD_PHASES } from "../components/password/PasswordLobby";
import { PasswordGameOver } from "../components/password/PasswordGameOver";
import { showToast } from "../lib/toast";
import { useIsMobile } from "../hooks/useIsMobile";
import { MobilePasswordResultsPage } from "../mobile/pages/MobilePasswordResultsPage";
import { usePasswordResults } from "../hooks/usePasswordResults";

/**
 * The end of a password game. The screen is one component with every ending in
 * it at /dev/password, so this file is the wiring: the finished game's rows,
 * decrypted, and the three buttons the host or anyone else gets.
 */
function PasswordResultsPageDesktop({ sessionId }: { sessionId: string }) {
  const { zero, gameId, game, names, navigate, isHost, roundsForView } = usePasswordResults(sessionId);

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
    ? passwordCategoryLabels[game.settings.category] ?? game.settings.category
    : null;

  return (
    <div className="game-page" data-game-theme="password">
      <GameShellHeader
        game="password"
        title="Password"
        phases={PASSWORD_PHASES}
        phase={game.phase}
        code={game.code}
        isHost={isHost}
        {...(bank ? { pills: <ShellPill icon={<FiBookOpen />} tooltip="Which word bank this game was drawing from">{bank}</ShellPill> } : {})}
      />

      <PasswordGameOver
        teams={game.teams}
        scores={game.scores}
        targetScore={game.settings.targetScore}
        /* The stored words are encrypted, so the hook hands over readable
           ones and this only reshapes them. */
        rounds={roundsForView.map((round) => ({
          roundId: round.roundId ?? `legacy-${round.round}-${round.teamIndex}`,
          round: round.round,
          teamIndex: round.teamIndex,
          guesserId: round.guesserId,
          word: round.word,
          clues: round.clues ?? [],
          guesses: round.guesses ?? [],
          guessCount: round.guessCount ?? round.guesses?.length ?? 0,
          points: round.points ?? 1,
        }))}
        names={names}
        sessionId={sessionId}
        hostId={game.host_id}
        isHost={isHost}
        onPlayAgain={() => {
          void zero.mutate(mutators.password.resetToLobby({ gameId, hostId: sessionId }))
            .client.then(() => navigate(`/password/${game.id}/begin`))
            .catch(() => showToast("Couldn't start another one", "error"));
        }}
        onEnd={() => {
          void zero.mutate(mutators.password.endGame({ gameId, hostId: sessionId }))
            .client.then(() => navigate("/"))
            .catch(() => showToast("Couldn't end game", "error"));
        }}
        onHome={() => navigate("/")}
      />
    </div>
  );
}

export function PasswordResultsPage({ sessionId }: { sessionId: string }) {
  const isMobile = useIsMobile();
  if (isMobile) return <MobilePasswordResultsPage sessionId={sessionId} />;
  return <PasswordResultsPageDesktop sessionId={sessionId} />;
}
