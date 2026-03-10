"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { useToast } from "@/components/Toast";

type GamesData = {
  totals: { imposter: number; password: number; chain_reaction: number; shade_signal: number; total: number };
};

type ClientsData = {
  total: number;
};

type StatusData = {
  status: string | null;
};

export default function DashboardPage() {
  const { show } = useToast();
  const [games, setGames] = useState<GamesData | null>(null);
  const [clients, setClients] = useState<ClientsData | null>(null);
  const [status, setStatus] = useState<StatusData>({ status: null });
  const [statusInput, setStatusInput] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const [g, c, s] = await Promise.all([
        api("/games"),
        api("/clients"),
        api("/status"),
      ]);
      setGames(g);
      setClients(c);
      setStatus(s);
      setStatusInput(s.status ?? "");
    } catch (e: any) {
      show(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); const t = setInterval(refresh, 10_000); return () => clearInterval(t); }, []);

  const endAllGames = async () => {
    if (!confirm("End ALL active games?")) return;
    try {
      const res = await api("/games/end-all", { method: "POST" });
      show(`Ended ${res.ended?.total ?? 0} games`, "success");
      refresh();
    } catch (e: any) { show(e.message, "error"); }
  };

  const refreshAll = async () => {
    if (!confirm("Force-refresh ALL connected clients right now?")) return;
    try {
      await api("/broadcast/refresh", { method: "POST" });
      show("Refresh broadcast sent", "success");
    } catch (e: any) { show(e.message, "error"); }
  };

  const sendUpdateWarning = async () => {
    try {
      await api("/broadcast/update-warning", { method: "POST", body: { minutes: 5 } });
      show("5-minute update warning sent", "success");
    } catch (e: any) { show(e.message, "error"); }
  };

  const updateStatus = async () => {
    try {
      await api("/status", { method: "POST", body: { text: statusInput || null } });
      show(statusInput ? "Custom status set" : "Custom status cleared", "success");
      setStatus({ status: statusInput || null });
    } catch (e: any) { show(e.message, "error"); }
  };

  const clearStatus = async () => {
    try {
      await api("/status", { method: "DELETE" });
      show("Custom status cleared", "success");
      setStatus({ status: null });
      setStatusInput("");
    } catch (e: any) { show(e.message, "error"); }
  };

  if (loading) return <p style={{ color: "#888" }}>Loading...</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      <div>
        <h2 className="section-title">Overview</h2>
        <div className="stat-grid">
          <div className="stat-card">
            <div className="label">Connected Clients</div>
            <div className="value">{clients?.total ?? 0}</div>
          </div>
          <div className="stat-card">
            <div className="label">Active Games</div>
            <div className="value">{games?.totals?.total ?? 0}</div>
          </div>
          <div className="stat-card">
            <div className="label">Imposter</div>
            <div className="value">{games?.totals?.imposter ?? 0}</div>
          </div>
          <div className="stat-card">
            <div className="label">Password</div>
            <div className="value">{games?.totals?.password ?? 0}</div>
          </div>
          <div className="stat-card">
            <div className="label">Chain Reaction</div>
            <div className="value">{games?.totals?.chain_reaction ?? 0}</div>
          </div>
          <div className="stat-card">
            <div className="label">Shade Signal</div>
            <div className="value">{games?.totals?.shade_signal ?? 0}</div>
          </div>
        </div>
      </div>

      <div>
        <h2 className="section-title">Custom Footer Status</h2>
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {status.status && (
            <div style={{ fontSize: "0.875rem", color: "#7ecbff" }}>
              Current: <strong>{status.status}</strong>
            </div>
          )}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              type="text"
              placeholder="Set custom status message..."
              value={statusInput}
              onChange={(e) => setStatusInput(e.target.value)}
              maxLength={200}
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" onClick={updateStatus}>Set</button>
            {status.status && (
              <button className="btn btn-ghost" onClick={clearStatus}>Clear</button>
            )}
          </div>
        </div>
      </div>

      <div>
        <h2 className="section-title">Danger Zone</h2>
        <div className="card" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button className="btn btn-warning" onClick={sendUpdateWarning}>
            ⚠️ Send 5-min Update Warning
          </button>
          <button className="btn btn-danger" onClick={refreshAll}>
            🔄 Force Refresh All Clients
          </button>
          <button className="btn btn-danger" onClick={endAllGames}>
            🛑 End All Games
          </button>
        </div>
      </div>
    </div>
  );
}
