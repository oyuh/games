import { queries, mutators } from "@games/shared";
import { useQuery, useZero } from "../../lib/zero";
import { useNavigate } from "react-router-dom";
import { FiUsers, FiGlobe } from "react-icons/fi";
import { addRecentGame, ensureName } from "../../lib/session";
import { showToast } from "../../lib/toast";
import { useState } from "react";

type GameType = "imposter" | "password" | "chain_reaction" | "shade_signal" | "location_signal";

/** Lightweight hook: just the count of public games for a given type. */
export function usePublicGameCount(gameType: GameType): number {
  const [imposter] = useQuery(queries.imposter.publicGames({}));
  const [password] = useQuery(queries.password.publicGames({}));
  const [chain] = useQuery(queries.chainReaction.publicGames({}));
  const [shade] = useQuery(queries.shadeSignal.publicGames({}));
  const [location] = useQuery(queries.locationSignal.publicGames({}));

  if (gameType === "imposter") return imposter.length;
  if (gameType === "password") return password.length;
  if (gameType === "chain_reaction") return chain.length;
  if (gameType === "shade_signal") return shade.length;
  return location.length;
}

const GAME_TYPE_ROUTES: Record<GameType, (id: string) => string> = {
  imposter: (id) => `/imposter/${id}`,
  password: (id) => `/password/${id}/begin`,
  chain_reaction: (id) => `/chain/${id}`,
  shade_signal: (id) => `/shade/${id}`,
  location_signal: (id) => `/location/${id}`,
};

const LOBBY_PHASES = new Set(["lobby"]);

function isLobby(phase: string) {
  return LOBBY_PHASES.has(phase);
}

interface NormalizedGame {
  id: string;
  code: string;
  phase: string;
  hostName: string | null;
  playerCount: number;
  spectatorCount: number;
  createdAt: number;
}

function usePublicGames(gameType: GameType): NormalizedGame[] {
  const [imposterGames] = useQuery(gameType === "imposter" ? queries.imposter.publicGames({}) : queries.imposter.publicGames({}));
  const [passwordGames] = useQuery(gameType === "password" ? queries.password.publicGames({}) : queries.password.publicGames({}));
  const [chainGames] = useQuery(gameType === "chain_reaction" ? queries.chainReaction.publicGames({}) : queries.chainReaction.publicGames({}));
  const [shadeGames] = useQuery(gameType === "shade_signal" ? queries.shadeSignal.publicGames({}) : queries.shadeSignal.publicGames({}));
  const [locationGames] = useQuery(gameType === "location_signal" ? queries.locationSignal.publicGames({}) : queries.locationSignal.publicGames({}));

  let games: NormalizedGame[] = [];

  if (gameType === "imposter") {
    games = imposterGames.map((g) => ({
      id: g.id, code: g.code, phase: g.phase,
      hostName: g.players.find((p) => p.sessionId === g.host_id)?.name ?? null,
      playerCount: g.players.length,
      spectatorCount: (g.spectators ?? []).length,
      createdAt: g.created_at,
    }));
  } else if (gameType === "password") {
    games = passwordGames.map((g) => ({
      id: g.id, code: g.code, phase: g.phase,
      hostName: null,
      playerCount: g.teams.reduce((sum, t) => sum + t.members.length, 0),
      spectatorCount: (g.spectators ?? []).length,
      createdAt: g.created_at,
    }));
  } else if (gameType === "chain_reaction") {
    games = chainGames.map((g) => ({
      id: g.id, code: g.code, phase: g.phase,
      hostName: g.players.find((p) => p.sessionId === g.host_id)?.name ?? null,
      playerCount: g.players.length,
      spectatorCount: (g.spectators ?? []).length,
      createdAt: g.created_at,
    }));
  } else if (gameType === "shade_signal") {
    games = shadeGames.map((g) => ({
      id: g.id, code: g.code, phase: g.phase,
      hostName: g.players.find((p) => p.sessionId === g.host_id)?.name ?? null,
      playerCount: g.players.length,
      spectatorCount: (g.spectators ?? []).length,
      createdAt: g.created_at,
    }));
  } else {
    games = locationGames.map((g) => ({
      id: g.id, code: g.code, phase: g.phase,
      hostName: g.players.find((p) => p.sessionId === g.host_id)?.name ?? null,
      playerCount: g.players.length,
      spectatorCount: (g.spectators ?? []).length,
      createdAt: g.created_at,
    }));
  }

  // Sort: lobby first, then newest first
  games.sort((a, b) => {
    const aLobby = isLobby(a.phase) ? 0 : 1;
    const bLobby = isLobby(b.phase) ? 0 : 1;
    if (aLobby !== bLobby) return aLobby - bLobby;
    return b.createdAt - a.createdAt;
  });

  return games;
}

