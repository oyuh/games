import { mutators } from "@games/shared";
import { optimistic } from "../lib/zero";
import "../styles/game-shared.css";
import "../styles/location-signal.css";
import { useState } from "react";
import { FiSend, FiMapPin } from "react-icons/fi";
import { GameShellHeader } from "../components/shared/GameShellHeader";
import { LocationLobby, locationPhases, locationTrackPhase } from "../components/location/LocationLobby";
import { LocationPickClue } from "../components/location/LocationRound";
import { callGameSecretInit } from "../lib/game-secrets";
import { InSessionModal } from "../components/shared/InSessionModal";
import { LobbyVisibilityToggle } from "../components/shared/LobbyVisibilityToggle";
import { SpectatorOverlay } from "../components/shared/SpectatorOverlay";
import { PlayerAvatar } from "../components/shared/PlayerAvatar";
import { showToast } from "../lib/toast";
import { useIsMobile } from "../hooks/useIsMobile";

import { MobileLocationSignalPage } from "../mobile/pages/MobileLocationSignalPage";
import { WorldMap, MapMarker } from "../components/location/WorldMap";
import { useLocationSignalGame } from "../hooks/useLocationSignalGame";

/**
 * Location Signal. The lobby is a component with its own states, all of them
 * visible at /dev/location, so that half of this file is only wiring: who you
 * are, and which mutator a button reaches for. The map phases below are still
 * drawing their own markup and move onto the kit next.
 */
