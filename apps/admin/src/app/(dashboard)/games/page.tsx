"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { useToast } from "@/components/Toast";

type Game = {
  id: string;
  code: string;
  hostId: string;
  phase: string;
  type: string;
  players?: any[];
  teams?: any[];
  createdAt: number;
  updatedAt: number;
};

export default function GamesPage() {
  const { show } = useToast();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const refresh = async () => {
    try {
      const data = await api("/games");
      const all: Game[] = [
        ...(data.games?.imposter ?? []),
        ...(data.games?.password ?? []),
        ...(data.games?.chain_reaction ?? []),
        ...(data.games?.shade_signal ?? []),
      ];
      all.sort((a, b) => b.updatedAt - a.updatedAt);
      setGames(all);
    } catch (e: any) { show(e.message, "error"); }
    finally { setLoading(false); }
  };

  useEffect(() => { refresh(); const t = setInterval(refresh, 10_000); return () => clearInterval(t); }, []);

  const endGame = async (type: string, id: string) => {
    if (!confirm(`End this ${type} game?`)) return;
    try {
      await api(`/games/${type}/${id}/end`, { method: "POST" });
      show("Game ended", "success");
      setDetail(null);
      refresh();
    } catch (e: any) { show(e.message, "error"); }
  };

  const viewDetail = async (type: string, id: string) => {
    setDetailLoading(true);
    try {
      const data = await api(`/games/${type}/${id}`);
      setDetail(data);
    } catch (e: any) { show(e.message, "error"); }
    finally { setDetailLoading(false); }
  };

  const kickPlayer = async (type: string, gameId: string, sessionId: string) => {
    if (!confirm("Kick this player?")) return;
    try {
      await api(`/games/${type}/${gameId}/kick/${sessionId}`, { method: "POST" });
      show("Player kicked", "success");
      viewDetail(type, gameId);
      refresh();
    } catch (e: any) { show(e.message, "error"); }
  };

  const playerCount = (g: Game) => {
    if (g.players) return g.players.length;
    if (g.teams) return g.teams.reduce((sum: number, t: any) => sum + (t.members?.length ?? 0), 0);
    return 0;
  };

  const ago = (ts: number) => {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    return `${Math.floor(diff / 3600)}h`;
  };

  const phaseColor = (phase: string) => {
    if (phase === "lobby") return "badge-gray";
    if (phase === "ended" || phase === "finished") return "badge-red";
    return "badge-green";
  };

  if (loading) return <p style={{ color: "#888" }}>Loading...</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="section-title" style={{ margin: 0 }}>Active Games ({games.length})</h2>
        <button className="btn btn-ghost" onClick={refresh}>Refresh</button>
      </div>

      {/* Game detail panel */}
      {detail && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span className={`badge ${phaseColor(detail.game?.phase)}`} style={{ marginRight: "0.5rem" }}>
                {detail.game?.phase}
              </span>
              <strong>{detail.game?.type}</strong> — Code: <code>{detail.game?.code}</code>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button className="btn btn-danger" onClick={() => endGame(detail.game.type, detail.game.id)}>
                End Game
              </button>
              <button className="btn btn-ghost" onClick={() => setDetail(null)}>Close</button>
            </div>
          </div>

          {/* Players */}
          <div>
            <div style={{ fontSize: "0.8125rem", fontWeight: 500, marginBottom: "0.5rem", color: "#888" }}>Players</div>
            {detail.game?.players?.map((p: any, i: number) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.375rem 0", borderBottom: "1px solid #222" }}>
                <span style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>{p.sessionId?.slice(0, 12)}</span>
                <span>{p.name || "—"}</span>
                {p.role && <span className="badge badge-yellow">{p.role}</span>}
                {p.eliminated && <span className="badge badge-red">eliminated</span>}
                <button
                  className="btn btn-danger"
                  style={{ padding: "0.125rem 0.5rem", fontSize: "0.7rem", marginLeft: "auto" }}
                  onClick={() => kickPlayer(detail.game.type, detail.game.id, p.sessionId)}
                >
                  Kick
                </button>
              </div>
            ))}
            {detail.game?.teams?.map((t: any, ti: number) => (
              <div key={ti} style={{ marginBottom: "0.5rem" }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 500, color: "#7ecbff" }}>{t.name}</div>
                {t.members?.map((mId: string) => (
                  <div key={mId} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.25rem 0" }}>
                    <span style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>{mId.slice(0, 12)}</span>
                    <button
                      className="btn btn-danger"
                      style={{ padding: "0.125rem 0.5rem", fontSize: "0.7rem", marginLeft: "auto" }}
                      onClick={() => kickPlayer(detail.game.type, detail.game.id, mId)}
                    >
                      Kick
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Raw JSON (collapsed) */}
          <details style={{ fontSize: "0.75rem" }}>
            <summary style={{ cursor: "pointer", color: "#888" }}>Raw game state</summary>
            <pre style={{ marginTop: "0.5rem", padding: "0.75rem", background: "#0a0a0a", borderRadius: "0.5rem", overflow: "auto", maxHeight: "400px" }}>
              {JSON.stringify(detail.game, null, 2)}
            </pre>
          </details>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Code</th>
              <th>Phase</th>
              <th>Players</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {games.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: "center", color: "#888" }}>No active games</td></tr>
            )}
            {games.map((g) => (
              <tr key={g.id}>
                <td><span className="badge badge-blue">{g.type}</span></td>
                <td><code style={{ fontSize: "0.8125rem" }}>{g.code}</code></td>
                <td><span className={`badge ${phaseColor(g.phase)}`}>{g.phase}</span></td>
                <td>{playerCount(g)}</td>
                <td style={{ fontSize: "0.75rem", color: "#888" }}>{ago(g.updatedAt)} ago</td>
                <td>
                  <div style={{ display: "flex", gap: "0.375rem" }}>
                    <button
                      className="btn btn-ghost"
                      style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                      onClick={() => viewDetail(g.type, g.id)}
                      disabled={detailLoading}
                    >
                      View
                    </button>
                    <button
                      className="btn btn-danger"
                      style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                      onClick={() => endGame(g.type, g.id)}
                    >
                      End
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