/**
 * Inline public games list for a specific game type.
 * Renders inside a game card when browsing mode is active.
 */
export function PublicGamesList({
  gameType,
  sessionId,
}: {
  gameType: GameType;
  sessionId: string;
}) {
  const zero = useZero();
  const navigate = useNavigate();
  const [joining, setJoining] = useState<string | null>(null);
  const games = usePublicGames(gameType);

  const handleJoin = async (game: NormalizedGame) => {
    setJoining(game.id);
    ensureName(zero, sessionId);

    try {
      if (gameType === "imposter") {
        const result = await zero.mutate(mutators.imposter.join({ gameId: game.id, sessionId })).server;
        if (result.type === "error") { showToast(result.error.message, "error"); return; }
      } else if (gameType === "password") {
        const result = await zero.mutate(mutators.password.join({ gameId: game.id, sessionId })).server;
        if (result.type === "error") { showToast(result.error.message, "error"); return; }
      } else if (gameType === "chain_reaction") {
        const result = await zero.mutate(mutators.chainReaction.join({ gameId: game.id, sessionId })).server;
        if (result.type === "error") { showToast(result.error.message, "error"); return; }
      } else if (gameType === "shade_signal") {
        const result = await zero.mutate(mutators.shadeSignal.join({ gameId: game.id, sessionId })).server;
        if (result.type === "error") { showToast(result.error.message, "error"); return; }
      } else {
        const result = await zero.mutate(mutators.locationSignal.join({ gameId: game.id, sessionId })).server;
        if (result.type === "error") { showToast(result.error.message, "error"); return; }
      }
      addRecentGame({ id: game.id, code: game.code, gameType });
      navigate(GAME_TYPE_ROUTES[gameType](game.id));
    } catch {
      showToast("Failed to join game", "error");
    } finally {
      setJoining(null);
    }
  };

  if (games.length === 0) {
    return (
      <div className="pgb-empty-inline">
        <FiGlobe size={24} style={{ opacity: 0.25 }} />
        <p>No public games</p>
      </div>
    );
  }

  return (
    <div className="pgb-inline-list">
      {games.map((game) => (
        <button
          key={game.id}
          className="pgb-inline-card"
          onClick={() => void handleJoin(game)}
          disabled={joining !== null}
        >
          <div className="pgb-inline-card-top">
            <span className={`pgb-inline-phase${isLobby(game.phase) ? " pgb-inline-phase--lobby" : ""}`}>
              {game.phase}
            </span>
            <span className="pgb-inline-players">
              <FiUsers size={12} /> {game.playerCount}
              {game.spectatorCount > 0 && <> +{game.spectatorCount}</>}
            </span>
          </div>
          {game.hostName && <span className="pgb-inline-host">Host: {game.hostName}</span>}
          <span className="pgb-inline-action">
            {joining === game.id ? "Joining…" : isLobby(game.phase) ? "Join Game" : "Spectate"}
          </span>
        </button>
      ))}
    </div>
  );
}
