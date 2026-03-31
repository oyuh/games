"use client";

import { useState } from "react";
import { api } from "@/lib/client-api";
import { useToast } from "@/components/Toast";

export default function BroadcastPage() {
  const { show } = useToast();
  const [toastMsg, setToastMsg] = useState("");
  const [toastLevel, setToastLevel] = useState<"info" | "success" | "error">("info");
  const [warningMinutes, setWarningMinutes] = useState(5);

  const sendGlobalToast = async () => {
    if (!toastMsg.trim()) return;
    try {
      await api("/broadcast/toast", { method: "POST", body: { message: toastMsg, level: toastLevel } });
      show("Global toast sent to all clients", "success");
      setToastMsg("");
    } catch (e: any) { show(e.message, "error"); }
  };

  const sendRefresh = async () => {
    if (!confirm("Force-refresh ALL connected clients immediately?")) return;
    try {
      await api("/broadcast/refresh", { method: "POST" });
      show("Refresh command sent", "success");
    } catch (e: any) { show(e.message, "error"); }
  };

  const sendUpdateWarning = async () => {
    if (!confirm(`Send ${warningMinutes}-minute update warning? Clients will be refreshed after.`)) return;
    try {
      await api("/broadcast/update-warning", { method: "POST", body: { minutes: warningMinutes } });
      show(`${warningMinutes}-minute update warning sent`, "success");
    } catch (e: any) { show(e.message, "error"); }
  };

  const endAllAndRefresh = async () => {
    if (!confirm("This will END all active games, then send a 5-minute refresh warning. Continue?")) return;
    try {
      const res = await api("/games/end-all", { method: "POST" });
      show(`Ended ${res.ended?.total ?? 0} games`, "success");
      await api("/broadcast/update-warning", { method: "POST", body: { minutes: 5 } });
      show("5-minute refresh warning sent", "success");
    } catch (e: any) { show(e.message, "error"); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      <h2 className="section-title">Broadcast Controls</h2>

      {/* Global Toast */}
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div style={{ fontSize: "0.9375rem", fontWeight: 600 }}>Send Global Toast</div>
        <p style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>
          Send a toast notification to every connected client.
        </p>
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
          <button className="btn btn-primary" onClick={sendGlobalToast}>Send Toast</button>
        </div>
      </div>

      {/* Update Warning */}
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div style={{ fontSize: "0.9375rem", fontWeight: 600 }}>API Update Warning</div>
        <p style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>
          Warn all clients that the site will refresh after a countdown. This sends toast warnings
          at the start, at 1 minute remaining, and at 10 seconds, then force-refreshes everyone.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input
            type="number"
            min={1}
            max={30}
            value={warningMinutes}
            onChange={(e) => setWarningMinutes(Number(e.target.value))}
            style={{ width: "80px" }}
          />
          <span style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>minutes</span>
          <button className="btn btn-warning" onClick={sendUpdateWarning}>Send Warning</button>
        </div>
      </div>

      {/* Force Refresh */}
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div style={{ fontSize: "0.9375rem", fontWeight: 600 }}>Force Refresh</div>
        <p style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>
          Immediately refresh all connected clients. No warning.
        </p>
        <button className="btn btn-danger" onClick={sendRefresh} style={{ width: "fit-content" }}>
          Force Refresh All
        </button>
      </div>

      {/* Nuclear option */}
      <div className="card danger-zone" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--danger)" }}>End All Games + Refresh</div>
        <p style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>
          End every active game, then send a 5-minute refresh countdown to all clients.
          Use this before deploying a major update.
        </p>
        <button className="btn btn-danger" onClick={endAllAndRefresh} style={{ width: "fit-content" }}>
          End All &amp; Schedule Refresh
        </button>
      </div>
    </div>
  );
}
