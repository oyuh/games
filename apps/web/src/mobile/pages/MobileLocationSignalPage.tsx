import { mutators, queries } from "@games/shared";
import { optimistic, useQuery, useZero } from "../../lib/zero";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiLogIn, FiLogOut, FiSend, FiMapPin, FiClock } from "react-icons/fi";
import { MobileGameHeader } from "../components/MobileGameHeader";
import { MobileGameNotFound } from "../components/MobileGameNotFound";
import { PlayerAvatar } from "../../components/shared/PlayerAvatar";
import { InSessionModal } from "../../components/shared/InSessionModal";
import { LobbyVisibilityToggle } from "../../components/shared/LobbyVisibilityToggle";
import { MobileSpectatorBadge, MobileHostBadge } from "../../components/shared/SpectatorBadge";
import { MobileSpectatorOverlay } from "../../components/shared/SpectatorOverlay";
import { useMobileHostRegister } from "../../lib/mobile-host-context";
import { addRecentGame, ensureName, getDisplayName, leaveCurrentGame, SessionGameType } from "../../lib/session";
import { showToast } from "../../lib/toast";
import { callGameSecretInit, callGameSecretPreReveal } from "../../lib/game-secrets";

import { WorldMap, MapMarker, fitRepeatingMapBounds } from "../../components/location/WorldMap";
import { useLocationSignalGame, type LocPhase } from "../../hooks/useLocationSignalGame";


const phaseLabels: Record<LocPhase, string> = {
  lobby: "Lobby", picking: "Picking",
  clue1: "Clue 1", guess1: "Guess 1", clue2: "Clue 2", guess2: "Guess 2",
  clue3: "Clue 3", guess3: "Guess 3", clue4: "Clue 4", guess4: "Guess 4",
  reveal: "Reveal", finished: "Finished", ended: "Ended",
};


