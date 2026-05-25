import { isEncrypted, mutators, queries } from "@games/shared";
import { useQuery, useZero } from "../../lib/zero";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiAward } from "react-icons/fi";
import { showToast } from "../../lib/toast";
import { MobileGameHeader } from "../components/MobileGameHeader";
import { MobileGameNotFound } from "../components/MobileGameNotFound";
import { playGameOver } from "../../lib/sounds";
import { useGameSecret } from "../../lib/game-secrets";

const teamColors = ["#7ecbff", "#a78bfa", "#4ade80", "#f59e0b", "#f87171", "#ec4899"];

export function MobilePasswordResultsPage({ sessionId }: { sessionId: string }) {
  const zero = useZero();
  const params = useParams();
  const navigate = useNavigate();
  const gameId = params.id ?? "";
  const [games] = useQuery(queries.password.byId({ id: gameId }));
  const game = games[0];
  const prevAnnouncementTs = useRef<number | null>(null);
  const navHandledRef = useRef(false);
  const playedResultsSoundRef = useRef(false);
  const [decryptedRoundWords, setDecryptedRoundWords] = useState<Record<number, string | null>>({});
  const { decryptValue } = useGameSecret({
    gameType: "password",
    gameId,
    sessionId,
    enabled: Boolean(game && game.phase === "results"),
  });

  useEffect(() => {
    if (!game) return;
    if (navHandledRef.current) return;
    if (game.phase === "ended") { navHandledRef.current = true; showToast("The host ended the game", "info"); navigate("/"); return; }
    if (game.kicked.includes(sessionId)) { navHandledRef.current = true; showToast("You were kicked from the game", "error"); navigate("/"); }
  }, [game?.phase, game?.kicked, sessionId, navigate]);

  useEffect(() => {
    if (!game?.announcement) return;
    if (prevAnnouncementTs.current !== game.announcement.ts) {
      prevAnnouncementTs.current = game.announcement.ts;
      if (game.host_id !== sessionId) showToast(`📢 ${game.announcement.text}`, "info");
    }
  }, [game?.announcement, game?.host_id, sessionId]);

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

  if (!game) return <MobileGameNotFound theme="password" />;

  const isHost = game.host_id === sessionId;
  const sortedScores = Object.entries(game.scores).sort((a, b) => b[1] - a[1]);
  const topScore = sortedScores[0]?.[1] ?? 0;
  const winners = sortedScores.filter(([, s]) => s === topScore);
  const isTie = winners.length > 1 && topScore > 0;
  const roundsForView = game.rounds.map((round, index) => ({
    ...round,
    word: decryptedRoundWords[index] ?? (isEncrypted(round.word) ? "••••" : round.word),
  }));

  return (
    <div className="m-page" data-game-theme="password">
      <MobileGameHeader code={game.code} gameLabel="Password" phase="Finished" accent="var(--game-accent)" category={game.settings.category ?? null} />

      {/* Winner banner */}
      {isTie ? (
        <div className="m-card m-card--success">
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <FiAward size={28} style={{ color: "#f59e0b" }} />
            <div>
              <h3 className="m-reveal-title">It's a Tie!</h3>
              <p className="m-reveal-sub">{winners.map(([n]) => n).join(" & ")} - {topScore} pts each</p>
            </div>
          </div>
        </div>
      ) : winners[0] ? (
        <div className="m-card m-card--success">
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <FiAward size={28} style={{ color: "#f59e0b" }} />
            <div>
              <h3 className="m-reveal-title">{winners[0][0]} Wins!</h3>
              <p className="m-reveal-sub">{winners[0][1]} points</p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Scores */}
      <div className="m-card">
        <h3 className="m-card-title">Final Scores</h3>
        <div className="m-results-list">
          {sortedScores.map(([teamName, score], i) => {
            const teamIndex = game.teams.findIndex((t) => t.name === teamName);
            const color = teamColors[teamIndex >= 0 ? teamIndex % teamColors.length : i % teamColors.length]!;
            const maxScore = sortedScores[0]?.[1] ?? 1;
            const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;
            return (
              <div key={teamName} className="m-result-row">
                <div className="m-result-info">
                  <span style={{ color, fontWeight: 600 }}>{teamName}</span>
                  <span className="m-result-votes">{score}</span>
                </div>
                <div className="m-result-bar-track">
                  <div className="m-result-bar" style={{ width: `${pct}%`, background: color }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rounds table */}
      {roundsForView.length > 0 && (
        <div className="m-card">
          <h3 className="m-card-title">Rounds</h3>
          <div className="m-data-table-wrap">
            <table className="m-data-table">
              <thead><tr><th>#</th><th>Team</th><th>Word</th><th>Pts</th></tr></thead>
              <tbody>
                {roundsForView.map((r) => (
                  <tr key={r.roundId ?? `${r.round}-${r.teamIndex}`}>
                    <td>{r.round}</td>
                    <td>{game.teams[r.teamIndex]?.name ?? `Team ${r.teamIndex + 1}`}</td>
                    <td style={{ color: "var(--primary)", fontWeight: 600 }}>{r.word}</td>
                    <td style={{ color: r.correct ? "#4ade80" : "#f87171" }}>{r.correct ? `+${r.points ?? 1}` : "0"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="m-card">
        {isHost ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <button
              className="m-btn m-btn-primary"
              style={{ width: "100%" }}
              onClick={() => { void zero.mutate(mutators.password.resetToLobby({ gameId, hostId: sessionId })); void navigate(`/password/${game.id}/begin`); }}
            >
              Play Again
            </button>
            <button
              className="m-btn m-btn-muted"
              style={{ width: "100%" }}
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
          <button className="m-btn m-btn-muted" style={{ width: "100%" }} onClick={() => navigate("/")}>
            Back to Home
          </button>
        )}
      </div>
    </div>
  );
}
