import { mutators, queries } from "@games/shared";
import { useQuery, useZero } from "../../lib/zero";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiLogIn, FiLogOut, FiSend, FiMapPin, FiClock } from "react-icons/fi";
import { MobileGameHeader } from "../components/MobileGameHeader";
import { MobileGameNotFound } from "../components/MobileGameNotFound";
import { BorringAvatar } from "../../components/shared/BorringAvatar";
import { InSessionModal } from "../../components/shared/InSessionModal";
import { LobbyVisibilityToggle } from "../../components/shared/LobbyVisibilityToggle";
import { MobileSpectatorBadge, MobileHostBadge } from "../../components/shared/SpectatorBadge";
import { MobileSpectatorOverlay } from "../../components/shared/SpectatorOverlay";
import { usePresenceSocket } from "../../hooks/usePresenceSocket";
import { useMobileHostRegister } from "../../lib/mobile-host-context";
import { addRecentGame, ensureName, leaveCurrentGame, SessionGameType } from "../../lib/session";
import { showToast } from "../../lib/toast";
import { callGameSecretInit, callGameSecretPreReveal } from "../../lib/game-secrets";

import { WorldMap, MapMarker } from "../../components/location/WorldMap";
import { useGameSounds, playSoundSubmit } from "../../hooks/useGameSounds";

type LocPhase = "lobby" | "picking" | "clue1" | "guess1" | "clue2" | "guess2" | "clue3" | "guess3" | "clue4" | "guess4" | "reveal" | "finished" | "ended";

const phaseLabels: Record<LocPhase, string> = {
  lobby: "Lobby", picking: "Picking",
  clue1: "Clue 1", guess1: "Guess 1", clue2: "Clue 2", guess2: "Guess 2",
  clue3: "Clue 3", guess3: "Guess 3", clue4: "Clue 4", guess4: "Guess 4",
  reveal: "Reveal", finished: "Finished", ended: "Ended",
};

const PLAYER_COLORS = ["#06d6a0","#7ecbff","#ef476f","#a78bfa","#fb923c","#38bdf8","#f472b6","#4ade80","#facc15","#34d399"];

/** Compute center + zoom that fits all points in the map viewport */
function fitBounds(
  points: { lat: number; lng: number }[],
  mapWidth: number,
  mapHeight: number,
  padding = 0.25,
): { center: [number, number]; zoom: number } {
  if (points.length === 0) return { center: [25, 10], zoom: 2 };
  const first = points[0];
  if (points.length === 1 && first) return { center: [first.lat, first.lng] as [number, number], zoom: 5 };
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = Math.max((maxLat - minLat) * (1 + padding * 2), 0.01);
  const lngSpan = Math.max((maxLng - minLng) * (1 + padding * 2), 0.01);
  const latZoom = Math.log2((mapHeight / 256) * (180 / latSpan));
  const lngZoom = Math.log2((mapWidth / 256) * (360 / lngSpan));
  return {
    center: [(minLat + maxLat) / 2, (minLng + maxLng) / 2],
    zoom: Math.max(2, Math.min(14, Math.floor(Math.min(latZoom, lngZoom)))),
  };
}

