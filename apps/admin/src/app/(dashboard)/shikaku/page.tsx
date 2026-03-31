"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { useToast } from "@/components/Toast";
import { Pagination } from "@/components/Pagination";

type Score = {
  id: string;
  sessionId: string;
  name: string;
  seed: number;
  difficulty: string;
  score: number;
  timeMs: number;
  puzzleCount: number;
  createdAt: number;
};

const DIFFICULTIES = ["all", "easy", "medium", "hard", "expert"] as const;

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

export default function ShikakuPage() {
  const { show } = useToast();
  const [scores, setScores] = useState<Score[]>([]);
  const [loading, setLoading] = useState(true);
  const [difficulty, setDifficulty] = useState<string>("all");
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; score: string; timeMs: string }>({ name: "", score: "", timeMs: "" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const refresh = async (p = page, ps = pageSize) => {
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(ps) });
      if (difficulty !== "all") params.set("difficulty", difficulty);
      const data = await api(`/shikaku/scores?${params}`);
      setScores(data.scores ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch (e: any) {
      show(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    setPage(1);
    refresh(1, pageSize);
  }, [difficulty]);

  useEffect(() => {
    refresh(page, pageSize);
  }, [page, pageSize]);

  const startEdit = (s: Score) => {
    setEditing(s.id);
    setEditForm({ name: s.name, score: String(s.score), timeMs: String(s.timeMs) });
  };

  const saveEdit = async (id: string) => {
    const body: Record<string, unknown> = {};
    const orig = scores.find((s) => s.id === id);
    if (!orig) return;

    if (editForm.name !== orig.name) body.name = editForm.name;
    if (editForm.score !== String(orig.score)) body.score = Number(editForm.score);
    if (editForm.timeMs !== String(orig.timeMs)) body.timeMs = Number(editForm.timeMs);

    if (Object.keys(body).length === 0) {
      setEditing(null);
      return;
    }

    try {
      await api(`/shikaku/scores/${id}`, { method: "PATCH", body });
      show("Score updated", "success");
      setEditing(null);
      refresh(page, pageSize);
    } catch (e: any) {
      show(e.message, "error");
    }
  };

  const deleteScore = async (id: string) => {
    if (!confirm("Delete this score entry?")) return;
    try {
      await api(`/shikaku/scores/${id}`, { method: "DELETE" });
      show("Score deleted", "success");
      refresh(page, pageSize);
    } catch (e: any) {
      show(e.message, "error");
    }
  };

  const clearDifficulty = async () => {
    const label = difficulty === "all" ? "ALL scores" : `all ${difficulty} scores`;
    if (!confirm(`Really delete ${label}? This cannot be undone.`)) return;
    try {
      await api("/shikaku/scores", {
        method: "DELETE",
        body: difficulty === "all" ? {} : { difficulty },
      });
      show(`Cleared ${label}`, "success");
      setPage(1);
      refresh(1, pageSize);
    } catch (e: any) {
      show(e.message, "error");
    }
  };

  const diffColor = (d: string) => {
    if (d === "easy") return "badge-green";
    if (d === "medium") return "badge-yellow";
    if (d === "hard") return "badge-red";
    if (d === "expert") return "badge-purple";
    return "badge-blue";
  };

  if (loading) return <p style={{ color: "var(--muted)" }}>Loading...</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
        <h2 className="section-title" style={{ margin: 0 }}>Shikaku Leaderboard ({total})</h2>
        <button className="btn btn-danger" onClick={clearDifficulty}>
          Clear {difficulty === "all" ? "All" : difficulty} Scores
        </button>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {DIFFICULTIES.map((d) => (
          <button
            key={d}
            className={`btn ${difficulty === d ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setDifficulty(d)}
            style={{ textTransform: "capitalize" }}
          >
            {d}
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Score</th>
              <th>Time</th>
              <th>Difficulty</th>
              <th>Session</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {scores.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", color: "var(--muted)" }}>
                  No scores found
                </td>
              </tr>
            )}
            {scores.map((s, i) => (
              <tr key={s.id}>
                <td style={{ fontWeight: 600, color: "var(--muted)" }}>{(page - 1) * pageSize + i + 1}</td>

                {editing === s.id ? (
                  <>
                    <td>
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                        style={{ width: "7rem" }}
                        maxLength={20}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={editForm.score}
                        onChange={(e) => setEditForm((f) => ({ ...f, score: e.target.value }))}
                        style={{ width: "5rem" }}
                        min={0}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={editForm.timeMs}
                        onChange={(e) => setEditForm((f) => ({ ...f, timeMs: e.target.value }))}
                        style={{ width: "6rem" }}
                        min={0}
                      />
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ fontWeight: 500 }}>{s.name}</td>
                    <td>{s.score.toLocaleString()}</td>
                    <td>{formatTime(s.timeMs)}</td>
                  </>
                )}

                <td>
                  <span className={`badge ${diffColor(s.difficulty)}`}>{s.difficulty}</span>
                </td>
                <td style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
                  {s.sessionId.slice(0, 10)}...
                </td>
                <td style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                  {new Date(s.createdAt).toLocaleString()}
                </td>
                <td style={{ display: "flex", gap: "0.25rem" }}>
                  {editing === s.id ? (
                    <>
                      <button
                        className="btn btn-primary"
                        style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                        onClick={() => saveEdit(s.id)}
                      >
                        Save
                      </button>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                        onClick={() => startEdit(s)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-danger"
                        style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                        onClick={() => deleteScore(s.id)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={pageSize}
        onPageChange={(p) => setPage(p)}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
      />

      <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
        Scores are stored in the database. Edits and deletions are permanent.
        Time is displayed in seconds but stored/edited as milliseconds.
      </div>
    </div>
  );
}