/** Compute center + zoom that fits all points in the repeating map viewport */
export function MobileLocationSignalPage({ sessionId }: { sessionId: string }) {
  const {
    zero, navigate, gameId, game, me, isHost, isLeader, inGame, isSpectator,
    sessionById, playerName, myRoundGuess, guesserColorMap,
    draftClue, setDraftClue, draftMarker, setDraftMarker,
    leaderTarget, mapCenter, mapZoom, handleBoundsChanged, mapWrapRef, clueInputRef,
    activeGameType, activeGameId, inAnotherGame,
    showInSessionModal, setShowInSessionModal,
    joiningFromOtherGame, setJoiningFromOtherGame,
    phase, cluePairs, currentClueRound, currentGuessRound,
    isCluePhase, isGuessPhase, isLastGuessPhase, isGameActive,
    leaderName, roundGuessers, guessesThisRound, totalRounds, sortedPlayers,
    mapClickable, getClue, visibleClues,
    submitClue, submitGuess, lockTarget, handleJoinClick, confirmLeaveAndJoin,
  } = useLocationSignalGame(sessionId, { fallbackWidth: 400, height: 300 });

  useMobileHostRegister(
    isHost && game
      ? { type: "location_signal", gameId, hostId: game.host_id,
          players: game.players.map((p) => ({ sessionId: p.sessionId, name: sessionById[p.sessionId] ?? getDisplayName(p.name, p.sessionId) })),
          spectators: game.spectators ?? [] }
      : null
  );

  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  useEffect(() => {
    const endsAt = game?.settings.phaseEndsAt;
    if (!endsAt) { setTimeLeft(null); return; }
    const tick = () => setTimeLeft(Math.max(0, Math.floor((endsAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [game?.settings.phaseEndsAt]);

  if (!game) return <MobileGameNotFound theme="location" />;

  const buildMarkers = (): MapMarker[] => {
    const markers: MapMarker[] = [];
    const guessBySessionRound = new Map(
      game.guesses.map((guess) => [`${guess.sessionId}:${guess.round}`, guess])
    );

    if (draftMarker && (phase === "picking" || isGuessPhase)) {
      markers.push({ lat: draftMarker.lat, lng: draftMarker.lng, color: "#ef476f", label: "Your pick", size: 3.5, pulse: true });
    }
    // Leader sees their target from local state throughout the entire round
    if (isLeader && leaderTarget && phase !== "picking") {
      markers.push({ lat: leaderTarget.lat, lng: leaderTarget.lng, color: "#ffd166", label: "Your Target", size: 3.5, ring: true });
    }
    if (myRoundGuess && isGuessPhase) {
      markers.push({ lat: myRoundGuess.lat, lng: myRoundGuess.lng, color: guesserColorMap[sessionId] ?? "#06d6a0", label: "Your guess", size: 3, ring: true });
    }
    // Non-leader: show my own previous round guesses as smaller dots during guess2+
    if (!isLeader && isGuessPhase && currentGuessRound > 1) {
      for (let r = 1; r < currentGuessRound; r++) {
        const prev = guessBySessionRound.get(`${sessionId}:${r}`);
        if (prev) {
          markers.push({ lat: prev.lat, lng: prev.lng, color: guesserColorMap[sessionId] ?? "#06d6a0", label: `Your G${r}`, size: 1.5 });
        }
      }
    }
    // Leader sees guesses during clue phases (clue2+)
    if (isLeader && isCluePhase && currentClueRound > 1) {
      const prevGuesses = game.guesses.filter((g) => g.round === currentClueRound - 1);
      for (const g of prevGuesses) {
        const name = playerName(g.sessionId);
        const color = guesserColorMap[g.sessionId] ?? "#7ecbff";
        markers.push({ lat: g.lat, lng: g.lng, color, label: `${name} (G${g.round})`, size: 2, ring: true });
      }
    }
    // Leader sees guesses during guess phases
    if (isLeader && isGuessPhase) {
      const currentGuesses = game.guesses.filter((g) => g.round === currentGuessRound);
      for (const g of currentGuesses) {
        const name = playerName(g.sessionId);
        const color = guesserColorMap[g.sessionId] ?? "#7ecbff";
        markers.push({ lat: g.lat, lng: g.lng, color, label: `${name} (G${g.round})`, size: 2.5, ring: true });
      }
      for (let r = 1; r < currentGuessRound; r++) {
        const oldGuesses = game.guesses.filter((g) => g.round === r);
        for (const g of oldGuesses) {
          const name = playerName(g.sessionId);
          const color = guesserColorMap[g.sessionId] ?? "#7ecbff";
          markers.push({ lat: g.lat, lng: g.lng, color, label: `${name} (G${g.round})`, size: 1.5 });
        }
      }
    }
    if (phase === "reveal") {
      if (!game.encrypted_target && game.target_lat != null && game.target_lng != null) {
        markers.push({ lat: game.target_lat, lng: game.target_lng, color: "#ffd166", label: "Target", size: 4.5, pulse: true, ring: true });
      }
      const maxRound = Math.max(...game.guesses.map((g) => g.round), 1);
      for (const g of game.guesses) {
        const name = playerName(g.sessionId);
        const isMe = g.sessionId === sessionId;
        const isLatest = g.round === maxRound;
        const color = isLatest ? (guesserColorMap[g.sessionId] ?? "#7ecbff") : "#888";
        markers.push({
          lat: g.lat, lng: g.lng, color,
          label: `${isMe ? "You" : name}${isLatest ? "" : ` (G${g.round})`}`,
          size: isLatest ? 3 : 0.8,
          ring: isLatest,
          alwaysLabel: isLatest,
        });
      }
    }
    return markers;
  };

  const mapInteractive = true;


  /* Mobile-only view shapes: the desktop layout renders these regions
     differently, so they stay next to the markup. */
  const expandedMapActions = phase === "picking" && isLeader ? (
    <>
      <span className="locsig-map-action-hint">
        {draftMarker ? "Ready to lock this target." : "Tap the map to pick a target."}
      </span>
      <button className="m-btn m-btn-primary" disabled={!draftMarker} onClick={lockTarget}>
        <FiMapPin size={14} /> Lock Target
      </button>
    </>
  ) : isGuessPhase && !isLeader && inGame ? (
    <>
      <span className="locsig-map-action-hint">
        {draftMarker ? "Ready to submit this guess." : "Tap the map to place your guess."}
      </span>
      <button className="m-btn m-btn-primary" disabled={!draftMarker} onClick={() => void submitGuess(currentGuessRound)}>
        <FiMapPin size={14} /> {myRoundGuess ? "Update Guess" : isLastGuessPhase ? "Place Final Guess" : "Place Guess"}
      </button>
    </>
  ) : null;
  const mobileMapStatus = isGameActive ? (() => {
    if (phase === "picking") {
      return {
        title: isLeader ? "Choose the target" : "Target is being chosen",
        body: isLeader
          ? (draftMarker ? "Target marker placed. Lock it when ready." : "Tap anywhere on the map to set the hidden location.")
          : `${leaderName} is picking the hidden location.`,
      };
    }
    if (isCluePhase) {
      return {
        title: isLeader ? `Write clue ${currentClueRound}` : "Waiting for clue",
        body: isLeader ? "Use the map context, then send the next clue below." : `${leaderName} is writing clue ${currentClueRound}.`,
      };
    }
    if (isGuessPhase) {
      return {
        title: isLeader ? "Guesses live on the map" : `Place guess ${currentGuessRound}`,
        body: isLeader
          ? "Current guesses appear as players submit them."
          : (draftMarker ? "Guess marker placed. Ready to submit." : "Tap the map to place or move your guess marker."),
      };
    }
    if (phase === "reveal") {
      return { title: "Reveal", body: "The target and latest guesses are highlighted on the map." };
    }
    return null;
  })() : null;

  return (
    <div className="m-page" data-game-theme="location">
      <MobileGameHeader
        gameLabel="Location Signal"
        code={game.code}
        phase={phaseLabels[phase]}
        {...(isGameActive ? { round: game.settings.currentRound } : {})}
        totalRounds={totalRounds}
        accent="var(--game-accent)"
      >
        {isSpectator && <MobileSpectatorBadge />}
        {isHost && <MobileHostBadge />}
        {timeLeft != null && (
          <span className={`m-timer${timeLeft <= 10 ? " m-timer--danger" : " m-timer--warn"}`}>
            <FiClock size={14} /> {String(Math.floor(timeLeft / 60)).padStart(2, "0")}:{String(timeLeft % 60).padStart(2, "0")}
          </span>
        )}
      </MobileGameHeader>

      {/* Players bar */}
      {isGameActive && (
        <div className="m-section">
          <h3 className="m-label">Players <span className="m-badge-small">{game.players.length}</span></h3>
          <div className="m-players-row m-players-row--strip">
            {game.players.map((p, playerIndex) => {
              const name = playerName(p.sessionId);
              const isMe = p.sessionId === sessionId;
              const isCurrentLeader = p.sessionId === game.leader_id;
              const inAGuessPhase = currentGuessRound > 0;
              const hasGuessed = inAGuessPhase && game.guesses.some((g) => g.sessionId === p.sessionId && g.round === currentGuessRound);
              const isLockedIn = inAGuessPhase && !isCurrentLeader && hasGuessed;
              return (
                <div key={p.sessionId}
                  className={`m-player-chip${isMe ? " m-player-chip--me" : ""}${isCurrentLeader ? " m-player-chip--leader" : ""}${isLockedIn ? " m-player-chip--locked" : ""}`}>
                  <div className={`m-player-avatar${isCurrentLeader ? " m-player-avatar--leader" : ""}`}>
                    {isCurrentLeader ? "📍" : isLockedIn ? "✅" : (
                      <PlayerAvatar
                        seed={p.sessionId}

                      />
                    )}
                  </div>
                  <span className="m-player-name">{name}</span>
                  <span className="m-badge-small">{p.totalScore}</span>
                  {isMe && <span className="m-badge-small m-badge-small--you">you</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Map */}
      {isGameActive && (
        <div className="m-card locsig-mobile-map-card">
          {mobileMapStatus && (
            <div className="locsig-mobile-status">
              <strong>{mobileMapStatus.title}</strong>
              <span>{mobileMapStatus.body}</span>
            </div>
          )}
          <div ref={mapWrapRef} className="locsig-mobile-map-frame">
            <WorldMap
              height={320}
              {...(mapClickable ? { onClick: (coords: { lat: number; lng: number }) => setDraftMarker(coords) } : {})}
              interactive={mapInteractive}
              markers={buildMarkers()}
              coordsOverlay={draftMarker && mapClickable ? draftMarker : null}
              center={mapCenter}
              zoom={mapZoom}
              onBoundsChanged={handleBoundsChanged}
              timerEndsAt={game.settings.phaseEndsAt}
              closeKey={`${game.phase}:${game.settings.currentRound}`}
              expandedActions={expandedMapActions}
            />
          </div>
          {expandedMapActions && (
            <div className="locsig-mobile-map-actions">
              {expandedMapActions}
            </div>
          )}
        </div>
      )}

      {/* Lobby */}
      {phase === "lobby" && (
        <div className="m-section">
          <h3 className="m-label">Players <span className="m-badge-small">{game.players.length}</span></h3>
          <div className="m-players-row m-players-row--strip">
            {game.players.map((p, playerIndex) => {
              const name = playerName(p.sessionId);
              const isMe = p.sessionId === sessionId;
              return (
                <div key={p.sessionId} className={`m-player-chip${isMe ? " m-player-chip--me" : ""}`}>
                  <div className="m-player-avatar">
                    <PlayerAvatar
                      seed={p.sessionId}

                    />
                  </div>
                  <span className="m-player-name">{name}</span>
                  {isMe && <span className="m-badge-small m-badge-small--you">you</span>}
                </div>
              );
            })}
          </div>

          <div className="m-card locsig-mobile-map-card">
            <div className="locsig-mobile-map-frame">
              <WorldMap
                height={240}
                interactive
                markers={draftMarker ? [{ lat: draftMarker.lat, lng: draftMarker.lng, color: "var(--primary)", label: "Preview", size: 2, ring: true }] : []}
                onClick={(coords) => setDraftMarker(coords)}
              />
            </div>
          </div>

          {!inGame && !isSpectator && (
            <div className="m-actions m-bottom-safe" style={{ marginTop: "0.5rem" }}>
              <p className="m-text-muted m-text-center">You're not in this lobby yet.</p>
              <button className="m-btn m-btn-primary" onClick={handleJoinClick}>
                <FiLogIn size={16} /> Join Game
              </button>
            </div>
          )}

          {inGame && (
            <div className="m-actions m-bottom-safe" style={{ marginTop: "0.5rem" }}>
              {isHost && (
                <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
                  <LobbyVisibilityToggle gameType="location_signal" gameId={game.id} sessionId={sessionId} isPublic={game.is_public} />
                </div>
              )}
              {isHost ? (
                <button className="m-btn m-btn-primary" disabled={game.players.length < 2}
                  onClick={() => void optimistic(zero.mutate(mutators.locationSignal.start({ gameId: game.id, hostId: sessionId }))).catch((e: unknown) => showToast(e instanceof Error ? e.message : "Start failed", "error"))}>
                  {game.players.length < 2 ? `Need ${2 - game.players.length} more` : "Start Game"}
                </button>
              ) : (
                <p className="m-text-muted m-text-center">Waiting for host to start&hellip;</p>
              )}
              <button className="m-btn m-btn-muted"
                onClick={() => void optimistic(zero.mutate(mutators.locationSignal.leave({ gameId: game.id, sessionId })))}>
                <FiLogOut size={14} /> Leave
              </button>
            </div>
          )}
        </div>
      )}

      {/* Picking (leader) */}
      {phase === "picking" && isLeader && (
        <div className="m-section">
          <div className="m-shade-leader-banner">
            <h3>Pick your target location! 📍</h3>
            <p>Tap the map to place your target.</p>
          </div>
          <p className="locsig-mobile-phase-note">Target ready once a pin is placed.</p>
        </div>
      )}

      {/* Picking (non-leader) */}
      {phase === "picking" && !isLeader && inGame && (
        <div className="m-section">
          <div className="m-waiting">
            <div className="m-pulse" />
            <p><strong>{leaderName}</strong> is picking a location&hellip;</p>
          </div>
        </div>
      )}

      {/* Clue phase (leader writes) */}
      {isCluePhase && isLeader && (
        <div className="m-section">
          <div className="m-shade-leader-banner">
            <h3>{currentClueRound === 1 ? "You are the Leader! 📍" : `Write clue ${currentClueRound}! 📍`}</h3>
            <p>{currentClueRound === 1 ? "Give a text clue to hint at the location." : "You can see their guesses on the map!"}</p>
          </div>
          {visibleClues(currentClueRound - 1).length > 0 && (
            <div className="m-shade-clues-row">
              {visibleClues(currentClueRound - 1).map((c) => (
                <div key={c.round} className="m-shade-clue-display">
                  <span className="m-shade-clue-tag">Clue {c.round}</span>
                  <span className="m-shade-clue-word">{c.text}</span>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={(e) => void submitClue(e, currentClueRound)} className="m-shade-clue-form">
            <input ref={clueInputRef} className="m-input" onFocus={(e) => e.currentTarget.select()} value={draftClue} onChange={(e) => setDraftClue(e.target.value)} placeholder={currentClueRound === 1 ? "e.g. Ancient empire!" : `Clue ${currentClueRound}!`} maxLength={80} />
            <button className="m-btn m-btn-primary" type="submit" disabled={!draftClue.trim()} onMouseDown={(event) => event.preventDefault()}>
              <FiSend size={14} /> Send
            </button>
          </form>
        </div>
      )}

      {/* Clue phase (non-leader waits) */}
      {isCluePhase && !isLeader && inGame && (
        <div className="m-section">
          {visibleClues(currentClueRound - 1).length > 0 && (
            <div className="m-shade-clues-row">
              {visibleClues(currentClueRound - 1).map((c) => (
                <div key={c.round} className="m-shade-clue-display">
                  <span className="m-shade-clue-tag">Clue {c.round}</span>
                  <span className="m-shade-clue-word">{c.text}</span>
                </div>
              ))}
            </div>
          )}
          <div className="m-waiting">
            <div className="m-pulse" />
            <p><strong>{leaderName}</strong> is writing clue {currentClueRound}&hellip;</p>
          </div>
        </div>
      )}

      {/* Guess phase (guessers) */}
      {isGuessPhase && !isLeader && inGame && (
        <div className="m-section">
          <div className="m-shade-clues-row">
            {visibleClues(currentGuessRound).map((c) => (
              <div key={c.round} className="m-shade-clue-display">
                <span className="m-shade-clue-tag">Clue {c.round}</span>
                <span className="m-shade-clue-word">{c.text}</span>
              </div>
            ))}
          </div>
          <p className="m-text-center m-text-muted" style={{ fontSize: "0.82rem" }}>
            {myRoundGuess ? "Guess placed! Tap the map to update." : "Tap the map to place your guess"}
          </p>
          <p className="locsig-mobile-phase-note">Guess ready once a pin is placed.</p>
        </div>
      )}

      {/* Guess phase (leader watches) */}
      {isGuessPhase && isLeader && (
        <div className="m-section">
          <div className="m-shade-clues-row">
            {visibleClues(currentGuessRound).map((c) => (
              <div key={c.round} className="m-shade-clue-display">
                <span className="m-shade-clue-tag">{c.round === currentGuessRound ? "Your Clue" : `Clue ${c.round}`}</span>
                <span className="m-shade-clue-word">{c.text}</span>
              </div>
            ))}
          </div>
          <div className="m-waiting">
            <div className="m-pulse" />
            <p>Guessers are choosing&hellip; ({guessesThisRound(currentGuessRound).length}/{roundGuessers.length})</p>
          </div>
        </div>
      )}

      {/* Reveal */}
      {phase === "reveal" && (
        <div className="m-section">
          <h3 className="m-label" style={{ textAlign: "center" }}>Reveal!</h3>
          {visibleClues(cluePairs).length > 0 && (
            <div className="m-shade-clues-row">
              {visibleClues(cluePairs).map((c) => (
                <div key={c.round} className="m-shade-clue-display">
                  <span className="m-shade-clue-tag">Clue {c.round}</span>
                  <span className="m-shade-clue-word">{c.text}</span>
                </div>
              ))}
            </div>
          )}
          <div className="m-shade-score-table m-shade-score-table--compact locsig-mobile-reveal-summary">
            <h4 className="m-label">Round {game.settings.currentRound} Scores</h4>
            {(() => {
              const prevHistory = game.round_history.length > 1 ? game.round_history[game.round_history.length - 2] : null;
              const scorePlayers = sortedPlayers.reduce<typeof sortedPlayers>((players, player) => {
                if (player.sessionId !== game.leader_id) {
                  players.push(player);
                }
                return players;
              }, []);
              return scorePlayers.map((p) => {
                const isMe = p.sessionId === sessionId;
                const name = playerName(p.sessionId);
                const roundPts = p.totalScore - (prevHistory?.scores[p.sessionId] ?? 0);
                return (
                  <div key={p.sessionId} className="m-shade-score-row">
                    <span className="m-shade-score-name">
                      {name} {isMe && <span className="m-badge-small m-badge-small--you">you</span>}
                    </span>
                    <span className="m-shade-score-pts m-shade-score-pts--ok">
                      {p.totalScore} pts {roundPts > 0 && <span style={{ opacity: 0.7, fontSize: "0.85em" }}>(+{roundPts})</span>}
                    </span>
                  </div>
                );
              });
            })()}
            <div className="m-shade-score-row m-shade-score-row--leader">
              <span className="m-shade-score-name">Leader: {leaderName}</span>
              <span className="m-shade-score-pts">📍</span>
            </div>
          </div>
        </div>
      )}

      {/* Finished */}
      {phase === "finished" && (
        <div className="m-section">
          <h3 className="m-label" style={{ textAlign: "center" }}>Game Over!</h3>
          <div className="m-shade-final-scores">
            {sortedPlayers.map((p, i) => {
              const isMe = p.sessionId === sessionId;
              const name = playerName(p.sessionId);
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
              return (
                <div key={p.sessionId} className={`m-shade-final-row${i === 0 ? " m-shade-final-row--winner" : ""}`}>
                  <span className="m-shade-final-rank">{medal}</span>
                  <span className="m-shade-final-name">
                    {name} {isMe && <span className="m-badge-small m-badge-small--you">you</span>}
                  </span>
                  <span className="m-shade-final-pts">{p.totalScore} pts</span>
                </div>
              );
            })}
          </div>
          <div className="m-actions m-bottom-safe" style={{ marginTop: "0.5rem" }}>
            {isHost ? (
              <>
                <button className="m-btn m-btn-primary"
                  onClick={() => void zero.mutate(mutators.locationSignal.resetToLobby({ gameId: game.id, hostId: sessionId }))}>
                  Play Again
                </button>
                <button className="m-btn m-btn-muted" onClick={() => {
                  void zero.mutate(mutators.locationSignal.endGame({ gameId: game.id, hostId: sessionId }))
                    .client.then(() => navigate("/"))
                    .catch(() => showToast("Couldn't end game", "error"));
                }}>
                  End Game
                </button>
              </>
            ) : (
              <button className="m-btn m-btn-muted" onClick={() => navigate("/")}>Back to Home</button>
            )}
          </div>
        </div>
      )}

      {/* Spectator overlay */}
      {isSpectator && phase !== "lobby" && (
        <MobileSpectatorOverlay
          playerCount={game.players.length}
          phase={game.phase}
          onLeave={() => void optimistic(zero.mutate(mutators.locationSignal.leave({ gameId: game.id, sessionId }))).then(() => navigate("/"))}
        />
      )}

      {/* Not in game */}
      {!inGame && !isSpectator && isGameActive && (
        <div className="m-section">
          <div className="m-waiting">
            <div className="m-pulse" />
            <p>Game in progress - watching!</p>
          </div>
        </div>
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