export function MobileLocationSignalPage({ sessionId }: { sessionId: string }) {
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
  const [showInSessionModal, setShowInSessionModal] = useState(false);
  const [joiningFromOtherGame, setJoiningFromOtherGame] = useState(false);
  const prevAnnouncementRef = useRef<{ text: string; ts: number } | null>(null);

  // Controlled map state for auto-zoom/pan
  const [leaderTarget, setLeaderTarget] = useState<{ lat: number; lng: number } | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([25, 10]);
  const [mapZoom, setMapZoom] = useState(2);
  const mapWrapRef = useRef<HTMLDivElement>(null);
  const handleBoundsChanged = useCallback(({ center, zoom }: { center: [number, number]; zoom: number }) => {
    setMapCenter(center);
    setMapZoom(zoom);
  }, []);

  usePresenceSocket({ sessionId, gameId, gameType: "location_signal" });

  const isHost = game?.host_id === sessionId;
  const me = useMemo(() => game?.players.find((p) => p.sessionId === sessionId), [game, sessionId]);
  const inGame = Boolean(me);
  const isLeader = game?.leader_id === sessionId;

  useGameSounds({
    phase: game?.phase,
    sessionId,
    isMyTurn: Boolean(inGame && (
      (isLeader && (game?.phase === "picking" || game?.phase?.startsWith("clue"))) ||
      (!isLeader && game?.phase?.startsWith("guess"))
    )),
    phaseEndsAt: game?.settings.phaseEndsAt,
  });

  const isSpectator = useMemo(() => game?.spectators?.some((s) => s.sessionId === sessionId) ?? false, [game, sessionId]);
  const mySession = mySessionRows[0];
  const activeGameType = (mySession?.game_type ?? null) as SessionGameType | null;
  const activeGameId = mySession?.game_id ?? null;
  const inAnotherGame = Boolean(activeGameType && activeGameId && (activeGameType !== "location_signal" || activeGameId !== gameId));

  const sessionById = useMemo(() => {
    return sessions.reduce<Record<string, string>>((acc, s) => {
      acc[s.id] = s.name ?? s.id.slice(0, 6);
      return acc;
    }, {});
  }, [sessions]);

  const playerName = (id: string) => sessionById[id] ?? id.slice(0, 6);

  // Register host context for MobileHostControlsSheet
  useMobileHostRegister(
    isHost && game
      ? { type: "location_signal", gameId, hostId: game.host_id,
          players: game.players.map((p) => ({ sessionId: p.sessionId, name: sessionById[p.sessionId] ?? null })),
          spectators: game.spectators ?? [] }
      : null
  );

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

  const myRoundGuess = useMemo(() => {
    if (!game) return null;
    const p = game.phase;
    const round = p.startsWith("guess") ? Number(p.replace("guess", "")) : 0;
    if (!round) return null;
    return game.guesses.find((g) => g.sessionId === sessionId && g.round === round) ?? null;
  }, [game, sessionId]);

  // Countdown timer
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  useEffect(() => {
    const endsAt = game?.settings.phaseEndsAt;
    if (!endsAt) { setTimeLeft(null); return; }
    const tick = () => setTimeLeft(Math.max(0, Math.floor((endsAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [game?.settings.phaseEndsAt]);

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

  // Reset leader target on round change
  useEffect(() => {
    setLeaderTarget(null);
  }, [game?.settings.currentRound]);

  // Auto-zoom map on phase transitions
  const autoZoomKeyRef = useRef("");
  useEffect(() => {
    if (!game) return;
    const p = game.phase;
    const tgtReady = p === "reveal" && game.target_lat != null;
    const key = `${p}-${game.settings.currentRound}${tgtReady ? "-t" : ""}`;
    if (autoZoomKeyRef.current === key) return;
    autoZoomKeyRef.current = key;

    const mapW = mapWrapRef.current?.clientWidth ?? 400;
    const mapH = 300;

    if (p === "reveal") {
      const pts: { lat: number; lng: number }[] = [];
      if (game.target_lat != null && game.target_lng != null) {
        pts.push({ lat: game.target_lat, lng: game.target_lng });
      } else if (leaderTarget) {
        pts.push(leaderTarget);
      }
      const maxR = game.guesses.length > 0 ? Math.max(...game.guesses.map((g) => g.round)) : 1;
      for (const g of game.guesses.filter((gg) => gg.round === maxR)) {
        pts.push({ lat: g.lat, lng: g.lng });
      }
      if (pts.length > 0) {
        const f = fitBounds(pts, mapW, mapH);
        setMapCenter(f.center);
        setMapZoom(f.zoom);
      }
      return;
    }

    if (p === "picking") {
      setMapCenter([25, 10]);
      setMapZoom(2);
      return;
    }

    if (isLeader && leaderTarget) {
      const cc = p.startsWith("clue") ? Number(p.replace("clue", "")) : 0;
      const cg = p.startsWith("guess") ? Number(p.replace("guess", "")) : 0;
      if (cc > 1 || cg > 1) {
        const pts: { lat: number; lng: number }[] = [leaderTarget];
        const upTo = cg > 1 ? cg - 1 : cc - 1;
        for (let r = 1; r <= upTo; r++) {
          for (const g of game.guesses.filter((gg) => gg.round === r)) pts.push({ lat: g.lat, lng: g.lng });
        }
        const f = fitBounds(pts, mapW, mapH);
        setMapCenter(f.center);
        setMapZoom(f.zoom);
      } else if (cc === 1) {
        setMapCenter([leaderTarget.lat, leaderTarget.lng]);
        setMapZoom(6);
      } else if (cg === 1) {
        setMapCenter([leaderTarget.lat, leaderTarget.lng]);
        setMapZoom(3);
      }
      return;
    }

    if (!isLeader && inGame && p.startsWith("guess")) {
      const gr = Number(p.replace("guess", ""));
      if (gr > 1) {
        const prev = game.guesses.find((g) => g.sessionId === sessionId && g.round === gr - 1);
        if (prev) {
          setMapCenter([prev.lat, prev.lng]);
          setMapZoom(5);
        }
      }
    }
  }, [game?.phase, game?.settings.currentRound, game?.target_lat, isLeader, leaderTarget, inGame, sessionId]);

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

  // Per-player color assignment — must be above `if (!game)` so hook count is constant
  const guesserColorMap = useMemo(() => {
    if (!game) return {};
    const guessers = game.players.filter((p) => p.sessionId !== game.leader_id);
    const map: Record<string, string> = {};
    guessers.forEach((p, i) => {
      map[p.sessionId] = PLAYER_COLORS[i % PLAYER_COLORS.length]!;
    });
    return map;
  }, [game]);

  if (!game) return <MobileGameNotFound theme="location" />;

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
      playSoundSubmit();
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
      playSoundSubmit();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Guess failed", "error");
    }
  };

  const buildMarkers = (): MapMarker[] => {
    const markers: MapMarker[] = [];
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
        const prev = game.guesses.find((g) => g.sessionId === sessionId && g.round === r);
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
          hideLabel: !isLatest,
        });
      }
    }
    return markers;
  };

  const mapClickable = (phase === "picking" && isLeader) || (isGuessPhase && !isLeader && inGame);
  const mapInteractive = mapClickable || (isLeader && isGameActive) || phase === "reveal";

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
          <div className="m-players-row">
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
                      <BorringAvatar
                        seed={p.sessionId}
                        playerIndex={playerIndex}
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
        <div className="m-card" style={{ padding: "0.5rem" }}>
          <div ref={mapWrapRef} style={{ borderRadius: "var(--radius)", overflow: "hidden", border: "1px solid var(--border)" }}>
            <WorldMap
              height={300}
              {...(mapClickable ? { onClick: (coords: { lat: number; lng: number }) => setDraftMarker(coords) } : {})}
              interactive={mapInteractive}
              markers={buildMarkers()}
              coordsOverlay={draftMarker && mapClickable ? draftMarker : null}
              center={mapCenter}
              zoom={mapZoom}
              onBoundsChanged={handleBoundsChanged}
            />
          </div>
        </div>
      )}

      {/* Lobby */}
      {phase === "lobby" && (
        <div className="m-section">
          <h3 className="m-label">Players <span className="m-badge-small">{game.players.length}</span></h3>
          <div className="m-players-row">
            {game.players.map((p, playerIndex) => {
              const name = playerName(p.sessionId);
              const isMe = p.sessionId === sessionId;
              return (
                <div key={p.sessionId} className={`m-player-chip${isMe ? " m-player-chip--me" : ""}`}>
                  <div className="m-player-avatar">
                    <BorringAvatar
                      seed={p.sessionId}
                      playerIndex={playerIndex}
                    />
                  </div>
                  <span className="m-player-name">{name}</span>
                  {isMe && <span className="m-badge-small m-badge-small--you">you</span>}
                </div>
              );
            })}
          </div>

          <div className="m-card" style={{ padding: "0.5rem" }}>
            <div style={{ borderRadius: "var(--radius)", overflow: "hidden", border: "1px solid var(--border)" }}>
              <WorldMap
                height={240}
                interactive
                markers={draftMarker ? [{ lat: draftMarker.lat, lng: draftMarker.lng, color: "var(--primary)", label: "Preview", size: 2, ring: true }] : []}
                onClick={(coords) => setDraftMarker(coords)}
              />
            </div>
          </div>

          {!inGame && !isSpectator && (
            <div className="m-actions" style={{ marginTop: "0.5rem" }}>
              <p className="m-text-muted m-text-center">You're not in this lobby yet.</p>
              <button className="m-btn m-btn-primary" onClick={handleJoinClick}>
                <FiLogIn size={16} /> Join Game
              </button>
            </div>
          )}

          {inGame && (
            <div className="m-actions" style={{ marginTop: "0.5rem" }}>
              {isHost && (
                <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
                  <LobbyVisibilityToggle gameType="location_signal" gameId={game.id} sessionId={sessionId} isPublic={game.is_public} />
                </div>
              )}
              {isHost ? (
                <button className="m-btn m-btn-primary" disabled={game.players.length < 2}
                  onClick={() => void zero.mutate(mutators.locationSignal.start({ gameId: game.id, hostId: sessionId })).server.catch((e: unknown) => showToast(e instanceof Error ? e.message : "Start failed", "error"))}>
                  {game.players.length < 2 ? `Need ${2 - game.players.length} more` : "Start Game"}
                </button>
              ) : (
                <p className="m-text-muted m-text-center">Waiting for host to start...</p>
              )}
              <button className="m-btn m-btn-muted"
                onClick={() => void zero.mutate(mutators.locationSignal.leave({ gameId: game.id, sessionId })).server}>
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
          <div className="m-actions">
            <button className="m-btn m-btn-primary" disabled={!draftMarker}
              onClick={() => {
                if (!draftMarker) return;
                setLeaderTarget({ lat: draftMarker.lat, lng: draftMarker.lng });
                void zero.mutate(mutators.locationSignal.setTarget({ gameId: game.id, sessionId, lat: draftMarker.lat, lng: draftMarker.lng }))
                  .server.then(() => callGameSecretInit("location_signal", game.id, sessionId));
              }}>
              <FiMapPin size={14} /> Lock Target
            </button>
          </div>
        </div>
      )}

      {/* Picking (non-leader) */}
      {phase === "picking" && !isLeader && inGame && (
        <div className="m-section">
          <div className="m-waiting">
            <div className="m-pulse" />
            <p><strong>{leaderName}</strong> is picking a location...</p>
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
            <input className="m-input" autoFocus onFocus={(e) => e.currentTarget.select()} value={draftClue} onChange={(e) => setDraftClue(e.target.value)} placeholder={currentClueRound === 1 ? "e.g. Ancient empire..." : `Clue ${currentClueRound}...`} maxLength={80} />
            <button className="m-btn m-btn-primary" type="submit" disabled={!draftClue.trim()}>
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
            <p><strong>{leaderName}</strong> is writing clue {currentClueRound}...</p>
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
          <div className="m-actions">
            <button className="m-btn m-btn-primary" disabled={!draftMarker} onClick={() => void submitGuess(currentGuessRound)}>
              <FiMapPin size={14} /> {myRoundGuess ? "Update Guess" : isLastGuessPhase ? "Place Final Guess" : "Place Guess"}
            </button>
          </div>
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
            <p>Guessers are choosing... ({guessesThisRound(currentGuessRound).length}/{roundGuessers.length})</p>
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
          <div className="m-shade-score-table">
            <h4 className="m-label">Round {game.settings.currentRound} Scores</h4>
            {(() => {
              const prevHistory = game.round_history.length > 1 ? game.round_history[game.round_history.length - 2] : null;
              return sortedPlayers.filter((p) => p.sessionId !== game.leader_id).map((p) => {
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
          <div className="m-actions" style={{ marginTop: "0.5rem" }}>
            {isHost ? (
              <>
                <button className="m-btn m-btn-primary"
                  onClick={() => void zero.mutate(mutators.locationSignal.resetToLobby({ gameId: game.id, hostId: sessionId }))}>
                  Play Again
                </button>
                <button className="m-btn m-btn-muted" onClick={() => {
                  void zero.mutate(mutators.locationSignal.endGame({ gameId: game.id, hostId: sessionId }));
                  navigate("/");
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
          onLeave={() => void zero.mutate(mutators.locationSignal.leave({ gameId: game.id, sessionId })).server.then(() => navigate("/"))}
        />
      )}

      {/* Not in game */}
      {!inGame && !isSpectator && isGameActive && (
        <div className="m-section">
          <div className="m-waiting">
            <div className="m-pulse" />
            <p>Game in progress — watching!</p>
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
