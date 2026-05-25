import { isEncrypted, mutators, queries, gameCategoryLabels } from "@games/shared";
import { useQuery, useZero } from "../lib/zero";
import "../styles/game-shared.css";
import "../styles/password.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiAward, FiTag } from "react-icons/fi";
import { PasswordRoundsTable } from "../components/password/PasswordRoundsTable";
import { buildPasswordPlayerNames } from "../lib/password-names";
import { showToast } from "../lib/toast";
import { playGameOver } from "../lib/sounds";
import { useIsMobile } from "../hooks/useIsMobile";
import { MobilePasswordResultsPage } from "../mobile/pages/MobilePasswordResultsPage";
import { GameIcon } from "../components/shared/GameIcon";
import { useGameSecret } from "../lib/game-secrets";

function PasswordResultsPageDesktop({ sessionId }: { sessionId: string }) {

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

  useEffect(() => {
    if (game) return;
    const timer = setTimeout(() => navigate("/"), 3000);
    return () => clearTimeout(timer);
  }, [game, navigate]);

  useEffect(() => {
    if (!game || playedResultsSoundRef.current || game.phase !== "results") {
      return;
    }
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
      rounds.map(async (round, index) => ({
        index,
        value: await decryptValue(round.word),
      }))
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

  if (!game) {
    return (
      <div className="game-page">
        <div className="game-empty">
          <p className="game-empty-title">Game not found</p>
          <p className="game-empty-sub">Redirecting home…</p>
          <button className="btn btn-primary" onClick={() => navigate("/")}>Go Home</button>
        </div>
      </div>
    );
  }

  const isHost = game.host_id === sessionId;
  const sortedScores = Object.entries(game.scores).sort((a, b) => b[1] - a[1]);
  const topScore = sortedScores[0]?.[1] ?? 0;
  const winners = sortedScores.filter(([, score]) => score === topScore);
  const isTie = winners.length > 1 && topScore > 0;
  const teamColors = ["#7ecbff", "#a78bfa", "#4ade80", "#f59e0b", "#f87171", "#ec4899"];
  const roundsForView = game.rounds.map((round, index) => ({
    ...round,
    word: decryptedRoundWords[index] ?? (isEncrypted(round.word) ? "••••" : round.word),
  }));

  return (
    <div className="game-page" data-game-theme="password">
      <div className="game-header">
        <div className="game-header-left">
          <div className="game-header-icon">
            <GameIcon game="password" size={20} />
          </div>
          <h1 className="game-title">Password</h1>
          {game.settings.category && gameCategoryLabels[game.settings.category] && (
            <span className="badge badge-category" data-tooltip="Word bank category" data-tooltip-variant="info"><FiTag size={10} /> {gameCategoryLabels[game.settings.category]}</span>
          )}
          <span className="badge badge-success">Finished</span>
        </div>
      </div>

      {isTie ? (
        <div className="game-winner-banner">
          <FiAward size={28} />
          <div>
            <p className="game-winner-title">It's a Tie!</p>
            <p className="game-winner-score">{winners.map(([name]) => name).join(" & ")} - {topScore} points each</p>
          </div>
        </div>
      ) : winners[0] ? (
        <div className="game-winner-banner">
          <FiAward size={28} />
          <div>
            <p className="game-winner-title">{winners[0][0]} Wins!</p>
            <p className="game-winner-score">{winners[0][1]} points</p>
          </div>
        </div>
      ) : null}

      <div className="game-section">
        <h3 className="game-section-label">Final Scores</h3>
        <div className="game-scoreboard">
          {sortedScores.map(([teamName, score], i) => {
            const teamIndex = game.teams.findIndex((t) => t.name === teamName);
            const color = teamColors[teamIndex >= 0 ? teamIndex % teamColors.length : i % teamColors.length]!;
            const maxScore = sortedScores[0]?.[1] ?? 1;
            const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;
            return (
              <div key={teamName} className="game-score-row">
                <span className="game-score-name" style={{ color }}>{teamName}</span>
                <div className="game-result-bar-track">
                  <div className="game-result-bar" style={{ width: `${pct}%`, background: color }} />
                </div>
                <span className="game-score-value">{score}</span>
              </div>
            );
          })}
        </div>
      </div>

      <PasswordRoundsTable rounds={roundsForView} teams={game.teams} names={names} defaultOpen />

      {isHost ? (
        <div className="game-section">
          <button
            className="btn btn-primary game-action-btn"
            onClick={() => {
              void zero.mutate(mutators.password.resetToLobby({ gameId, hostId: sessionId }));
              void navigate(`/password/${game.id}/begin`);
            }}
          >
            Play Again
          </button>
          <button
            className="btn btn-muted"
            style={{ marginTop: "0.5rem" }}
            onClick={() => {
              void zero.mutate(mutators.password.endGame({ gameId, hostId: sessionId }))
                .client.then(() => navigate("/"))
                .catch(() => showToast("Couldn't end game", "error"));
            }}
          >
            End Game
          </button>
        </div>
      ) : (
        <div className="game-section">
          <button className="btn btn-muted game-action-btn" onClick={() => navigate("/")}>
            Back to Home
          </button>
        </div>
      )}
    </div>
  );
}

export function PasswordResultsPage({ sessionId }: { sessionId: string }) {
  const isMobile = useIsMobile();
  if (isMobile) return <MobilePasswordResultsPage sessionId={sessionId} />;
  return <PasswordResultsPageDesktop sessionId={sessionId} />;
}
