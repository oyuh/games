import { queries, mutators } from "@games/shared";
import { optimistic, useQuery, useZero } from "../../lib/zero";
import { useNavigate } from "react-router-dom";
import { FiEye, FiGlobe, FiPlus, FiUsers } from "react-icons/fi";
import { addRecentGame, ensureName } from "../../lib/session";
import { showToast } from "../../lib/toast";
import { useState } from "react";
import { useScrollEdges } from "../../hooks/useScrollEdges";
import { Button } from "./Button";
import { PlayerAvatar } from "./PlayerAvatar";

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
  hostId: string;
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
      id: g.id, code: g.code, phase: g.phase, hostId: g.host_id,
      hostName: g.players.find((p) => p.sessionId === g.host_id)?.name ?? null,
      playerCount: g.players.length,
      spectatorCount: (g.spectators ?? []).length,
      createdAt: g.created_at,
    }));
  } else if (gameType === "password") {
    games = passwordGames.map((g) => ({
      id: g.id, code: g.code, phase: g.phase, hostId: g.host_id,
      hostName: null,
      playerCount: g.teams.reduce((sum, t) => sum + t.members.length, 0),
      spectatorCount: (g.spectators ?? []).length,
      createdAt: g.created_at,
    }));
  } else if (gameType === "chain_reaction") {
    games = chainGames.map((g) => ({
      id: g.id, code: g.code, phase: g.phase, hostId: g.host_id,
      hostName: g.players.find((p) => p.sessionId === g.host_id)?.name ?? null,
      playerCount: g.players.length,
      spectatorCount: (g.spectators ?? []).length,
      createdAt: g.created_at,
    }));
  } else if (gameType === "shade_signal") {
    games = shadeGames.map((g) => ({
      id: g.id, code: g.code, phase: g.phase, hostId: g.host_id,
      hostName: g.players.find((p) => p.sessionId === g.host_id)?.name ?? null,
      playerCount: g.players.length,
      spectatorCount: (g.spectators ?? []).length,
      createdAt: g.created_at,
    }));
  } else {
    games = locationGames.map((g) => ({
      id: g.id, code: g.code, phase: g.phase, hostId: g.host_id,
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
  onCreate,
}: {
  gameType: GameType;
  sessionId: string;
  /** Offered from the empty state, so there is somewhere to go from nothing. */
  onCreate?: () => void;
}) {
  const zero = useZero();
  const navigate = useNavigate();
  const [joining, setJoining] = useState<string | null>(null);
  const games = usePublicGames(gameType);
  /* Which edges have rows hidden past them, for the fades, and how many rows
     are still below the fold, for the count. */
  const { below, fadeProps } = useScrollEdges<HTMLUListElement>([games.length]);

  const handleJoin = async (game: NormalizedGame) => {
    setJoining(game.id);

    try {
      await ensureName(zero, sessionId);
      if (gameType === "imposter") {
        const result = await optimistic(zero.mutate(mutators.imposter.join({ gameId: game.id, sessionId })));
        if (result.type === "error") { showToast(result.error.message, "error"); return; }
      } else if (gameType === "password") {
        const result = await optimistic(zero.mutate(mutators.password.join({ gameId: game.id, sessionId })));
        if (result.type === "error") { showToast(result.error.message, "error"); return; }
      } else if (gameType === "chain_reaction") {
        const result = await optimistic(zero.mutate(mutators.chainReaction.join({ gameId: game.id, sessionId })));
        if (result.type === "error") { showToast(result.error.message, "error"); return; }
      } else if (gameType === "shade_signal") {
        const result = await optimistic(zero.mutate(mutators.shadeSignal.join({ gameId: game.id, sessionId })));
        if (result.type === "error") { showToast(result.error.message, "error"); return; }
      } else {
        const result = await optimistic(zero.mutate(mutators.locationSignal.join({ gameId: game.id, sessionId })));
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
      <div className="pgb pgb--empty">
        <span className="pgb-empty-icon" aria-hidden="true"><FiGlobe /></span>
        <p className="pgb-empty-title">No public games right now</p>
        <p className="pgb-empty-text">Host one and set it to public from the lobby, and it shows up here.</p>
        {onCreate && (
          <Button size="sm" variant="link" icon={<FiPlus />} onClick={onCreate}>Create a game</Button>
        )}
      </div>
    );
  }

  return (
    <div className="pgb">
      <ul className="pgb-list hc-fade-list" {...fadeProps}>
        {games.map((game) => {
          const lobby = isLobby(game.phase);
          const title = game.hostName ?? `Room ${game.code}`;

          return (
            <li key={game.id} className="pgb-row">
              <PlayerAvatar seed={game.hostId} size={32} />
              <div className="pgb-info">
                <span className="pgb-host">{title}</span>
                <span className="pgb-meta">
                  <span className={`pgb-status${lobby ? " pgb-status--lobby" : ""}`}>{lobby ? "In lobby" : "Playing"}</span>
                  <span className="pgb-stat"><FiUsers aria-hidden="true" /> {game.playerCount}</span>
                  {game.spectatorCount > 0 && (
                    <span className="pgb-stat"><FiEye aria-hidden="true" /> {game.spectatorCount}</span>
                  )}
                </span>
              </div>
              <Button
                size="sm"
                variant={lobby ? "primary" : "secondary"}
                loading={joining === game.id}
                disabled={joining !== null}
                onClick={() => void handleJoin(game)}
                aria-label={`${lobby ? "Join" : "Watch"} ${title}${game.hostName ? "'s game" : ""}`}
              >
                {lobby ? "Join" : "Watch"}
              </Button>
            </li>
          );
        })}
      </ul>
      <p className="pgb-count">
        {games.length} open {games.length === 1 ? "game" : "games"}
        {below > 0 && <span> ({below} more)</span>}
      </p>
    </div>
  );
}
