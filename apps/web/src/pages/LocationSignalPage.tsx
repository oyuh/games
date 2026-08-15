import { mutators } from "@games/shared";
import { optimistic } from "../lib/zero";
import "../styles/game-shared.css";
import "../styles/location-signal.css";
import { useState } from "react";
import { FiClock, FiEye, FiMapPin } from "react-icons/fi";
import { GameShellHeader } from "../components/shared/GameShellHeader";
import { LocationLobby, locationPhases, locationTrackPhase } from "../components/location/LocationLobby";
import { LocationClue, LocationGameOver, LocationGuess, LocationPickClue, LocationResult } from "../components/location/LocationRound";
import { GameEmpty, GamePanel } from "../components/shared/GameKit";
import { GameRoster } from "../components/shared/GameRoster";
import { callGameSecretInit } from "../lib/game-secrets";
import { InSessionModal } from "../components/shared/InSessionModal";
import { LobbyVisibilityToggle } from "../components/shared/LobbyVisibilityToggle";
import { SpectatorOverlay } from "../components/shared/SpectatorOverlay";
import { showToast } from "../lib/toast";
import { useIsMobile } from "../hooks/useIsMobile";

import { MobileLocationSignalPage } from "../mobile/pages/MobileLocationSignalPage";
import { useLocationSignalGame } from "../hooks/useLocationSignalGame";

/**
 * Location Signal, assembled out of the game kit. Every phase is a component
 * with its own states, all of them visible at /dev/location, so this file is
 * only the wiring: who you are this round, and which mutator a button reaches
 * for. Every phase brings its own map, so the page draws none of its own.
 */
