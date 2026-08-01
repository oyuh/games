import { mutators } from "@games/shared";
import "../styles/game-shared.css";
import "../styles/password.css";
import { Link } from "react-router-dom";
import { PasswordActiveRound } from "../components/password/PasswordActiveRound";
import { PasswordHeader } from "../components/password/PasswordHeader";
import { PasswordRoundsTable } from "../components/password/PasswordRoundsTable";
import { PasswordTeamGrid } from "../components/password/PasswordTeamGrid";
import { SpectatorOverlay } from "../components/shared/SpectatorOverlay";
import { showToast } from "../lib/toast";
import { useIsMobile } from "../hooks/useIsMobile";
import { MobilePasswordGamePage } from "../mobile/pages/MobilePasswordGamePage";
import { usePasswordGame } from "../hooks/usePasswordGame";

function PasswordGamePageDesktop({ sessionId }: { sessionId: string }) {

  const {
    zero, gameId, game, isHost, names,
    myTeamIndex, myActiveRound, isSpectator, liveEntries,
    clue, guess, handleClueChange, handleGuessChange,
    submitClue, submitGuess, skipWord,
    myTeamMembers, myTeamSkips, gameProgress, activeRoundView, roundsForView, retryWordLoad,
    navigate,
  } = usePasswordGame(sessionId);

  if (!game) {
    return (
      <div className="game-page">
        <div className="game-empty">
          <p className="game-empty-title">Game not found</p>
          <p className="game-empty-sub">Redirecting home…</p>
          <button className="btn btn-primary" onClick={() => navigate("/")}>Go Home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="game-page" data-game-theme="password">
      <PasswordHeader
        title="Password"
        code={game.code}
        phase={game.phase}
        currentRound={game.current_round}
        endsAt={game.settings.roundEndsAt}
        isHost={isHost}
        category={game.settings.category ?? null}
        isSpectator={isSpectator}
      />

      <PasswordTeamGrid
        teams={game.teams}
        scores={game.scores}
        names={names}
        activeTeamIndex={undefined}
        sessionId={sessionId}
        showScores
        targetScore={game.settings.targetScore}
      />

      {isSpectator && (
        <SpectatorOverlay
          playerCount={game.teams.reduce((n, t) => n + t.members.length, 0)}
          phase={game.phase}
          onLeave={() => void zero.mutate(mutators.password.leaveSpectator({ gameId, sessionId })).client.then(() => navigate("/"))}
        />
      )}

      {!isSpectator && game.phase === "playing" && activeRoundView && (
        <PasswordActiveRound
          activeRound={activeRoundView}
          names={names}
          sessionId={sessionId}
          teamMembers={myTeamMembers}
          clue={clue}
          guess={guess}
          liveEntries={liveEntries}
          skipsRemaining={myTeamSkips}
          gameProgress={gameProgress}
          onClueChange={handleClueChange}
          onGuessChange={handleGuessChange}
          onSubmitClue={submitClue}
          onSubmitGuess={submitGuess}
          onSkip={skipWord}
          onRetryWordLoad={retryWordLoad}
        />
      )}

      {!isSpectator && game.phase === "playing" && !myActiveRound && (
        <div className="game-section">
          <div className="game-waiting">
            <div className="game-waiting-pulse" />
            <p>All teams are racing! Watch the scores update in real time.</p>
          </div>
        </div>
      )}

      {!isSpectator && game.phase === "results" && (
        <div className="game-section">
          <div className="game-reveal-card game-reveal-card--success">
            <p className="game-reveal-title">Game Over!</p>
            <p className="game-reveal-sub">Check the results to see who won.</p>
          </div>
          <div className="game-actions">
            <Link to={`/password/${game.id}/results`} className="btn btn-primary game-action-btn">
              View Results
            </Link>
          </div>
        </div>
      )}

      <PasswordRoundsTable rounds={roundsForView} teams={game.teams} names={names} />
    </div>
  );
}

export function PasswordGamePage({ sessionId }: { sessionId: string }) {
  const isMobile = useIsMobile();
  if (isMobile) return <MobilePasswordGamePage sessionId={sessionId} />;
  return <PasswordGamePageDesktop sessionId={sessionId} />;
}
