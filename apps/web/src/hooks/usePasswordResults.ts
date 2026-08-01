import { isEncrypted, queries } from "@games/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useZero } from "../lib/zero";
import { buildPasswordPlayerNames } from "../lib/password-names";
import { useGameSecret } from "../lib/game-secrets";
import { playGameOver } from "../lib/sounds";
import { showToast } from "../lib/toast";

/** Team swatches, shared so both views colour the same team the same way. */
export const PASSWORD_TEAM_COLORS = ["#7ecbff", "#a78bfa", "#4ade80", "#f59e0b", "#f87171", "#ec4899"];

/**
 * Everything the password results screen needs that isn't markup: the queries,
 * the host/kick/announcement watchers, round-word decryption, and the derived
 * scoreboard.
 *
 * The desktop and mobile results screens each had their own copy of all of it.
 * The copies had already drifted (mobile never loaded player names, and only
 * desktop redirected home when the game was missing), which is the reason this
 * lives in one place now.
 */
export function usePasswordResults(sessionId: string) {
  const zero = useZero();
  const params = useParams();
  const navigate = useNavigate();
  const gameId = params.id ?? "";

  const [games] = useQuery(queries.password.byId({ id: gameId }));
  const [sessions] = useQuery(queries.sessions.byGame({ gameType: "password", gameId }));
  const game = games[0];

  const prevAnnouncementTs = useRef<number | null>(null);
  const navHandledRef = useRef(false);
  const playedResultsSoundRef = useRef(false);
  const [decryptedRoundWords, setDecryptedRoundWords] = useState<Record<number, string | null>>({});

  const names = useMemo(() => buildPasswordPlayerNames(game, sessions), [game, sessions]);
  const { decryptValue } = useGameSecret({
    gameType: "password",
    gameId,
    sessionId,
    enabled: Boolean(game && game.phase === "results"),
  });

  // Host ended the game, or we got kicked.
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
      if (game.host_id !== sessionId) showToast(`📢 ${game.announcement.text}`, "info");
    }
  }, [game?.announcement, game?.host_id, sessionId]);

  // No such game: don't strand the player on an empty screen.
  useEffect(() => {
    if (game) return;
    const timer = setTimeout(() => navigate("/"), 3000);
    return () => clearTimeout(timer);
  }, [game, navigate]);

  useEffect(() => {
    if (!game || playedResultsSoundRef.current || game.phase !== "results") return;
    playedResultsSoundRef.current = true;
    playGameOver();
  }, [game?.phase, game]);

  useEffect(() => {
    let cancelled = false;
    const rounds = game?.rounds ?? [];
    if (rounds.length === 0) {
      setDecryptedRoundWords({});
      return;
    }
    void Promise.all(
      rounds.map(async (round, index) => ({ index, value: await decryptValue(round.word) }))
    ).then((rows) => {
      if (cancelled) return;
      setDecryptedRoundWords(
        rows.reduce<Record<number, string | null>>((acc, row) => {
          acc[row.index] = row.value;
          return acc;
        }, {})
      );
    });
    return () => {
      cancelled = true;
    };
  }, [game?.rounds, decryptValue]);

  const sortedScores = Object.entries(game?.scores ?? {}).sort((a, b) => b[1] - a[1]);
  const topScore = sortedScores[0]?.[1] ?? 0;
  const winners = sortedScores.filter(([, score]) => score === topScore);

  return {
    zero,
    gameId,
    game,
    names,
    navigate,
    isHost: game?.host_id === sessionId,
    sortedScores,
    topScore,
    winners,
    isTie: winners.length > 1 && topScore > 0,
    roundsForView: (game?.rounds ?? []).map((round, index) => ({
      ...round,
      word: decryptedRoundWords[index] ?? (isEncrypted(round.word) ? "••••" : round.word),
    })),
  };
}