function LocationSignalPageDesktop({ sessionId }: { sessionId: string }) {
  /* Held while a mutator is in the air, so nothing can be pressed twice into
     two of the same thing. */
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);

  const {
    zero, navigate, gameId, game, me, isHost, isLeader, inGame, isSpectator,
    sessionById, playerName, myRoundGuess, guesserColorMap,
    draftClue, setDraftClue, draftMarker, setDraftMarker,
    leaderTarget, setLeaderTarget, mapCenter, mapZoom, handleBoundsChanged, mapWrapRef, clueInputRef,
    activeGameType, activeGameId, inAnotherGame,
    showInSessionModal, setShowInSessionModal,
    joiningFromOtherGame, setJoiningFromOtherGame,
    phase, cluePairs, currentClueRound, currentGuessRound,
    isCluePhase, isGuessPhase, isLastGuessPhase, isGameActive,
    leaderName, roundGuessers, guessesThisRound, totalRounds, sortedPlayers,
    mapClickable, getClue, visibleClues,
    submitClue, submitGuess, lockTarget, handleJoinClick, confirmLeaveAndJoin,
  } = useLocationSignalGame(sessionId, { fallbackWidth: 900, height: 520 });

  if (!game) {
    return (
      <div className="game-page">
        <div className="game-empty">
          <p className="game-empty-title">Game not found</p>
          <p className="game-empty-sub">Redirecting home&hellip;</p>
          <button className="btn btn-primary" onClick={() => navigate("/")}>Go Home</button>
        </div>
      </div>
    );
  }

  const buildMarkers = (): MapMarker[] => {
    const markers: MapMarker[] = [];
    const guessBySessionRound = new Map(
      game.guesses.map((guess) => [`${guess.sessionId}:${guess.round}`, guess])
    );

    // Draft marker (picking or guessing)
    if (draftMarker && (phase === "picking" || isGuessPhase)) {
      markers.push({ lat: draftMarker.lat, lng: draftMarker.lng, color: "#ef476f", label: "Your pick", size: 3.5, pulse: true });
    }

    // Leader sees their target from local state throughout the entire round
    if (isLeader && leaderTarget && phase !== "picking") {
      markers.push({ lat: leaderTarget.lat, lng: leaderTarget.lng, color: "#ffd166", label: "Your Target", size: 3.5, ring: true });
    }

    // My locked-in guess for current round
    if (myRoundGuess && isGuessPhase) {
      markers.push({ lat: myRoundGuess.lat, lng: myRoundGuess.lng, color: guesserColorMap[sessionId] ?? "#06d6a0", label: "Your guess", size: 3, ring: true });
    }

    // Non-leader: show my own previous guesses at all times (clue + guess phases)
    if (!isLeader && isGameActive && phase !== "picking") {
      const maxVisible = isGuessPhase ? currentGuessRound : (isCluePhase ? currentClueRound : cluePairs);
      for (let r = 1; r <= maxVisible; r++) {
        const prev = guessBySessionRound.get(`${sessionId}:${r}`);
        if (prev && !(isGuessPhase && r === currentGuessRound)) {
          markers.push({ lat: prev.lat, lng: prev.lng, color: guesserColorMap[sessionId] ?? "#06d6a0", label: `Your G${r}`, size: 1.5 });
        }
      }
    }

    // Leader sees all guesses during clue phases (all rounds so far)
    if (isLeader && isCluePhase) {
      for (let r = 1; r < currentClueRound; r++) {
        const roundGuesses = game.guesses.filter((g) => g.round === r);
        for (const g of roundGuesses) {
          const name = playerName(g.sessionId);
          const color = guesserColorMap[g.sessionId] ?? "#7ecbff";
          markers.push({ lat: g.lat, lng: g.lng, color, label: `${name} (G${g.round})`, size: 2, ring: true });
        }
      }
    }

    // Leader sees all guesses during guess phases
    if (isLeader && isGuessPhase) {
      const currentGuesses = game.guesses.filter((g) => g.round === currentGuessRound);
      for (const g of currentGuesses) {
        const name = playerName(g.sessionId);
        const color = guesserColorMap[g.sessionId] ?? "#7ecbff";
        markers.push({ lat: g.lat, lng: g.lng, color, label: `${name} (G${g.round})`, size: 2.5, ring: true });
      }
      // Also show previous round guesses as smaller dots
      for (let r = 1; r < currentGuessRound; r++) {
        const oldGuesses = game.guesses.filter((g) => g.round === r);
        for (const g of oldGuesses) {
          const name = playerName(g.sessionId);
          const color = guesserColorMap[g.sessionId] ?? "#7ecbff";
          markers.push({ lat: g.lat, lng: g.lng, color, label: `${name} (G${g.round})`, size: 1.5 });
        }
      }
    }

    // Reveal: show target + most-recent guess per player prominently; older guesses tiny & label-hidden
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
          hideLabel: !isLatest,
        });
      }
    }

    return markers;
  };

  // Leader can always interact (pan/zoom) with map; guessers can click during guess phases; leader can click during picking
  const mapInteractive = true;

  /* Dropping the pin and writing the first clue are one screen. The server
     still runs them as `picking` then `clue1`, so both land here, and that
     screen brings its own map rather than using the shared one below. */
  const pickClue = phase === "picking" || phase === "clue1";
  const pickedTarget = draftMarker ?? leaderTarget;

  const expandedMapActions = phase === "picking" && isLeader ? (
    <>
      <span className="locsig-map-action-hint">
        {draftMarker ? "Ready to lock this target." : "Click the map to pick a target."}
      </span>
      <button
        className="btn btn-primary game-action-btn"
        disabled={!draftMarker}
        data-tooltip={draftMarker ? "Confirm this location as the target" : "Click the map first to pick a target"}
        data-tooltip-variant="info"
        onClick={lockTarget}
      >
        <FiMapPin size={14} /> Lock Target
      </button>
    </>
  ) : isGuessPhase && !isLeader && inGame ? (
    <>
      <span className="locsig-map-action-hint">
        {draftMarker ? "Ready to submit this guess." : "Click the map to place your guess."}
      </span>
      <button
        className="btn btn-primary game-action-btn"
        disabled={!draftMarker}
        data-tooltip={draftMarker ? "Submit your guess location" : "Click the map to pick a location first"}
        data-tooltip-variant="info"
        onClick={() => void submitGuess(currentGuessRound)}
      >
        <FiMapPin size={14} /> {myRoundGuess ? "Update Guess" : isLastGuessPhase ? "Place Final Guess" : "Place Guess"}
      </button>
    </>
  ) : null;

  /* ── Players bar (shared across phases) ── */
  const renderPlayersBar = () => (
    <div className="game-section">
      <h3 className="game-section-label">
        Players <span className="game-section-count">{game.players.length}</span>
      </h3>
      <div className="game-players-grid">
        {game.players.map((p, playerIndex) => {
          const name = playerName(p.sessionId);
          const isMe = p.sessionId === sessionId;
          const isCurrentLeader = p.sessionId === game.leader_id;
          const inAGuessPhase = currentGuessRound > 0;
          const hasGuessed = inAGuessPhase && game.guesses.some((g) => g.sessionId === p.sessionId && g.round === currentGuessRound);
          const isLockedIn = inAGuessPhase && !isCurrentLeader && hasGuessed;
          return (
            <div
              key={p.sessionId}
              className={`game-player-chip${isMe ? " game-player-chip--me" : ""}${isCurrentLeader ? " game-player-chip--leader" : ""}${isLockedIn ? " game-player-chip--locked" : ""}`}
              data-tooltip={`${name}${isCurrentLeader ? " - Leader 📍" : ""}${isLockedIn ? " - Locked in ✅" : ""}${isMe ? " (you)" : ""}\n${p.totalScore} pts`}
              data-tooltip-variant={isCurrentLeader ? "game" : isLockedIn ? "success" : "info"}
            >
              <div className={`game-player-avatar${isCurrentLeader ? " game-player-avatar--leader" : ""}`}>
                {isCurrentLeader ? "📍" : isLockedIn ? "✅" : (
                  <PlayerAvatar
                    seed={p.sessionId}
                  />
                )}
              </div>
              <span className="game-player-name">{name}</span>
              {isGameActive && <span className="badge" data-tooltip={`${name}'s score`} data-tooltip-variant="info" style={{ fontSize: "0.75rem" }}>{p.totalScore}</span>}
              {isMe && <span className="game-player-you">you</span>}
            </div>
          );
        })}
      </div>
    </div>
  );

  /* ── Map section (shared across gameplay phases) ── */
  const renderMap = () => (
    <div className="game-section">
      <div className="locsig-map-wrap" ref={mapWrapRef}>
        <WorldMap
          height={520}
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
    </div>
  );

  return (
    <div className="game-page locsig-page" data-game-theme="location">
      <GameShellHeader
        collapsible
        game="location"
        title="Location Signal"
        phases={locationPhases(cluePairs)}
        phase={locationTrackPhase(game.phase)}
        code={game.code}
        endsAt={game.settings.phaseEndsAt}
        isHost={isHost}
        isSpectator={isSpectator}
        {...(isCluePhase ? { duration: game.settings.clueDurationSec } : {})}
        {...(isGuessPhase ? { duration: game.settings.guessDurationSec } : {})}
        {...(isGameActive && totalRounds > 0
          ? { round: { current: game.settings.currentRound, total: totalRounds } }
          : {})}
      />

      {/* ─── Players bar (always visible during game) ─── */}
      {isGameActive && renderPlayersBar()}

      {/* ─── Map (always visible during game) ─── */}
      {isGameActive && !pickClue && renderMap()}

      {phase === "lobby" && (
        <LocationLobby
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
            void optimistic(zero.mutate(mutators.locationSignal.start({ gameId, hostId: sessionId })))
              .catch((error) => showToast(error instanceof Error ? error.message : "Couldn't start the round", "error"))
              .finally(() => setStarting(false));
          }}
          onLeave={() => {
            void optimistic(zero.mutate(mutators.locationSignal.leave({ gameId, sessionId })))
              .then(() => navigate("/"))
              .catch((error) => showToast(error instanceof Error ? error.message : "Couldn't leave", "error"));
          }}
          onJoin={handleJoinClick}
          {...(isHost
            ? {
                onKick: (targetId: string) =>
                  void zero.mutate(mutators.locationSignal.kick({ gameId, hostId: sessionId, targetId }))
                    .client.catch(() => showToast("Couldn't remove them", "error")),
                actions: <LobbyVisibilityToggle gameType="location_signal" gameId={gameId} sessionId={sessionId} isPublic={game.is_public} />,
              }
            : {})}
        />
      )}

      {/* ─── The place and the first clue, one screen ─── */}
      {pickClue && !isSpectator && (
        <LocationPickClue
          isLeader={isLeader}
          leader={{ sessionId: game.leader_id ?? "", name: leaderName }}
          target={pickedTarget}
          value={draftClue}
          submitting={sending}
          endsAt={game.settings.phaseEndsAt}
          duration={game.settings.clueDurationSec}
          onPick={setDraftMarker}
          onChange={setDraftClue}
          onSubmit={(event) => {
            event.preventDefault();
            if (!pickedTarget || !draftClue.trim()) return;
            setSending(true);

            /* Two mutators, one press. The server still has a picking step and
               a clue step, so the place is locked first and the clue goes in
               behind it. Between them the target gets encrypted, which has to
               happen after it lands and before anyone can read the row. */
            const clue = draftClue.trim();
            const placed = phase === "clue1"
              ? Promise.resolve()
              : zero.mutate(mutators.locationSignal.setTarget({ gameId, sessionId, lat: pickedTarget.lat, lng: pickedTarget.lng }))
                  .server.then(() => { setLeaderTarget(pickedTarget); })
                  .then(() => callGameSecretInit("location_signal", gameId, sessionId));

            void placed
              .then(() => optimistic(zero.mutate(mutators.locationSignal.submitClue({ gameId, sessionId, round: 1, text: clue }))))
              .then(() => setDraftClue(""))
              .catch((error) => showToast(error instanceof Error ? error.message : "Couldn't send that", "error"))
              .finally(() => setSending(false));
          }}
        />
      )}

      {/* ─── Clue phase (leader writes) ─── */}
      {isCluePhase && !pickClue && isLeader && (
        <div className="game-section locsig-clue-section">
          <div className="locsig-clue-leader-info">
            <h3>{currentClueRound === 1 ? "You are the Leader! 📍" : `Write clue ${currentClueRound}! 📍`}</h3>
            <p>{currentClueRound === 1 ? "Give a text clue to hint at the location - don't name it directly!" : "Help them narrow it down - you can see their previous guesses on the map!"}</p>
          </div>
          {visibleClues(currentClueRound - 1).length > 0 && (
            <div className="locsig-clue-display-row">
              {visibleClues(currentClueRound - 1).map((c) => (
                <div key={c.round} className="locsig-clue-display">
                  <span className="locsig-clue-tag">Clue {c.round}</span>
                  <span className="locsig-clue-word">{c.text}</span>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={(e) => void submitClue(e, currentClueRound)} className="locsig-clue-form">
            <input ref={clueInputRef} className="input locsig-clue-input" onFocus={(e) => e.currentTarget.select()} value={draftClue} onChange={(e) => setDraftClue(e.target.value)} placeholder={currentClueRound === 1 ? "e.g. Ancient empire" : `Clue ${currentClueRound}`} maxLength={80} />
            <button className="btn btn-primary" type="submit" disabled={!draftClue.trim()} data-tooltip="Submit this clue to the guessers" data-tooltip-variant="info" onMouseDown={(event) => event.preventDefault()}>
              <FiSend size={14} /> Send
            </button>
          </form>
        </div>
      )}

      {/* ─── Clue phase (non-leader waits) ─── */}
      {isCluePhase && !pickClue && !isLeader && inGame && (
        <div className="game-section locsig-waiting-section">
          {visibleClues(currentClueRound - 1).length > 0 && (
            <div className="locsig-clue-display-row">
              {visibleClues(currentClueRound - 1).map((c) => (
                <div key={c.round} className="locsig-clue-display">
                  <span className="locsig-clue-tag">Clue {c.round}</span>
                  <span className="locsig-clue-word">{c.text}</span>
                </div>
              ))}
            </div>
          )}
          <div className="game-waiting">
            <div className="game-waiting-pulse" />
            <p><strong>{leaderName}</strong> is writing clue {currentClueRound}&hellip;</p>
          </div>
        </div>
      )}

      {/* ─── Guess phase (guessers) ─── */}
      {isGuessPhase && !isLeader && inGame && (
        <div className="game-section locsig-guess-section">
          <div className="locsig-clue-display-row">
            {visibleClues(currentGuessRound).map((c) => (
              <div key={c.round} className="locsig-clue-display">
                <span className="locsig-clue-tag">Clue {c.round}</span>
                <span className="locsig-clue-word">{c.text}</span>
              </div>
            ))}
          </div>
          <p className="locsig-guess-prompt">
            {myRoundGuess ? "Guess placed! Click the map to update it." : "Click on the map to place your guess"}
          </p>
          <div className="locsig-guess-actions">
            <button className="btn btn-primary game-action-btn" disabled={!draftMarker}
              data-tooltip={draftMarker ? "Submit your guess location" : "Click the map to pick a location first"} data-tooltip-variant="info"
              onClick={() => void submitGuess(currentGuessRound)}>
              <FiMapPin size={14} /> {myRoundGuess ? "Update Guess" : isLastGuessPhase ? "Place Final Guess" : "Place Guess"}
            </button>
          </div>
        </div>
      )}

      {/* ─── Guess phase (leader watches) ─── */}
      {isGuessPhase && isLeader && (
        <div className="game-section locsig-waiting-section">
          <div className="locsig-clue-display-row">
            {visibleClues(currentGuessRound).map((c) => (
              <div key={c.round} className="locsig-clue-display">
                <span className="locsig-clue-tag">{c.round === currentGuessRound ? "Your Clue" : `Clue ${c.round}`}</span>
                <span className="locsig-clue-word">{c.text}</span>
              </div>
            ))}
          </div>
          <div className="game-waiting">
            <div className="game-waiting-pulse" />
            <p>Guessers are choosing&hellip; ({guessesThisRound(currentGuessRound).length}/{roundGuessers.length})</p>
          </div>
        </div>
      )}

      {/* ─── Reveal ─── */}
      {phase === "reveal" && (
        <div className="game-section locsig-reveal-section">
          <h3 className="locsig-reveal-title">Reveal!</h3>

          {visibleClues(cluePairs).length > 0 && (
            <div className="locsig-clue-display-row">
              {visibleClues(cluePairs).map((c) => (
                <div key={c.round} className="locsig-clue-display">
                  <span className="locsig-clue-tag">Clue {c.round}</span>
                  <span className="locsig-clue-word">{c.text}</span>
                </div>
              ))}
            </div>
          )}

          <div className="locsig-score-table">
            <h4>Round {game.settings.currentRound} Scores</h4>
            <div className="locsig-score-rows">
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
                    <div key={p.sessionId} className="locsig-score-row" data-tooltip={`${name} - ${p.totalScore} pts`} data-tooltip-variant="info">
                      <span className="locsig-score-name">
                        {name} {isMe && <span className="game-player-you">you</span>}
                      </span>
                      <span className="locsig-score-pts locsig-score-pts--ok">
                        {p.totalScore} pts {roundPts > 0 && <span style={{ opacity: 0.7, fontSize: "0.85em" }}>(+{roundPts})</span>}
                      </span>
                    </div>
                  );
                });
              })()}
              <div className="locsig-score-row locsig-score-row--leader">
                <span className="locsig-score-name">Leader: {leaderName}</span>
                <span className="locsig-score-pts">📍</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Finished ─── */}
      {phase === "finished" && (
        <div className="game-section locsig-finished-section">
          <h3 className="locsig-finished-title">Game Over!</h3>

          <div className="locsig-final-scores">
            {sortedPlayers.map((p, i) => {
              const isMe = p.sessionId === sessionId;
              const name = playerName(p.sessionId);
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
              return (
                <div key={p.sessionId} className={`locsig-final-row${i === 0 ? " locsig-final-row--winner" : ""}`} data-tooltip={`${name} - ${p.totalScore} pts`} data-tooltip-variant="info">
                  <span className="locsig-final-rank">{medal}</span>
                  <span className="locsig-final-name">
                    {name} {isMe && <span className="game-player-you">you</span>}
                  </span>
                  <span className="locsig-final-pts">{p.totalScore} pts</span>
                </div>
              );
            })}
          </div>

          <div className="game-actions">
            {isHost ? (
              <>
                <button className="btn btn-primary game-action-btn"
                  onClick={() => void zero.mutate(mutators.locationSignal.resetToLobby({ gameId: game.id, hostId: sessionId }))}>
                  Play Again
                </button>
                <button className="btn btn-muted" onClick={() => {
                  void zero.mutate(mutators.locationSignal.endGame({ gameId: game.id, hostId: sessionId }))
                    .client.then(() => navigate("/"))
                    .catch(() => showToast("Couldn't end game", "error"));
                }}>
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
      )}

      {/* ─── Spectator overlay ─── */}
      {isSpectator && phase !== "lobby" && (
        <SpectatorOverlay
          playerCount={game.players.length}
          phase={game.phase}
          onLeave={() => void optimistic(zero.mutate(mutators.locationSignal.leave({ gameId: game.id, sessionId }))).then(() => navigate("/"))}
        />
      )}

      {/* ─── Not in game, game in progress ─── */}
      {!inGame && !isSpectator && isGameActive && (
        <div className="game-section">
          <div className="game-waiting">
            <div className="game-waiting-pulse" />
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

export function LocationSignalPage({ sessionId }: { sessionId: string }) {
  const isMobile = useIsMobile();
  if (isMobile) return <MobileLocationSignalPage sessionId={sessionId} />;
  return <LocationSignalPageDesktop sessionId={sessionId} />;
}
