import { DEFAULT_IMPOSTER_CLUE_VISIBILITY, mutators } from "@games/shared";
import { optimistic, useQuery, useZero } from "../lib/zero";
import "../styles/game-shared.css";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiLogIn, FiHelpCircle } from "react-icons/fi";
import { ImposterClueSection } from "../components/imposter/ImposterClueSection";
import { ImposterHeader } from "../components/imposter/ImposterHeader";
import { ImposterLobbyActions } from "../components/imposter/ImposterLobbyActions";
import { ImposterPlayersCard } from "../components/imposter/ImposterPlayersCard";
import { ImposterResultsSection } from "../components/imposter/ImposterResultsSection";
import { ImposterVoteSection } from "../components/imposter/ImposterVoteSection";
import { InSessionModal } from "../components/shared/InSessionModal";
import { LobbyVisibilityToggle } from "../components/shared/LobbyVisibilityToggle";
import { SpectatorOverlay } from "../components/shared/SpectatorOverlay";
import { addRecentGame, ensureName, getDisplayName, leaveCurrentGame, SessionGameType } from "../lib/session";
import { showToast } from "../lib/toast";
import { useIsMobile } from "../hooks/useIsMobile";
import { MobileImposterPage } from "../mobile/pages/MobileImposterPage";
import { ImposterDemo } from "../components/demos/ImposterDemo";
import { callGameSecretInit, useGameSecret } from "../lib/game-secrets";
import { useGameSounds, playSoundSubmit } from "../hooks/useGameSounds";
import { playGameStart, playReveal } from "../lib/sounds";
import { useImposterGame } from "../hooks/useImposterGame";