function LocationSignalPageDesktop({ sessionId }: { sessionId: string }) {
  /* Held while a mutator is in the air, so nothing can be pressed twice into
     two of the same thing. */
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);

  /* Which clock they want. On the map by default, since the time matters most
     next to the thing being timed, but it is their screen. Remembered, because
     somebody who moved it once did not mean "just for this round". */
  const [clockOnMap, setClockOnMap] = useState(() => localStorage.getItem("locsig-clock") !== "header");
  const moveClock = (onMap: boolean) => {
    setClockOnMap(onMap);
    localStorage.setItem("locsig-clock", onMap ? "map" : "header");
  };

  const {
    zero, navigate, gameId, game, me, isHost, isLeader, inGame, isSpectator,
    sessionById, playerName, myRoundGuess, guesserColorMap,
    draftClue, setDraftClue, draftMarker, setDraftMarker,
    leaderTarget, setLeaderTarget,
    activeGameType, showInSessionModal, setShowInSessionModal, joiningFromOtherGame,
    phase, cluePairs, currentClueRound, currentGuessRound,
    isCluePhase, isGuessPhase, isGameActive,
    leaderName, roundGuessers, guessesThisRound, totalRounds, visibleClues,
    submitClue, submitGuess, handleJoinClick, confirmLeaveAndJoin,
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

  /* The place, once it is allowed out. Encrypted until the host's pre-reveal
     call has run, so an empty one means the scores are still being worked out
     rather than that there was never a target. */
  const revealTarget = !game.encrypted_target && game.target_lat != null && game.target_lng != null
    ? { lat: game.target_lat, lng: game.target_lng }
    : null;

  /* The one that counted. The mutator scores whichever round a player got
     furthest into, so this picks the same one it did. */
  const finalGuesses = new Map<string, { lat: number; lng: number; round: number }>();
  for (const guess of game.guesses) {
    const held = finalGuesses.get(guess.sessionId);
    if (!held || guess.round > held.round) finalGuesses.set(guess.sessionId, guess);
  }

  /* Where you went on the clue before this one, so a second guess can offer to
     leave you there rather than making you find it on the map again. */
  const previousGuess = currentGuessRound > 1
    ? game.guesses.find((g) => g.sessionId === sessionId && g.round === currentGuessRound - 1)
    : undefined;
  const myPreviousGuess = previousGuess ? { lat: previousGuess.lat, lng: previousGuess.lng } : null;

  /* Dropping the pin and writing the first clue are one screen. The server
     still runs them as `picking` then `clue1`, so both land here. */
  const pickClue = phase === "picking" || phase === "clue1";
  const pickedTarget = draftMarker ?? leaderTarget;

  /* Every phase brings its own map now, so the page has none of its own. */
  const onStage = isGameActive && !isSpectator;
  const clockProps = clockOnMap
    ? { endsAt: game.settings.phaseEndsAt, onHideClock: () => moveClock(false) }
    : { endsAt: null };

  return (
    <div className="game-page locsig-page" data-game-theme="location">
      <GameShellHeader
        collapsible
        game="location"
        title="Location Signal"
        phases={locationPhases(cluePairs)}
        phase={locationTrackPhase(game.phase)}
        code={game.code}
        /* One clock, in whichever of the two places they asked for. Two of them
           counting down the same phase is one too many. */
        endsAt={onStage && clockOnMap ? null : game.settings.phaseEndsAt}
        {...(onStage && !clockOnMap
          ? { timerMove: { label: "Put the clock back on the map", icon: <FiMapPin />, onClick: () => moveClock(true) } }
          : {})}
        isHost={isHost}
        isSpectator={isSpectator}
        {...(isCluePhase ? { duration: game.settings.clueDurationSec } : {})}
        {...(isGuessPhase ? { duration: game.settings.guessDurationSec } : {})}
        {...(isGameActive && totalRounds > 0
          ? { round: { current: game.settings.currentRound, total: totalRounds } }
          : {})}
      />

      {/* Who is in and what they are on, out of the kit. The phase below says
          who is doing what right now, so this is only the running total. */}
      {isGameActive && phase !== "finished" && (
        <GameRoster
          size="sm"
          label="Players"
          players={game.players.map((player, index) => ({
            sessionId: player.sessionId,
            name: playerName(player.sessionId),
            index,
            points: player.totalScore,
            pointsSuffix: "pts",
            ...(player.sessionId === game.leader_id ? { caption: "Leading" } : {}),
            ...(player.sessionId === sessionId ? { you: true } : {}),
          }))}
        />
      )}

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
          {...clockProps}
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

      {/* ─── The clues after the first ─── */}
      {isCluePhase && !pickClue && !isSpectator && (
        <LocationClue
          round={currentClueRound}
          isLeader={isLeader}
          leader={{ sessionId: game.leader_id ?? "", name: leaderName }}
          {...(isLeader && leaderTarget ? { target: leaderTarget } : {})}
          clues={visibleClues(currentClueRound - 1)}
          {...(isLeader
            ? {
                guesses: guessesThisRound(currentClueRound - 1).map((guess) => ({
                  sessionId: guess.sessionId,
                  name: playerName(guess.sessionId),
                  lat: guess.lat,
                  lng: guess.lng,
                })),
              }
            : {})}
          value={draftClue}
          submitting={sending}
          {...clockProps}
          duration={game.settings.clueDurationSec}
          onChange={setDraftClue}
          onSubmit={(event) => {
            setSending(true);
            void submitClue(event, currentClueRound).finally(() => setSending(false));
          }}
        />
      )}

      {/* ─── Guessing ─── */}
      {isGuessPhase && !isSpectator && (
        <LocationGuess
          round={currentGuessRound}
          isGuessing={inGame && !isLeader}
          leader={{ sessionId: game.leader_id ?? "", name: leaderName }}
          clues={visibleClues(currentGuessRound)}
          /* Only the leader is handed the answer. */
          {...(isLeader && leaderTarget ? { target: leaderTarget } : {})}
          {...(isLeader
            ? {
                others: guessesThisRound(currentGuessRound).map((g) => ({
                  lat: g.lat,
                  lng: g.lng,
                  color: guesserColorMap[g.sessionId] ?? "#7ecbff",
                  /* Their face on the map, their name on the hover. Six pins
                     with six name tags is six tags overlapping each other. */
                  avatar: g.sessionId,
                  label: playerName(g.sessionId),
                  size: 2.5,
                  ring: true,
                })),
              }
            : {})}
          selected={draftMarker ?? (myRoundGuess ? { lat: myRoundGuess.lat, lng: myRoundGuess.lng } : null)}
          locked={!!myRoundGuess}
          submitting={sending}
          {...(myPreviousGuess ? { previous: myPreviousGuess, onKeep: () => setDraftMarker(myPreviousGuess) } : {})}
          lockedCount={guessesThisRound(currentGuessRound).length}
          guesserCount={roundGuessers.length}
          {...clockProps}
          duration={game.settings.guessDurationSec}
          onSelect={setDraftMarker}
          onLock={() => {
            setSending(true);
            void submitGuess(currentGuessRound).finally(() => setSending(false));
          }}
        />
      )}

      {/* ─── The round result ─── */}
      {phase === "reveal" && !isSpectator && (
        revealTarget ? (
          <LocationResult
            target={revealTarget}
            clues={visibleClues(cluePairs)}
            leader={{
              sessionId: game.leader_id ?? "",
              name: leaderName,
              ...(isLeader ? { you: true } : {}),
            }}
            players={roundGuessers.map((player) => {
              const finalGuess = finalGuesses.get(player.sessionId);
              return {
                sessionId: player.sessionId,
                name: playerName(player.sessionId),
                ...(finalGuess ? { guess: { lat: finalGuess.lat, lng: finalGuess.lng } } : {}),
                ...(player.sessionId === sessionId ? { you: true } : {}),
              };
            })}
            last={game.settings.currentRound >= totalRounds}
            {...clockProps}
            duration={10}
          />
        ) : (
          <GamePanel>
            <GameEmpty icon={<FiClock />} title="Working out the scores" hint="The map comes back in a second with everybody on it." />
          </GamePanel>
        )
      )}

      {/* ─── The end ─── */}
      {phase === "finished" && !isSpectator && (
        <LocationGameOver
          isHost={isHost}
          players={game.players.map((player) => ({
            sessionId: player.sessionId,
            name: playerName(player.sessionId),
            score: player.totalScore,
            ...(player.sessionId === sessionId ? { you: true } : {}),
          }))}
          rounds={game.round_history.map((entry) => ({
            round: entry.round,
            leaderId: entry.leaderId ?? "",
            leaderName: playerName(entry.leaderId ?? ""),
            ...(entry.target ? { target: entry.target } : {}),
            clues: [entry.clue1, entry.clue2, entry.clue3, entry.clue4]
              .map((text, index) => ({ round: index + 1, text }))
              .filter((clue): clue is { round: number; text: string } => !!clue.text),
            guesses: entry.guesses.map((guess) => ({
              sessionId: guess.sessionId,
              name: playerName(guess.sessionId),
              round: guess.round,
              lat: guess.lat,
              lng: guess.lng,
              ...(guess.sessionId === sessionId ? { you: true } : {}),
            })),
          }))}
          onPlayAgain={() =>
            void zero.mutate(mutators.locationSignal.resetToLobby({ gameId, hostId: sessionId }))
              .client.catch(() => showToast("Couldn't run it back", "error"))
          }
          onEnd={() => {
            void zero.mutate(mutators.locationSignal.endGame({ gameId, hostId: sessionId }))
              .client.then(() => navigate("/"))
              .catch(() => showToast("Couldn't end game", "error"));
          }}
          onHome={() => navigate("/")}
        />
      )}

      {/* ─── Spectator overlay ─── */}
      {isSpectator && phase !== "lobby" && (
        <SpectatorOverlay
          playerCount={game.players.length}
          phase={game.phase}
          onLeave={() => void optimistic(zero.mutate(mutators.locationSignal.leave({ gameId: game.id, sessionId }))).then(() => navigate("/"))}
        />
      )}

      {/* Somebody who followed a link into a round already running. They see
          the board above but have nothing to do with it until the next one. */}
      {!inGame && !isSpectator && isGameActive && (
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

export function LocationSignalPage({ sessionId }: { sessionId: string }) {
  const isMobile = useIsMobile();
  if (isMobile) return <MobileLocationSignalPage sessionId={sessionId} />;
  return <LocationSignalPageDesktop sessionId={sessionId} />;
}
