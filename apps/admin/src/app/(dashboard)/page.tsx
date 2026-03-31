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

type CustomStatusPayload = {
  text: string;
  link?: string | null;
  color?: string | null;
  flash?: boolean;
} | null;

export default function DashboardPage() {
  const { show } = useToast();
  const [games, setGames] = useState<GamesData | null>(null);
  const [clients, setClients] = useState<ClientsData | null>(null);
  const [currentStatus, setCurrentStatus] = useState<CustomStatusPayload>(null);
  const [statusInput, setStatusInput] = useState("");
  const [linkInput, setLinkInput] = useState("");
  const [colorInput, setColorInput] = useState("");
  const [flashEnabled, setFlashEnabled] = useState(false);
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
      const st: CustomStatusPayload = s.status ?? null;
      setCurrentStatus(st);
      setStatusInput(st?.text ?? "");
      setLinkInput(st?.link ?? "");
      setColorInput(st?.color ?? "");
      setFlashEnabled(st?.flash ?? false);
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
      const body: any = {
        text: statusInput || null,
        link: linkInput || null,
        color: colorInput || null,
        flash: flashEnabled,
      };
      await api("/status", { method: "POST", body });
      show(statusInput ? "Custom status set" : "Custom status cleared", "success");
      if (statusInput) {
        setCurrentStatus({ text: statusInput, link: linkInput || null, color: colorInput || null, flash: flashEnabled });
      } else {
        setCurrentStatus(null);
      }
    } catch (e: any) { show(e.message, "error"); }
  };

  const clearStatus = async () => {
    try {
      await api("/status", { method: "DELETE" });
      show("Custom status cleared", "success");
      setCurrentStatus(null);
      setStatusInput("");
      setLinkInput("");
      setColorInput("");
      setFlashEnabled(false);
    } catch (e: any) { show(e.message, "error"); }
  };

  if (loading) return <p style={{ color: "var(--muted)" }}>Loading...</p>;

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
          {currentStatus && (
            <div style={{ fontSize: "0.875rem", color: "var(--primary)" }}>
              Current: <strong style={{ color: currentStatus.color || undefined }}>{currentStatus.text}</strong>
              {currentStatus.link && <span style={{ color: "var(--muted)" }}> → {currentStatus.link}</span>}
              {currentStatus.flash && <span className="badge badge-yellow" style={{ marginLeft: "0.5rem" }}>Flash</span>}
            </div>
          )}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              type="text"
              placeholder="Status message..."
              value={statusInput}
              onChange={(e) => setStatusInput(e.target.value)}
              maxLength={200}
              style={{ flex: 1 }}
            />
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="text"
              placeholder="Link URL (optional)..."
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              maxLength={500}
              style={{ flex: 1, minWidth: "200px" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
              <label style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Color:</label>
              <input
                type="color"
                value={colorInput || "#ffffff"}
                onChange={(e) => setColorInput(e.target.value)}
                style={{ width: "2rem", height: "2rem", padding: 0, border: "1px solid var(--border)", borderRadius: "4px", cursor: "pointer" }}
              />
              {colorInput && (
                <button className="btn btn-ghost" style={{ padding: "0.25rem 0.5rem", fontSize: "0.7rem" }} onClick={() => setColorInput("")}>
                  Clear
                </button>
              )}
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.875rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={flashEnabled}
                onChange={(e) => setFlashEnabled(e.target.checked)}
                style={{ width: "1rem", height: "1rem" }}
              />
              Flash
            </label>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn btn-primary" onClick={updateStatus}>Set Status</button>
            {currentStatus && (
              <button className="btn btn-ghost" onClick={clearStatus}>Clear</button>
            )}
          </div>
        </div>
      </div>

      <div>
        <h2 className="section-title">Danger Zone</h2>
        <div className="card" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button className="btn btn-warning" onClick={sendUpdateWarning}>
            Send 5-min Update Warning
          </button>
          <button className="btn btn-danger" onClick={refreshAll}>
            Force Refresh All Clients
          </button>
          <button className="btn btn-danger" onClick={endAllGames}>
            End All Games
          </button>
        </div>
      </div>
    </div>
  );
}
