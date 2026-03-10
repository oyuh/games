"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { useToast } from "@/components/Toast";

type Client = {
  sessionId: string | null;
  name: string | null;
  ip: string;
  userAgent: string;
  region: string;
  connectedAt: number;
  lastSeen: number;
  gameId: string | null;
  gameType: string | null;
};

export default function ClientsPage() {
  const { show } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [toastTarget, setToastTarget] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState("");
  const [toastLevel, setToastLevel] = useState<"info" | "error" | "success">("info");
  const [restrictTarget, setRestrictTarget] = useState<string | null>(null);
  const [restrictType, setRestrictType] = useState<"session" | "ip" | "region">("session");
  const [restrictReason, setRestrictReason] = useState("");
  const [nameTarget, setNameTarget] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");

  const refresh = async () => {
    try {
      const data = await api("/clients");
      setClients(data.clients ?? []);
    } catch (e: any) { show(e.message, "error"); }
    finally { setLoading(false); }
  };

  useEffect(() => { refresh(); const t = setInterval(refresh, 5_000); return () => clearInterval(t); }, []);

  const sendToast = async (sessionId: string) => {
    if (!toastMsg.trim()) return;
    try {
      await api(`/clients/${sessionId}/toast`, { method: "POST", body: { message: toastMsg, level: toastLevel } });
      show("Toast sent", "success");
      setToastTarget(null);
      setToastMsg("");
    } catch (e: any) { show(e.message, "error"); }
  };

  const restrictClient = async (sessionId: string) => {
    try {
      await api(`/clients/${sessionId}/restrict`, { method: "POST", body: { type: restrictType, reason: restrictReason } });
      show(`Client restricted (${restrictType})`, "success");
      setRestrictTarget(null);
      setRestrictReason("");
      refresh();
    } catch (e: any) { show(e.message, "error"); }
  };

  const sendGlobalToast = async () => {
    if (!toastMsg.trim()) return;
    try {
      await api("/broadcast/toast", { method: "POST", body: { message: toastMsg, level: toastLevel } });
      show("Global toast sent", "success");
      setToastTarget(null);
      setToastMsg("");
    } catch (e: any) { show(e.message, "error"); }
  };

  const changeName = async (sessionId: string) => {
    if (!nameInput.trim()) return;
    try {
      await api(`/clients/${sessionId}/name`, { method: "POST", body: { name: nameInput } });
      show("Name changed", "success");
      setNameTarget(null);
      setNameInput("");
      refresh();
    } catch (e: any) { show(e.message, "error"); }
  };

  const ago = (ts: number) => {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  if (loading) return <p style={{ color: "var(--muted)" }}>Loading...</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="section-title" style={{ margin: 0 }}>Connected Clients ({clients.length})</h2>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn btn-ghost" onClick={refresh}>Refresh</button>
          <button className="btn btn-primary" onClick={() => { setToastTarget("__global__"); setToastMsg(""); }}>
            📢 Global Toast
          </button>
        </div>
      </div>

      {/* Toast modal */}
      {toastTarget && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ fontSize: "0.875rem", fontWeight: 500 }}>
            {toastTarget === "__global__" ? "Send Global Toast" : `Toast to ${toastTarget.slice(0, 8)}...`}
          </div>
          <input
            type="text"
            placeholder="Toast message..."
            value={toastMsg}
            onChange={(e) => setToastMsg(e.target.value)}
            maxLength={300}
          />
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <select value={toastLevel} onChange={(e) => setToastLevel(e.target.value as any)} style={{ width: "auto" }}>
              <option value="info">Info</option>
              <option value="success">Success</option>
              <option value="error">Error</option>
            </select>
            <button
              className="btn btn-primary"
              onClick={() => toastTarget === "__global__" ? sendGlobalToast() : sendToast(toastTarget)}
            >
              Send
            </button>
            <button className="btn btn-ghost" onClick={() => setToastTarget(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Restrict modal */}
      {restrictTarget && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ fontSize: "0.875rem", fontWeight: 500 }}>
            Restrict client {restrictTarget.slice(0, 8)}...
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <select value={restrictType} onChange={(e) => setRestrictType(e.target.value as any)} style={{ width: "auto" }}>
              <option value="session">Session ID</option>
              <option value="ip">IP Address</option>
              <option value="region">Region</option>
            </select>
            <input
              type="text"
              placeholder="Reason (optional)..."
              value={restrictReason}
              onChange={(e) => setRestrictReason(e.target.value)}
              style={{ flex: 1 }}
              maxLength={200}
            />
            <button className="btn btn-danger" onClick={() => restrictClient(restrictTarget)}>Restrict</button>
            <button className="btn btn-ghost" onClick={() => setRestrictTarget(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Name change modal */}
      {nameTarget && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ fontSize: "0.875rem", fontWeight: 500 }}>
            Change name for {nameTarget.slice(0, 8)}...
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="text"
              placeholder="New name..."
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              style={{ flex: 1 }}
              maxLength={20}
            />
            <button className="btn btn-primary" onClick={() => changeName(nameTarget)}>Change</button>
            <button className="btn btn-ghost" onClick={() => setNameTarget(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Session</th>
              <th>Name</th>
              <th>IP</th>
              <th>Region</th>
              <th>Game</th>
              <th>Connected</th>
              <th>Last Seen</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--muted)" }}>No clients connected</td></tr>
            )}
            {clients.map((c, i) => (
              <tr key={i}>
                <td style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
                  {c.sessionId?.slice(0, 12) ?? "—"}
                </td>
                <td style={{ fontWeight: 500 }}>
                  {c.name || <span style={{ color: "var(--muted)" }}>Anonymous</span>}
                </td>
                <td style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>{c.ip}</td>
                <td>
                  {c.region && c.region !== "unknown" ? (
                    <span className="badge badge-gray">{c.region}</span>
                  ) : (
                    <span style={{ color: "var(--muted)" }}>—</span>
                  )}
                </td>
                <td>
                  {c.gameType ? (
                    <span className="badge badge-blue">{c.gameType}</span>
                  ) : (
                    <span style={{ color: "var(--muted)" }}>—</span>
                  )}
                </td>
                <td style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{ago(c.connectedAt)}</td>
                <td style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{ago(c.lastSeen)}</td>
                <td>
                  {c.sessionId && (
                    <div style={{ display: "flex", gap: "0.375rem" }}>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                        onClick={() => { setNameTarget(c.sessionId!); setNameInput(c.name || ""); }}
                      >
                        Name
                      </button>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                        onClick={() => { setToastTarget(c.sessionId!); setToastMsg(""); }}
                      >
                        Toast
                      </button>
                      <button
                        className="btn btn-danger"
                        style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                        onClick={() => { setRestrictTarget(c.sessionId!); setRestrictReason(""); }}
                      >
                        Restrict
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
