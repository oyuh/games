"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { useToast } from "@/components/Toast";

type RestrictedName = {
  id: string;
  pattern: string;
  reason: string;
  createdAt: number;
};

type NameOverride = {
  sessionId: string;
  forcedName: string;
  reason: string;
  updatedAt: number;
};

export default function NamesPage() {
  const { show } = useToast();
  const [restricted, setRestricted] = useState<RestrictedName[]>([]);
  const [overrides, setOverrides] = useState<NameOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPattern, setNewPattern] = useState("");
  const [newReason, setNewReason] = useState("");

  const refresh = async () => {
    try {
      const [r, o] = await Promise.all([
        api("/names/restricted"),
        api("/names/overrides"),
      ]);
      setRestricted(r.restricted ?? []);
      setOverrides(o.overrides ?? []);
    } catch (e: any) {
      show(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const addRestricted = async () => {
    if (!newPattern.trim()) return;
    try {
      await api("/names/restricted", { method: "POST", body: { pattern: newPattern, reason: newReason } });
      show("Restricted name pattern added", "success");
      setNewPattern("");
      setNewReason("");
      refresh();
    } catch (e: any) { show(e.message, "error"); }
  };

  const removeRestricted = async (id: string) => {
    try {
      await api(`/names/restricted/${id}`, { method: "DELETE" });
      show("Restricted name pattern removed", "success");
      refresh();
    } catch (e: any) { show(e.message, "error"); }
  };

  const removeOverride = async (sessionId: string) => {
    try {
      await api(`/clients/${sessionId}/name`, { method: "DELETE" });
      show("Name override removed", "success");
      refresh();
    } catch (e: any) { show(e.message, "error"); }
  };

  const ago = (ts: number) => {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  if (loading) return <p style={{ color: "var(--muted)" }}>Loading...</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Restricted Name Patterns */}
      <div>
        <h2 className="section-title">Restricted Name Patterns</h2>
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: 0 }}>
            Clients will be prevented from using names matching these patterns (case-insensitive exact match).
          </p>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="text"
              placeholder="Name pattern..."
              value={newPattern}
              onChange={(e) => setNewPattern(e.target.value)}
              maxLength={50}
              style={{ flex: 1 }}
            />
            <input
              type="text"
              placeholder="Reason (optional)..."
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              maxLength={200}
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" onClick={addRestricted}>Add</button>
          </div>
        </div>

        {restricted.length > 0 && (
          <div className="card" style={{ padding: 0, overflow: "auto", marginTop: "0.75rem" }}>
            <table>
              <thead>
                <tr>
                  <th>Pattern</th>
                  <th>Reason</th>
                  <th>Added</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {restricted.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontFamily: "monospace", fontWeight: 500 }}>{r.pattern}</td>
                    <td style={{ color: "var(--muted)" }}>{r.reason || "--"}</td>
                    <td style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{ago(r.createdAt)}</td>
                    <td>
                      <button
                        className="btn btn-danger"
                        style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                        onClick={() => removeRestricted(r.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {restricted.length === 0 && (
          <p style={{ color: "var(--muted)", fontSize: "0.875rem", marginTop: "0.5rem" }}>No restricted name patterns.</p>
        )}
      </div>

      {/* Active Name Overrides */}
      <div>
        <h2 className="section-title">Active Name Overrides</h2>
        {overrides.length > 0 ? (
          <div className="card" style={{ padding: 0, overflow: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Forced Name</th>
                  <th>Reason</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {overrides.map((o) => (
                  <tr key={o.sessionId}>
                    <td style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>{o.sessionId.slice(0, 12)}...</td>
                    <td style={{ fontWeight: 500 }}>{o.forcedName}</td>
                    <td style={{ color: "var(--muted)" }}>{o.reason || "--"}</td>
                    <td style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{ago(o.updatedAt)}</td>
                    <td>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                        onClick={() => removeOverride(o.sessionId)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>No active name overrides.</p>
        )}
      </div>
    </div>
  );
}