function ImposterPageDesktop({ sessionId }: { sessionId: string }) {

  const {
    zero, navigate, gameId, game, me, isHost, inGame, isSpectator,
    sessionById, tally, visibleSecretWord, decryptedRoundWords,
    clue, setClue, voteTarget, setVoteTarget,
    activeGameType, activeGameId, inAnotherGame,
    showInSessionModal, setShowInSessionModal,
    joiningFromOtherGame, setJoiningFromOtherGame,
    submitClue, submitVote, handleJoinClick, confirmLeaveAndJoin,
  } = useImposterGame(sessionId);
  const [showDemo, setShowDemo] = useState(false);

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
    <div className="game-page" data-game-theme="imposter">
      <ImposterHeader
        code={game.code}
        phase={game.phase}
        currentRound={game.settings.currentRound}
        totalRounds={game.settings.rounds}
        phaseEndsAt={game.settings.phaseEndsAt}
        isHost={isHost}
        category={game.category}
        isSpectator={isSpectator}
      />

      <ImposterPlayersCard
        players={game.players}
        sessionId={sessionId}
        sessionById={sessionById}
        revealRoles={game.phase === "finished"}
        votedOutId={game.phase === "results" ? (() => {
          const t = game.votes.reduce<Record<string, number>>((acc, v) => { acc[v.targetId] = (acc[v.targetId] ?? 0) + 1; return acc; }, {});
          const max = Math.max(...Object.values(t), 0);
          return Object.entries(t).find(([, count]) => count === max && max > 0)?.[0] ?? null;
        })() : null}
      />

      {game.phase === "lobby" && !inGame && (
        <div className="game-section game-join-prompt">
          <p className="game-join-text">{isSpectator ? "You're spectating. Join to play!" : "You're not in this lobby yet."}</p>
          <button
            className="btn btn-primary game-action-btn"
            onClick={handleJoinClick}
          >
            <FiLogIn size={16} /> Join Game
          </button>
        </div>
      )}

      {game.phase === "lobby" && inGame && (
        <ImposterLobbyActions
          canStart={Boolean(isHost && game.players.length >= 3)}
          isHost={Boolean(isHost)}
          playerCount={game.players.length}
          onStart={() => void zero.mutate(mutators.imposter.start({ gameId, hostId: sessionId }))}
          onLeave={() => void zero.mutate(mutators.imposter.leave({ gameId, sessionId }))}
        >
          {isHost && <LobbyVisibilityToggle gameType="imposter" gameId={gameId} sessionId={sessionId} isPublic={game.is_public} />}
        </ImposterLobbyActions>
      )}

      {isSpectator && game.phase !== "lobby" && (
        <SpectatorOverlay
          playerCount={game.players.filter((p) => !p.eliminated).length}
          phase={game.phase}
          onLeave={() => void zero.mutate(mutators.imposter.leaveSpectator({ gameId, sessionId })).client.then(() => navigate("/"))}
        />
      )}

      {!isSpectator && game.phase === "playing" && inGame && !me?.eliminated && (() => {
        const activePlayers = game.players.filter((p) => !p.eliminated);
        return (
          <ImposterClueSection
            role={me?.role}
            secretWord={visibleSecretWord}
            category={game.category ?? null}
            clue={clue}
            clueCount={game.clues.length}
            playerCount={activePlayers.length}
            submitted={game.clues.some((c) => c.sessionId === sessionId)}
            clues={game.clues}
            sessionId={sessionId}
            sessionById={sessionById}
            clueVisibility={game.settings.clueVisibility ?? DEFAULT_IMPOSTER_CLUE_VISIBILITY}
            onClueChange={setClue}
            onSubmit={submitClue}
          />
        );
      })()}

      {!isSpectator && game.phase === "playing" && (!inGame || me?.eliminated) && (() => {
        const activePlayers = game.players.filter((p) => !p.eliminated);
        return (
          <div className="game-section">
            <div className="game-waiting">
              <div className="game-waiting-pulse" />
              <p>{me?.eliminated && isHost ? "You've been eliminated. Still hosting…" : me?.eliminated ? "You've been eliminated. Spectating…" : "Players are submitting clues…"} ({game.clues.length}/{activePlayers.length})</p>
            </div>
          </div>
        );
      })()}

      {!isSpectator && game.phase === "voting" && inGame && !me?.eliminated && (() => {
        const activePlayers = game.players.filter((p) => !p.eliminated);
        return (
          <ImposterVoteSection
            players={activePlayers}
            sessionId={sessionId}
            sessionById={sessionById}
            voteTarget={voteTarget}
            voteCount={game.votes.length}
            playerCount={activePlayers.length}
            clues={game.clues}
            submitted={game.votes.some((v) => v.voterId === sessionId)}
            onVoteTargetChange={setVoteTarget}
            onSubmit={() => void submitVote()}
          />
        );
      })()}

      {!isSpectator && game.phase === "voting" && (!inGame || me?.eliminated) && (() => {
        const activePlayers = game.players.filter((p) => !p.eliminated);
        return (
          <div className="game-section">
            <div className="game-waiting">
              <div className="game-waiting-pulse" />
              <p>{me?.eliminated && isHost ? "You've been eliminated. Still hosting…" : me?.eliminated ? "You've been eliminated. Spectating…" : "Players are voting…"} ({game.votes.length}/{activePlayers.length})</p>
            </div>
          </div>
        );
      })()}

      {!isSpectator && game.phase === "results" && (
        <ImposterResultsSection
          tally={tally}
          votes={game.votes}
          players={game.players}
          sessionById={sessionById}
          secretWord={visibleSecretWord}
          phaseEndsAt={game.settings.phaseEndsAt}
          skipVotes={(game.settings.skipVotes ?? []).length}
          activePlayerCount={game.players.filter((p) => !p.eliminated).length}
          hasVotedSkip={(game.settings.skipVotes ?? []).includes(sessionId)}
          onSkip={() => void zero.mutate(mutators.imposter.voteSkipResults({ gameId, sessionId }))}
        />
      )}

      {!isSpectator && game.phase === "finished" && (() => {
        const impostersLeft = game.players.filter((p) => p.role === "imposter" && !p.eliminated).length;
        const playersWin = impostersLeft === 0;
        const imposters = game.players.filter((p) => p.role === "imposter");
        const imposterNames = imposters.map((p) => sessionById[p.sessionId] ?? getDisplayName(p.name, p.sessionId));

        return (
          <div className="game-section">
            <div className={`game-reveal-card ${playersWin ? "game-reveal-card--success" : "game-reveal-card--fail"}`}>
              <p className="game-reveal-title">
                {playersWin ? "Players Win!" : "Imposters Win!"}
              </p>
              <p className="game-reveal-sub">
                {playersWin
                  ? "All imposters have been found!"
                  : "The imposters survived!"}
              </p>
              <p className="game-reveal-sub">
                {imposters.length > 1 ? "The imposters were " : "The imposter was "}
                <strong>{imposterNames.join(", ")}</strong>
              </p>
              {game.secret_word && (
                <p className="game-reveal-word">
                  The word was: <strong>{visibleSecretWord ?? "••••"}</strong>
                </p>
              )}
            </div>

            {(game.round_history ?? []).length > 0 && (
              <>
                <h3 className="game-section-label">Round Summary</h3>
                <div className="panel overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Word</th>
                        <th>Voted Out</th>
                        <th>Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(game.round_history ?? []).map((rh) => (
                        <tr key={rh.round}>
                          <td>{rh.round}</td>
                          <td style={{ color: "var(--primary)", fontWeight: 600 }}>{rh.secretWord ? (decryptedRoundWords[rh.round] ?? "••••") : "-"}</td>
                          <td style={{ fontWeight: 600 }}>{rh.votedOutName ?? "No one"}</td>
                          <td style={{ color: rh.wasImposter ? "#f87171" : "#4ade80", fontWeight: 600 }}>
                            {rh.votedOutName ? (rh.wasImposter ? "Imposter" : "Innocent") : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="game-actions">
              {isHost ? (
                <>
                  <button
                    className="btn btn-primary game-action-btn"
                    onClick={() => void zero.mutate(mutators.imposter.resetToLobby({ gameId, hostId: sessionId }))}
                  >
                    Play Again
                  </button>
                  <button
                    className="btn btn-muted"
                    onClick={() => {
                      void zero.mutate(mutators.imposter.endGame({ gameId, hostId: sessionId }))
                        .client.then(() => navigate("/"))
                        .catch(() => showToast("Couldn't end game", "error"));
                    }}
                  >
                    End Game
                  </button>
                </>
              ) : (
                <button className="btn btn-muted game-action-btn" onClick={() => navigate("/")}>
                  Back to Home
                </button>
              )}
            </div>
          </div>
        );
      })()}
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
