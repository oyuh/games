import { mutators, queries } from "@games/shared";
import { useQuery, useZero } from "../lib/zero";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiLogIn, FiLogOut, FiSend, FiMapPin, FiHelpCircle } from "react-icons/fi";
import { PasswordHeader } from "../components/password/PasswordHeader";
import { InSessionModal } from "../components/shared/InSessionModal";
import { LobbyVisibilityToggle } from "../components/shared/LobbyVisibilityToggle";
import { SpectatorOverlay } from "../components/shared/SpectatorOverlay";
import { BorringAvatar } from "../components/shared/BorringAvatar";
import { usePresenceSocket } from "../hooks/usePresenceSocket";
import { addRecentGame, ensureName, leaveCurrentGame, SessionGameType } from "../lib/session";
import { showToast } from "../lib/toast";
import { useIsMobile } from "../hooks/useIsMobile";
import { callGameSecretInit, callGameSecretPreReveal } from "../lib/game-secrets";

import { MobileLocationSignalPage } from "../mobile/pages/MobileLocationSignalPage";
import { WorldMap, MapMarker } from "../components/location/WorldMap";
import { LocationDemo } from "../components/demos/LocationDemo";

type LocPhase = "lobby" | "picking" | "clue1" | "guess1" | "clue2" | "guess2" | "clue3" | "guess3" | "clue4" | "guess4" | "reveal" | "finished" | "ended";

const PLAYER_COLORS = ["#06d6a0","#7ecbff","#ef476f","#a78bfa","#fb923c","#38bdf8","#f472b6","#4ade80","#facc15","#34d399"];

