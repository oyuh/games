import { mutators, queries } from "@games/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePublishedAvatars } from "./useAvatars";
import { useNavigate, useParams } from "react-router-dom";
import { optimistic, useQuery, useZero } from "../lib/zero";
import { buildPasswordPlayerNames } from "../lib/password-names";
import { addRecentGame, ensureName, leaveCurrentGame, SessionGameType } from "../lib/session";
import { showToast } from "../lib/toast";
import { useMissingGameRedirect } from "./useMissingGameRedirect";

/**
 * Shared lobby logic for the password begin screen: queries, the
 * start/kick/announcement watchers, the join flow, and the derived facts both
 * views need to decide what to render. Both views join the game first and
 * switch team afterwards.
 */
export function usePasswordBegin(sessionId: string) {
  const zero = useZero();
  const navigate = useNavigate();
  const params = useParams();
  const gameId = params.id ?? "";

  const [games, gamesResult] = useQuery(queries.password.byId({ id: gameId }));
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

  useMissingGameRedirect(Boolean(game), gamesResult.type);

  const mySession = mySessionRows[0] ?? null;
  const activeGameType = (mySession?.game_type ?? null) as SessionGameType | null;
  const activeGameId = mySession?.game_id ?? null;
  const teamsWithPlayers = game?.teams.filter((t) => t.members.length > 0).length ?? 0;

  const inGame = game?.teams.some((t) => t.members.includes(sessionId)) ?? false;
  const isSpectator = game?.spectators?.some((s) => s.sessionId === sessionId) ?? false;
  const inAnotherGame = Boolean(
    activeGameType && activeGameId && (activeGameType !== "password" || activeGameId !== gameId)
  );

  const joinGame = async () => {
    await ensureName(zero, sessionId);
    if (isSpectator) {
      void zero.mutate(mutators.password.leaveSpectator({ gameId, sessionId }))
        .client.then(() => zero.mutate(mutators.password.join({ gameId, sessionId })))
        .catch(() => showToast("Couldn't join game", "error"));
      return;
    }
    void zero.mutate(mutators.password.join({ gameId, sessionId }))
      .client.catch(() => showToast("Couldn't join game", "error"));
  };

  const handleJoinClick = () => {
    if (inAnotherGame && activeGameType && activeGameId) {
      setJoiningFromOtherGame(true);
      void leaveCurrentGame(zero, sessionId, activeGameType, activeGameId)
        .catch(() => showToast("Couldn't leave current game", "error"))
        .finally(() => {
          setJoiningFromOtherGame(false);
          void joinGame();
        });
      return;
    }
    void joinGame();
  };

  const confirmLeaveAndJoin = () => {
    if (!activeGameType || !activeGameId) {
      setShowInSessionModal(false);
      void joinGame();
      return;
    }
    setJoiningFromOtherGame(true);
    void leaveCurrentGame(zero, sessionId, activeGameType, activeGameId)
      .then(() => {
        setShowInSessionModal(false);
        void joinGame();
      })
      .catch(() => showToast("Couldn't leave current game", "error"))
      .finally(() => setJoiningFromOtherGame(false));
  };

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
    zero, gameId, game, names, isHost, inGame, isSpectator, activeGameType, startingGame,
    startGame, showInSessionModal, setShowInSessionModal, joiningFromOtherGame, handleJoinClick,
    confirmLeaveAndJoin,
  };
}
