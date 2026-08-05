import { mutators, queries } from "@games/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePublishedAvatars } from "./useAvatars";
import { useNavigate, useParams } from "react-router-dom";
import { optimistic, useQuery, useZero } from "../lib/zero";
import { buildPasswordPlayerNames } from "../lib/password-names";
import { addRecentGame, SessionGameType } from "../lib/session";
import { showToast } from "../lib/toast";

/**
 * Shared lobby logic for the password begin screen: queries, the
 * start/kick/announcement watchers, and the derived facts both views need to
 * decide what to render.
 *
 * The join flows are deliberately not in here. Desktop joins the game and
 * lets you switch team afterwards; mobile joins a team directly. Those are
 * genuinely different interactions, so they stay in their own components
 * along with the state that serves them.
 */
export function usePasswordBegin(sessionId: string) {
  const zero = useZero();
  const navigate = useNavigate();
  const params = useParams();
  const gameId = params.id ?? "";

  const [games] = useQuery(queries.password.byId({ id: gameId }));
  const [sessions] = useQuery(queries.sessions.byGame({ gameType: "password", gameId }));
  usePublishedAvatars(sessions);
  const [mySessionRows] = useQuery(queries.sessions.byId({ id: sessionId }));
  const game = games[0];

  const prevAnnouncementTs = useRef<number | null>(null);
  const navHandledRef = useRef(false);
  const [showInSessionModal, setShowInSessionModal] = useState(false);
  const [joiningFromOtherGame, setJoiningFromOtherGame] = useState(false);
  const [startingGame, setStartingGame] = useState(false);

  const isHost = game?.host_id === sessionId;
  const names = useMemo(() => buildPasswordPlayerNames(game, sessions), [game, sessions]);

  useEffect(() => {
    if (!game) return;
    addRecentGame({ id: game.id, code: game.code, gameType: "password" });
  }, [game]);

  // Auto-navigate to game when host starts
  useEffect(() => {
    if (game?.phase === "playing") {
      navigate(`/password/${game.id}`);
    }
  }, [game?.phase, game?.id, navigate]);

  useEffect(() => {
    if (!game) return;
    if (navHandledRef.current) return;
    if (game.phase === "ended") {
      navHandledRef.current = true;
      showToast("The host ended the game", "info");
      navigate("/");
      return;
    }
    if (game.kicked.includes(sessionId)) {
      navHandledRef.current = true;
      showToast("You were kicked from the game", "error");
      navigate("/");
    }
  }, [game?.phase, game?.kicked, sessionId, navigate]);

  // Announcement watcher (skip for host - they sent it)
  useEffect(() => {
    if (!game?.announcement) return;
    if (prevAnnouncementTs.current !== game.announcement.ts) {
      prevAnnouncementTs.current = game.announcement.ts;
      if (!isHost) showToast(`📢 ${game.announcement.text}`, "info");
    }
  }, [game?.announcement, isHost]);

  // No such game: don't strand the player on an empty screen.
  useEffect(() => {
    if (game) return;
    const timer = setTimeout(() => navigate("/"), 3000);
    return () => clearTimeout(timer);
  }, [game, navigate]);

  const mySession = mySessionRows[0] ?? null;
  const activeGameType = (mySession?.game_type ?? null) as SessionGameType | null;
  const activeGameId = mySession?.game_id ?? null;
  const teamsWithPlayers = game?.teams.filter((t) => t.members.length > 0).length ?? 0;

  const startGame = async () => {
    if (!isHost || teamsWithPlayers < 2 || startingGame) return;
    setStartingGame(true);
    try {
      const result = await optimistic(zero.mutate(mutators.password.start({ gameId, hostId: sessionId })));
      if (result.type === "error") {
        showToast(result.error.message, "error");
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Couldn't start game", "error");
    } finally {
      setStartingGame(false);
    }
  };

  return {
    zero,
    navigate,
    gameId,
    game,
    names,
    isHost,
    inGame: game?.teams.some((t) => t.members.includes(sessionId)) ?? false,
    isSpectator: game?.spectators?.some((s) => s.sessionId === sessionId) ?? false,
    activeGameType,
    activeGameId,
    inAnotherGame: Boolean(
      activeGameType && activeGameId && (activeGameType !== "password" || activeGameId !== gameId)
    ),
    teamsWithPlayers,
    canStart: isHost && teamsWithPlayers >= 2,
    startingGame,
    startGame,
    showInSessionModal,
    setShowInSessionModal,
    joiningFromOtherGame,
    setJoiningFromOtherGame,
  };
}