function LocationSignalPageDesktop({ sessionId }: { sessionId: string }) {

  const zero = useZero();
  const navigate = useNavigate();
  const params = useParams();
  const gameId = params.id ?? "";
  const [games] = useQuery(queries.locationSignal.byId({ id: gameId }));
  const [sessions] = useQuery(queries.sessions.byGame({ gameType: "location_signal", gameId }));
  const [mySessionRows] = useQuery(queries.sessions.byId({ id: sessionId }));
  const game = games[0];

  const [draftClue, setDraftClue] = useState("");
  const [draftMarker, setDraftMarker] = useState<{ lat: number; lng: number } | null>(null);
  const [showDemo, setShowDemo] = useState(false);
  const [showInSessionModal, setShowInSessionModal] = useState(false);
  const [joiningFromOtherGame, setJoiningFromOtherGame] = useState(false);
  const prevAnnouncementRef = useRef<{ text: string; ts: number } | null>(null);

  usePresenceSocket({ sessionId, gameId, gameType: "location_signal" });

  const isHost = game?.host_id === sessionId;
  const me = useMemo(() => game?.players.find((p) => p.sessionId === sessionId), [game, sessionId]);
  const inGame = Boolean(me);
  const isLeader = game?.leader_id === sessionId;
  const isSpectator = useMemo(() => game?.spectators?.some((s) => s.sessionId === sessionId) ?? false, [game, sessionId]);
  const mySession = mySessionRows[0];
  const activeGameType = (mySession?.game_type ?? null) as SessionGameType | null;
  const activeGameId = mySession?.game_id ?? null;
  const inAnotherGame = Boolean(activeGameType && activeGameId && (activeGameType !== "location_signal" || activeGameId !== gameId));

  const inGameRef = useRef(inGame);
  const phaseRef = useRef(game?.phase);
  const isSpectatorRef = useRef(isSpectator);
  inGameRef.current = inGame;
  phaseRef.current = game?.phase;
  isSpectatorRef.current = isSpectator;

  useEffect(() => {
    if (isSpectator) showToast("You are a spectator", "info");
  }, [isSpectator]);

  useEffect(() => {
    let active = false;
    const timer = setTimeout(() => { active = true; }, 500);
    return () => {
      clearTimeout(timer);
      if (active && isSpectatorRef.current) {
        void zero.mutate(mutators.locationSignal.leave({ gameId, sessionId }));
      } else if (active && inGameRef.current && phaseRef.current !== "ended") {
        void zero.mutate(mutators.locationSignal.leave({ gameId, sessionId }));
      }
    };
  }, [gameId, sessionId, zero]);

  const sessionById = useMemo(() => {
    return sessions.reduce<Record<string, string>>((acc, s) => {
      acc[s.id] = s.name ?? s.id.slice(0, 6);
      return acc;
    }, {});
  }, [sessions]);

  const playerName = (id: string) => sessionById[id] ?? id.slice(0, 6);

  const myRoundGuess = useMemo(() => {
    if (!game) return null;
    const p = game.phase;
    const round = p.startsWith("guess") ? Number(p.replace("guess", "")) : 0;
    if (!round) return null;
    return game.guesses.find((g) => g.sessionId === sessionId && g.round === round) ?? null;
  }, [game, sessionId]);

  useEffect(() => {
    if (!game) return;
    addRecentGame({ id: game.id, code: game.code, gameType: "location_signal" });
  }, [game]);

  useEffect(() => {
    if (!game) return;
    if (game.phase === "ended") {
      showToast("The host ended the game", "info");
      navigate("/");
      return;
    }
    if (game.kicked.includes(sessionId)) {
      showToast("You were kicked from the game", "error");
      navigate("/");
    }
  }, [game?.phase, game?.kicked, sessionId, navigate]);

  useEffect(() => {
    if (!game?.announcement) return;
    const prev = prevAnnouncementRef.current;
    const cur = game.announcement;
    if (prev && prev.text === cur.text && Math.abs(cur.ts - prev.ts) < 3000) return;
    prevAnnouncementRef.current = cur;
    showToast(cur.text, "info");
  }, [game?.announcement]);

  useEffect(() => {
    setDraftClue("");
    // For guess rounds 2+, pre-populate draft marker with previous round's guess
    if (game) {
      const p = game.phase;
      const guessRound = p.startsWith("guess") ? Number(p.replace("guess", "")) : 0;
      if (guessRound > 1) {
        const prevGuess = game.guesses.find((g) => g.sessionId === sessionId && g.round === guessRound - 1);
        if (prevGuess) {
          setDraftMarker({ lat: prevGuess.lat, lng: prevGuess.lng });
          return;
        }
      }
    }
    setDraftMarker(null);
  }, [game?.settings.currentRound, game?.phase]);

  // Timer auto-advance
  useEffect(() => {
    if (!game) return;
    if (!isHost) return;
    const localCluePairs = (game.settings as { cluePairs?: number }).cluePairs ?? 2;
    const phaseEnd = game.settings.phaseEndsAt;
    if (!phaseEnd) return;
    const activePhases: string[] = ["clue1","guess1","clue2","guess2","clue3","guess3","clue4","guess4","reveal"];
    if (!activePhases.includes(game.phase)) return;
    const remaining = phaseEnd - Date.now();
    if (remaining <= 0) {
      if (game.phase.startsWith("guess") && Number(game.phase.replace("guess", "")) === localCluePairs) {
        void callGameSecretPreReveal("location_signal", gameId, sessionId)
          .then(() => zero.mutate(mutators.locationSignal.advanceTimer({ gameId })));
      } else {
        void zero.mutate(mutators.locationSignal.advanceTimer({ gameId }));
      }
      return;
    }
    const timer = setTimeout(() => {
      if (game.phase.startsWith("guess") && Number(game.phase.replace("guess", "")) === localCluePairs) {
        void callGameSecretPreReveal("location_signal", gameId, sessionId)
          .then(() => zero.mutate(mutators.locationSignal.advanceTimer({ gameId })));
      } else {
        void zero.mutate(mutators.locationSignal.advanceTimer({ gameId }));
      }
    }, remaining + 500);
    return () => clearTimeout(timer);
  }, [game, game?.settings.phaseEndsAt, game?.phase, gameId, zero, isHost, sessionId]);

  // Per-player color assignment (guessers only, stable by index)
  // Must be above the `if (!game)` guard so hook count is constant across renders
  const guesserColorMap = useMemo(() => {
    if (!game) return {};
    const guessers = game.players.filter((p) => p.sessionId !== game.leader_id);
    const map: Record<string, string> = {};
    guessers.forEach((p, i) => {
      map[p.sessionId] = PLAYER_COLORS[i % PLAYER_COLORS.length]!;
    });
    return map;
  }, [game]);

  useEffect(() => {
    if (game) return;
    const timer = setTimeout(() => navigate("/"), 3000);
    return () => clearTimeout(timer);
  }, [game, navigate]);

  if (!game) {
    return (
      <div className="game-page">
        <div className="game-empty">
          <p className="game-empty-title">Game not found</p>
          <p className="game-empty-sub">Redirecting home...</p>
          <button className="btn btn-primary" onClick={() => navigate("/")}>Go Home</button>
        </div>
      </div>
    );
  }

  const phase = game.phase as LocPhase;
  const leaderName = game.players.find((p) => p.sessionId === game.leader_id)?.name ?? game.leader_id?.slice(0, 6) ?? "---";
  const roundGuessers = game.players.filter((p) => p.sessionId !== game.leader_id);
  const guessesThisRound = (round: number) => game.guesses.filter((g) => g.round === round);
  const totalRounds = game.settings.roundsPerPlayer * game.players.length;
  const isGameActive = phase !== "lobby" && phase !== "finished" && phase !== "ended";
  const cluePairs = (game.settings as { cluePairs?: number }).cluePairs ?? 2;

  const currentClueRound = phase.startsWith("clue") ? Number(phase.replace("clue", "")) : 0;
  const currentGuessRound = phase.startsWith("guess") ? Number(phase.replace("guess", "")) : 0;
  const isCluePhase = currentClueRound > 0;
  const isGuessPhase = currentGuessRound > 0;
  const isLastGuessPhase = currentGuessRound === cluePairs;

  const getClue = (n: number): string | null => {
    if (n === 1) return game.clue1;
    if (n === 2) return game.clue2;
    if (n === 3) return (game as Record<string, unknown>).clue3 as string | null;
    if (n === 4) return (game as Record<string, unknown>).clue4 as string | null;
    return null;
  };

  const visibleClues = (upTo: number) => {
    const clues: { round: number; text: string }[] = [];
    for (let i = 1; i <= upTo; i++) {
      const c = getClue(i);
      if (c) clues.push({ round: i, text: c });
    }
    return clues;
  };

  const submitClue = async (event: FormEvent, round: number) => {
    event.preventDefault();
    if (!draftClue.trim() || !game) return;
    try {
      await zero.mutate(mutators.locationSignal.submitClue({
        gameId: game.id, sessionId, round: round as 1 | 2 | 3 | 4, text: draftClue.trim(),
      })).server;
      setDraftClue("");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Clue failed", "error");
    }
  };

  const submitGuess = async (round: number) => {
    if (!draftMarker || !game) return;
    try {
      await zero.mutate(mutators.locationSignal.submitGuess({
        gameId: game.id, sessionId, round: round as 1 | 2 | 3 | 4, lat: draftMarker.lat, lng: draftMarker.lng,
      })).server;
      showToast("Guess placed!", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Guess failed", "error");
    }
  };

  const buildMarkers = (): MapMarker[] => {
    const markers: MapMarker[] = [];

    // Draft marker (picking or guessing)
    if (draftMarker && (phase === "picking" || isGuessPhase)) {
      markers.push({ lat: draftMarker.lat, lng: draftMarker.lng, color: "#ef476f", label: "Your pick", size: 3.5, pulse: true });
    }

    // Leader always sees the target they placed
    if (isLeader && !game.encrypted_target && game.target_lat != null && game.target_lng != null && phase !== "picking" && phase !== "reveal") {
      markers.push({ lat: game.target_lat, lng: game.target_lng, color: "#ffd166", label: "Your Target", size: 3.5, ring: true });
    }

    // My locked-in guess for current round
    if (myRoundGuess && isGuessPhase) {
      markers.push({ lat: myRoundGuess.lat, lng: myRoundGuess.lng, color: guesserColorMap[sessionId] ?? "#06d6a0", label: "Your guess", size: 3, ring: true });
    }

    // Non-leader: show my own previous guesses at all times (clue + guess phases)
    if (!isLeader && isGameActive && phase !== "picking") {
      const maxVisible = isGuessPhase ? currentGuessRound : (isCluePhase ? currentClueRound : cluePairs);
      for (let r = 1; r <= maxVisible; r++) {
        const prev = game.guesses.find((g) => g.sessionId === sessionId && g.round === r);
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
  const mapClickable = (phase === "picking" && isLeader) || (isGuessPhase && !isLeader && inGame);
  const mapInteractive = true;

  const joinGame = () => {
    ensureName(zero, sessionId);
    void zero.mutate(mutators.locationSignal.join({ gameId: game.id, sessionId })).server.catch(() => showToast("Couldn't join", "error"));
  };

  const handleJoinClick = () => {
    if (inAnotherGame && activeGameType && activeGameId) {
      setJoiningFromOtherGame(true);
      void leaveCurrentGame(zero, sessionId, activeGameType, activeGameId)
        .catch(() => showToast("Couldn't leave current game", "error"))
        .finally(() => {
          setJoiningFromOtherGame(false);
          joinGame();
        });
      return;
    }
    joinGame();
  };

  const confirmLeaveAndJoin = () => {
    if (!activeGameType || !activeGameId) {
      setShowInSessionModal(false);
      joinGame();
      return;
    }
    setJoiningFromOtherGame(true);
    void leaveCurrentGame(zero, sessionId, activeGameType, activeGameId)
      .then(() => {
        setShowInSessionModal(false);
        joinGame();
      })
      .catch(() => showToast("Couldn't leave current game", "error"))
      .finally(() => setJoiningFromOtherGame(false));
  };

  const sortedPlayers = [...game.players].sort((a, b) => b.totalScore - a.totalScore);

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
              data-tooltip={`${name}${isCurrentLeader ? " — Leader 📍" : ""}${isLockedIn ? " — Locked in ✅" : ""}${isMe ? " (you)" : ""}\n${p.totalScore} pts`}
              data-tooltip-variant={isCurrentLeader ? "game" : isLockedIn ? "success" : "info"}
            >
              <div className={`game-player-avatar${isCurrentLeader ? " game-player-avatar--leader" : ""}`}>
                {isCurrentLeader ? "📍" : isLockedIn ? "✅" : (
                  <BorringAvatar
                    seed={p.sessionId}
                    playerIndex={playerIndex}
                  />
                )}
              </div>
              <span className="game-player-name">{name}</span>
              {isGameActive && <span className="badge" data-tooltip={`${name}'s score`} data-tooltip-variant="info" style={{ fontSize: "0.55rem" }}>{p.totalScore}</span>}
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
      <div className="locsig-map-wrap">
        <WorldMap
          height={520}
          {...(mapClickable ? { onClick: (coords: { lat: number; lng: number }) => setDraftMarker(coords) } : {})}
          interactive={mapInteractive}
          markers={buildMarkers()}
          coordsOverlay={draftMarker && mapClickable ? draftMarker : null}
        />
      </div>
    </div>
  );

  return (
    <div className="game-page locsig-page" data-game-theme="location">
      <PasswordHeader
        title="Location Signal"
        code={game.code}
        phase={game.phase}
        {...(isGameActive ? { currentRound: game.settings.currentRound } : {})}
        endsAt={game.settings.phaseEndsAt}
        isHost={isHost}
        isSpectator={isSpectator}
      />

      {/* ─── Players bar (always visible during game) ─── */}
      {isGameActive && renderPlayersBar()}

      {/* ─── Map (always visible during game) ─── */}
      {isGameActive && renderMap()}

      {/* ─── Lobby ─── */}
      {phase === "lobby" && (
        <>
          <div className="game-section">
            <h3 className="game-section-label">
              Players <span className="game-section-count">{game.players.length}</span>
            </h3>
            <div className="game-players-grid">
              {game.players.map((p, playerIndex) => {
                const name = playerName(p.sessionId);
                const isMe = p.sessionId === sessionId;
                return (
                  <div
                    key={p.sessionId}
                    className={`game-player-chip${isMe ? " game-player-chip--me" : ""}`}
                    data-tooltip={`${name}${isMe ? " (you)" : ""}`}
                    data-tooltip-variant="info"
                  >
                    <div className="game-player-avatar">
                      <BorringAvatar
                        seed={p.sessionId}
                        playerIndex={playerIndex}
                      />
                    </div>
                    <span className="game-player-name">{name}</span>
                    {isMe && <span className="game-player-you">you</span>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="game-section">
            <div className="locsig-map-wrap">
              <WorldMap
                height={520}
                interactive
                markers={draftMarker ? [{ lat: draftMarker.lat, lng: draftMarker.lng, color: "var(--primary)", label: "Preview", size: 2, ring: true }] : []}
                onClick={(coords) => setDraftMarker(coords)}
              />
            </div>
          </div>

          {!inGame && !isSpectator && (
            <div className="game-section game-join-prompt">
              <p className="game-join-text">You're not in this lobby yet.</p>
              <button className="btn btn-primary game-action-btn" data-tooltip="Join this game" data-tooltip-variant="info"
                onClick={handleJoinClick}>
                <FiLogIn size={16} /> Join Game
              </button>
            </div>
          )}

          {inGame && (
            <div className="game-actions" style={{ marginTop: "0.75rem" }}>
              {isHost && <LobbyVisibilityToggle gameType="location_signal" gameId={game.id} sessionId={sessionId} isPublic={game.is_public} />}
              {isHost ? (
                <button className="btn btn-primary game-action-btn" disabled={game.players.length < 2}
                  data-tooltip={game.players.length < 2 ? "Need at least 2 players to start" : "Start the game"} data-tooltip-variant="info"
                  onClick={() => void zero.mutate(mutators.locationSignal.start({ gameId: game.id, hostId: sessionId })).server.catch((e: unknown) => showToast(e instanceof Error ? e.message : "Start failed", "error"))}>
                  {game.players.length < 2
                    ? `Need ${2 - game.players.length} more player${2 - game.players.length > 1 ? "s" : ""}`
                    : "Start Game"}
                </button>
              ) : (
                <p className="game-waiting-text">Waiting for host to start...</p>
              )}
              <button className="btn btn-muted game-action-btn" data-tooltip="Leave this game" data-tooltip-variant="info"
                onClick={() => void zero.mutate(mutators.locationSignal.leave({ gameId: game.id, sessionId })).server}>
                <FiLogOut size={14} /> Leave
              </button>
            </div>
          )}
        </>
      )}

      {/* ─── Picking (leader) ─── */}
      {phase === "picking" && isLeader && (
        <div className="game-section locsig-clue-section">
          <div className="locsig-clue-leader-info">
            <h3>Pick your target location! 📍</h3>
            <p>Click anywhere on the map to place your target. Nobody else can see it.</p>
          </div>
          <div className="game-actions">
            <button className="btn btn-primary game-action-btn" disabled={!draftMarker}
              data-tooltip={draftMarker ? "Confirm this location as the target" : "Click the map first to pick a target"} data-tooltip-variant="info"
              onClick={() => draftMarker && void zero.mutate(mutators.locationSignal.setTarget({ gameId: game.id, sessionId, lat: draftMarker.lat, lng: draftMarker.lng })).server.then(() => callGameSecretInit("location_signal", game.id, sessionId))}>
              <FiMapPin size={14} /> Lock Target
            </button>
          </div>
        </div>
      )}

      {/* ─── Picking (non-leader) ─── */}
      {phase === "picking" && !isLeader && inGame && (
        <div className="game-section locsig-waiting-section">
          <div className="game-waiting">
            <div className="game-waiting-pulse" />
            <p><strong>{leaderName}</strong> is picking a location...</p>
          </div>
        </div>
      )}

      {/* ─── Clue phase (leader writes) ─── */}
      {isCluePhase && isLeader && (
        <div className="game-section locsig-clue-section">
          <div className="locsig-clue-leader-info">
            <h3>{currentClueRound === 1 ? "You are the Leader! 📍" : `Write clue ${currentClueRound}! 📍`}</h3>
            <p>{currentClueRound === 1 ? "Give a text clue to hint at the location — don't name it directly!" : "Help them narrow it down — you can see their previous guesses on the map!"}</p>
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
            <input className="input locsig-clue-input" autoFocus onFocus={(e) => e.currentTarget.select()} value={draftClue} onChange={(e) => setDraftClue(e.target.value)} placeholder={currentClueRound === 1 ? "e.g. Ancient empire..." : `Clue ${currentClueRound}...`} maxLength={80} />
            <button className="btn btn-primary" type="submit" disabled={!draftClue.trim()} data-tooltip="Submit this clue to the guessers" data-tooltip-variant="info">
              <FiSend size={14} /> Send
            </button>
          </form>
        </div>
      )}

      {/* ─── Clue phase (non-leader waits) ─── */}
      {isCluePhase && !isLeader && inGame && (
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
            <p><strong>{leaderName}</strong> is writing clue {currentClueRound}...</p>
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
            <p>Guessers are choosing... ({guessesThisRound(currentGuessRound).length}/{roundGuessers.length})</p>
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
                return sortedPlayers.filter((p) => p.sessionId !== game.leader_id).map((p) => {
                  const isMe = p.sessionId === sessionId;
                  const name = playerName(p.sessionId);
                  const roundPts = p.totalScore - (prevHistory?.scores[p.sessionId] ?? 0);
                  return (
                    <div key={p.sessionId} className="locsig-score-row" data-tooltip={`${name} — ${p.totalScore} pts`} data-tooltip-variant="info">
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
                <div key={p.sessionId} className={`locsig-final-row${i === 0 ? " locsig-final-row--winner" : ""}`} data-tooltip={`${name} — ${p.totalScore} pts`} data-tooltip-variant="info">
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
                  void zero.mutate(mutators.locationSignal.endGame({ gameId: game.id, hostId: sessionId }));
                  navigate("/");
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
          onLeave={() => void zero.mutate(mutators.locationSignal.leave({ gameId: game.id, sessionId })).server.then(() => navigate("/"))}
        />
      )}

      {/* ─── Not in game, game in progress ─── */}
      {!inGame && !isSpectator && isGameActive && (
        <div className="game-section">
          <div className="game-waiting">
            <div className="game-waiting-pulse" />
            <p>Game in progress — watching!</p>
          </div>
        </div>
      )}

      {showDemo && <LocationDemo onClose={() => setShowDemo(false)} />}

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
