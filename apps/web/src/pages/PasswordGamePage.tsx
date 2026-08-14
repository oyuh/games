import { mutators, passwordCategoryLabels } from "@games/shared";
import "../styles/game-shared.css";
import { Link, Navigate } from "react-router-dom";
import { FiBookOpen } from "react-icons/fi";
import { GameShellHeader, ShellPill } from "../components/shared/GameShellHeader";
import { GameActions, GameButton, GameEmpty, GamePanel } from "../components/shared/GameKit";
import { PASSWORD_PHASES } from "../components/password/PasswordLobby";
import { PasswordRound, PasswordScoreboard, type PasswordTaken } from "../components/password/PasswordRound";
import { SpectatorOverlay } from "../components/shared/SpectatorOverlay";
import { showToast } from "../lib/toast";
import { useIsMobile } from "../hooks/useIsMobile";
import { MobilePasswordGamePage } from "../mobile/pages/MobilePasswordGamePage";
import { usePasswordGame } from "../hooks/usePasswordGame";

/**
 * Password mid-game, assembled out of the game kit. Every part of the round is
 * a component with its own states, all of them at /dev/password, so this file
 * only decides which end of the exchange you are on and which mutator a box
 * reaches for.
 */
function PasswordGamePageDesktop({ sessionId }: { sessionId: string }) {
  const {
    zero, gameId, game, isHost, names,
    myTeamIndex, myActiveRound, isSpectator, liveEntries,
    clue, guess, handleClueChange, handleGuessChange,
    submitClue, submitGuess, skipWord,
    myTeamSkips, activeRoundView, roundsForView, retryWordLoad,
    navigate,
  } = usePasswordGame(sessionId);

  if (!game) {
    return (
      <div className="game-page">
        <GamePanel>
          <GameEmpty title="No game here" hint="Taking you home…" />
        </GamePanel>
      </div>
    );
  }

  /* The lobby lives on its own route. Anyone who lands here before the host
     has started, by link or by back button, belongs there rather than on a
     page with nothing on it. */
  if (game.phase === "lobby") return <Navigate to={`/password/${game.id}/begin`} replace />;

  const myTeam = myTeamIndex >= 0 ? game.teams[myTeamIndex] : undefined;
  const guessing = activeRoundView?.guesserId === sessionId;
  /* A spectator reads the room and does nothing in it, same as somebody
     whose team never got a round. */
  const playing = Boolean(activeRoundView && myTeam && !isSpectator);
  const bank = game.settings.category
    ? passwordCategoryLabels[game.settings.category] ?? game.settings.category
    : null;

  /* Who is guessing for each team right now, so every card can name the one
     player on it who has to produce the word. */
  const guessers = Object.fromEntries(
    game.active_rounds.flatMap((round) => {
      const team = game.teams[round.teamIndex];
      return team ? [[team.name, round.guesserId] as const] : [];
    })
  );

  /* Words your own team has already taken. Everybody else's are their
     business until the end screen. */
  const taken: PasswordTaken[] = roundsForView
    .filter((round) => round.teamIndex === myTeamIndex)
    .map((round) => ({
      roundId: round.roundId,
      word: round.word,
      guesserId: round.guesserId,
      guessCount: round.guessCount,
      points: round.points,
    }));

  return (
    <div className="game-page" data-game-theme="password">
      <GameShellHeader
        collapsible
        game="password"
        title="Password"
        phases={PASSWORD_PHASES}
        phase={game.phase}
        endsAt={game.settings.roundEndsAt}
        duration={game.settings.roundDurationSec}
        code={game.code}
        isHost={isHost}
        isSpectator={isSpectator}
        {...(bank ? { pills: <ShellPill icon={<FiBookOpen />} tooltip="Which word bank this game is drawing from">{bank}</ShellPill> } : {})}
      />

      {game.phase === "playing" && playing && activeRoundView && myTeam && (
        <PasswordRound
          role={guessing ? "guess" : "clue"}
          word={activeRoundView.word}
          category={game.settings.category ?? null}
          teamMembers={myTeam.members}
          guesserId={activeRoundView.guesserId}
          clues={activeRoundView.clues}
          guesses={activeRoundView.guesses}
          drafts={liveEntries}
          taken={taken}
          names={names}
          sessionId={sessionId}
          value={guessing ? guess : clue}
          skipsRemaining={myTeamSkips}
          teams={game.teams}
          scores={game.scores}
          targetScore={game.settings.targetScore}
          guessers={guessers}
          onChange={guessing ? handleGuessChange : handleClueChange}
          onSubmit={guessing ? submitGuess : submitClue}
          onSkip={() => void skipWord()}
          onRetryWord={retryWordLoad}
        />
      )}

      {/* No round of your own: spectating, or on a team too short to be given
          one. Either way the scoreboard is the whole story. */}
      {game.phase === "playing" && !playing && (
        <>
          <GamePanel>
            <GameEmpty
              title={isSpectator ? "You are watching this one" : "Your team is not racing"}
              hint={
                isSpectator
                  ? "Every team is on a different word right now. The scores move as they land them."
                  : "A team needs two to play, one to clue and one to guess."
              }
            />
          </GamePanel>

          <PasswordScoreboard
            teams={game.teams}
            scores={game.scores}
            targetScore={game.settings.targetScore}
            guessers={guessers}
            names={names}
            sessionId={sessionId}
          />
        </>
      )}

      {/* The hook sends everybody to the results route the moment the phase
          turns, so this is only ever up for a frame. It still says something
          rather than flashing an empty page. */}
      {game.phase === "results" && (
        <GameActions hint="Somebody hit the target.">
          <Link to={`/password/${game.id}/results`}>
            <GameButton variant="primary">See how it went</GameButton>
          </Link>
        </GameActions>
      )}

      {isSpectator && (
        <SpectatorOverlay
          playerCount={game.teams.reduce((n, t) => n + t.members.length, 0)}
          phase={game.phase}
          onLeave={() =>
            void zero.mutate(mutators.password.leaveSpectator({ gameId, sessionId }))
              .client.then(() => navigate("/"))
              .catch(() => showToast("Couldn't stop spectating", "error"))
          }
        />
      )}
    </div>
  );
}

export function PasswordGamePage({ sessionId }: { sessionId: string }) {
  const isMobile = useIsMobile();
  if (isMobile) return <MobilePasswordGamePage sessionId={sessionId} />;
  return <PasswordGamePageDesktop sessionId={sessionId} />;
}
