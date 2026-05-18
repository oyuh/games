import { mutators } from "@games/shared";
import { useZero } from "../../lib/zero";
import { useNavigate } from "react-router-dom";
import { FiUsers, FiGlobe } from "react-icons/fi";
import { addRecentGame, ensureName } from "../../lib/session";
import { showToast } from "../../lib/toast";
import { useEffect, useState } from "react";
import { PENDING_GAME_JOIN_NAV_STATE } from "../../lib/game-page-load-state";
import { waitForJoinedGameAccess } from "../../lib/game-lookup";

type GameType = "imposter" | "password" | "chain_reaction" | "shade_signal" | "location_signal";

type NormalizedGame = {
  id: string;
  code: string;
  phase: string;
  hostName: string | null;
  playerCount: number;
  spectatorCount: number;
  createdAt: number;
};

type PublicGamesDirectory = Record<GameType, NormalizedGame[]>;

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const EMPTY_DIRECTORY: PublicGamesDirectory = {
  imposter: [],
  password: [],
  chain_reaction: [],
  shade_signal: [],
  location_signal: [],
};

let cachedDirectory: PublicGamesDirectory | null = null;
let cachedAt = 0;
let inFlightDirectoryPromise: Promise<PublicGamesDirectory> | null = null;

async function loadPublicGamesDirectory(force = false): Promise<PublicGamesDirectory> {
  const now = Date.now();
  if (!force && cachedDirectory && now - cachedAt < 15_000) {
    return cachedDirectory;
  }
  if (!force && inFlightDirectoryPromise) {
    return inFlightDirectoryPromise;
  }

  inFlightDirectoryPromise = fetch(`${API_BASE}/api/public-games`, {
    credentials: "include",
  })
    .then(async (res) => {
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return res.json() as Promise<PublicGamesDirectory>;
    })
    .then((payload) => {
      cachedDirectory = payload;
      cachedAt = Date.now();
      return payload;
    })
    .finally(() => {
      inFlightDirectoryPromise = null;
    });

  return inFlightDirectoryPromise;
}

function usePublicGamesDirectory() {
  const [directory, setDirectory] = useState<PublicGamesDirectory>(cachedDirectory ?? EMPTY_DIRECTORY);

  useEffect(() => {
    let cancelled = false;
    void loadPublicGamesDirectory().then((payload) => {
      if (!cancelled) {
        setDirectory(payload);
      }
    }).catch(() => {
      if (!cancelled) {
        setDirectory(EMPTY_DIRECTORY);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return directory;
}

export function usePublicGameCount(gameType: GameType): number {
  const directory = usePublicGamesDirectory();
  return directory[gameType].length;
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

function usePublicGames(gameType: GameType): NormalizedGame[] {
  const directory = usePublicGamesDirectory();
  const games = [...directory[gameType]];
  games.sort((a, b) => {
    const aLobby = isLobby(a.phase) ? 0 : 1;
    const bLobby = isLobby(b.phase) ? 0 : 1;
    if (aLobby !== bLobby) return aLobby - bLobby;
    return b.createdAt - a.createdAt;
  });
  return games;
}

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

    try {
      await ensureName(zero, sessionId);
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
      cachedDirectory = null;
      cachedAt = 0;
      const joined = await waitForJoinedGameAccess(gameType, game.id, sessionId).catch(() => false);
      if (!joined) {
        showToast("Joined game is still syncing. Try again in a moment.", "error");
        return;
      }
      navigate(GAME_TYPE_ROUTES[gameType](game.id), { state: PENDING_GAME_JOIN_NAV_STATE });
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
