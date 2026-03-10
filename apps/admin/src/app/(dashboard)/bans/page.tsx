"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { useToast } from "@/components/Toast";

type Ban = {
  id: string;
  type: "session" | "ip" | "region";
  value: string;
  reason: string;
  createdAt: number;
};

export default function BansPage() {
  const { show } = useToast();
  const [bans, setBans] = useState<Ban[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newType, setNewType] = useState<"session" | "ip" | "region">("ip");
  const [newValue, setNewValue] = useState("");
  const [newReason, setNewReason] = useState("");

  const refresh = async () => {
    try {
      const data = await api("/bans");
      setBans(data.bans ?? []);
    } catch (e: any) { show(e.message, "error"); }
    finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

  const addBan = async () => {
    if (!newValue.trim()) return;
    try {
      await api("/bans", { method: "POST", body: { type: newType, value: newValue.trim(), reason: newReason.trim() } });
      show("Ban added", "success");
      setShowAdd(false);
      setNewValue("");
      setNewReason("");
      refresh();
    } catch (e: any) { show(e.message, "error"); }
  };

  const removeBan = async (id: string) => {
    if (!confirm("Remove this ban?")) return;
    try {
      await api(`/bans/${id}`, { method: "DELETE" });
      show("Ban removed", "success");
      refresh();
    } catch (e: any) { show(e.message, "error"); }
  };

  const typeColor = (t: string) => {
    if (t === "ip") return "badge-red";
    if (t === "region") return "badge-yellow";
    return "badge-blue";
  };

  if (loading) return <p style={{ color: "#888" }}>Loading...</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="section-title" style={{ margin: 0 }}>Bans ({bans.length})</h2>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add Ban</button>
      </div>

      {showAdd && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ fontSize: "0.875rem", fontWeight: 500 }}>New Ban</div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <select value={newType} onChange={(e) => setNewType(e.target.value as any)} style={{ width: "auto" }}>
              <option value="ip">IP Address</option>
              <option value="region">Region</option>
              <option value="session">Session ID</option>
            </select>
            <input
              type="text"
              placeholder={newType === "ip" ? "e.g. 1.2.3.4" : newType === "region" ? "e.g. US, CN" : "Session ID"}
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              style={{ flex: 1 }}
              maxLength={200}
            />
          </div>
          <input
            type="text"
            placeholder="Reason (optional)"
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
            maxLength={200}
          />
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn btn-primary" onClick={addBan}>Add Ban</button>
            <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Value</th>
              <th>Reason</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {bans.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: "center", color: "#888" }}>No active bans</td></tr>
            )}
            {bans.map((b) => (
              <tr key={b.id}>
                <td><span className={`badge ${typeColor(b.type)}`}>{b.type}</span></td>
                <td style={{ fontFamily: "monospace", fontSize: "0.8125rem" }}>{b.value}</td>
                <td>{b.reason || "—"}</td>
                <td style={{ fontSize: "0.75rem", color: "#888" }}>
                  {new Date(b.createdAt).toLocaleString()}
                </td>
                <td>
                  <button
                    className="btn btn-danger"
                    style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                    onClick={() => removeBan(b.id)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: "0.75rem", color: "#666" }}>
        Note: Bans are stored in-memory on the API server. They will reset when the API restarts.
        IP bans will disconnect all clients with the banned IP immediately.
      </div>
    </div>
  );
}
