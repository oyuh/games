import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiExternalLink, FiRefreshCw, FiShield, FiZap } from "react-icons/fi";
import "../styles/admin.css";
import { showToast } from "../lib/toast";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const ADMIN_TOKEN_STORAGE_KEY = "games.admin.token";

type AdminShikakuScore = {
  id: string;
  sessionId: string;
  name: string;
  seed: number;
  difficulty: "easy" | "medium" | "hard" | "expert";
  score: number;
  timeMs: number;
  puzzleCount: number;
  createdAt: number;
};

type AdminPipsScore = {
  id: string;
  sessionId: string;
  name: string;
  seed: number;
  totalMs: number;
  easyMs: number;
  mediumMs: number;
  hardMs: number;
  puzzleCount: number;
  createdAt: number;
};

type ScoreListResponse<T> = {
  ok: true;
  scores: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type ShikakuFormState = {
  sessionId: string;
  name: string;
  seed: string;
  difficulty: AdminShikakuScore["difficulty"];
  score: string;
  timeMs: string;
  puzzleCount: string;
  createdAtLocal: string;
};

type PipsFormState = {
  sessionId: string;
  name: string;
  seed: string;
  easyMs: string;
  mediumMs: string;
  hardMs: string;
  totalMs: string;
  puzzleCount: string;
  createdAtLocal: string;
};

const SHIKAKU_PRESETS: Array<{ label: string; note: string; values: ShikakuFormState }> = [
  {
    label: "Easy Example",
    note: "Typical clean easy run",
    values: {
      sessionId: "admin-seeded-easy",
      name: "Lawson",
      seed: "182734",
      difficulty: "easy",
      score: "7480",
      timeMs: "103500",
      puzzleCount: "5",
      createdAtLocal: "",
    },
  },
  {
    label: "Hard Example",
    note: "Solid ranked hard score",
    values: {
      sessionId: "admin-seeded-hard",
      name: "Lawson",
      seed: "934971",
      difficulty: "hard",
      score: "18240",
      timeMs: "166200",
      puzzleCount: "5",
      createdAtLocal: "",
    },
  },
];

const PIPS_PRESETS: Array<{ label: string; note: string; values: PipsFormState }> = [
  {
    label: "Clean Run",
    note: "Balanced three-split ranked run",
    values: {
      sessionId: "admin-pips-clean",
      name: "Lawson",
      seed: "934971",
      easyMs: "22840",
      mediumMs: "35120",
      hardMs: "51640",
      totalMs: "109600",
      puzzleCount: "3",
      createdAtLocal: "",
    },
  },
  {
    label: "Fast Run",
    note: "More competitive total time",
    values: {
      sessionId: "admin-pips-fast",
      name: "Lawson",
      seed: "482115",
      easyMs: "19120",
      mediumMs: "30980",
      hardMs: "46740",
      totalMs: "96840",
      puzzleCount: "3",
      createdAtLocal: "",
    },
  },
];

const EMPTY_SHIKAKU_FORM: ShikakuFormState = {
  sessionId: "",
  name: "",
  seed: "",
  difficulty: "easy",
  score: "",
  timeMs: "",
  puzzleCount: "5",
  createdAtLocal: "",
};

const EMPTY_PIPS_FORM: PipsFormState = {
  sessionId: "",
  name: "",
  seed: "",
  easyMs: "",
  mediumMs: "",
  hardMs: "",
  totalMs: "",
  puzzleCount: "3",
  createdAtLocal: "",
};

function formatMs(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

function toDatetimeLocal(timestamp: number) {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDatetimeLocal(value: string) {
  if (!value.trim()) return undefined;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function normalizeAdminToken(value: string) {
  return value.trim().replace(/^Bearer\s+/i, "");
}

async function fetchAdmin<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });

  const payload = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? `Request failed (${response.status})`);
  }

  return payload as T;
}

export function AdminScoresPage() {
  const [tokenInput, setTokenInput] = useState("");
  const [activeToken, setActiveToken] = useState("");
  const [activeTab, setActiveTab] = useState<"shikaku" | "pips">("shikaku");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState<"shikaku" | "pips" | null>(null);
  const [shikakuRecent, setShikakuRecent] = useState<AdminShikakuScore[]>([]);
  const [pipsRecent, setPipsRecent] = useState<AdminPipsScore[]>([]);
  const [shikakuForm, setShikakuForm] = useState<ShikakuFormState>(EMPTY_SHIKAKU_FORM);
  const [pipsForm, setPipsForm] = useState<PipsFormState>(EMPTY_PIPS_FORM);

  useEffect(() => {
    const saved = normalizeAdminToken(window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? "");
    setTokenInput(saved);
    setActiveToken(saved);
  }, []);

  useEffect(() => {
    if (!activeToken) return;
    void loadRecentScores(activeToken);
  }, [activeToken]);

  const loadRecentScores = async (token = activeToken) => {
    const normalizedToken = normalizeAdminToken(token);
    if (!normalizedToken) {
      showToast("Enter your admin token first.", "error");
      return;
    }

    setLoading(true);
    try {
      const [shikaku, pips] = await Promise.all([
        fetchAdmin<ScoreListResponse<AdminShikakuScore>>("/api/admin/shikaku/scores?pageSize=6", normalizedToken),
        fetchAdmin<ScoreListResponse<AdminPipsScore>>("/api/admin/pips/scores?pageSize=6", normalizedToken),
      ]);
      setShikakuRecent(shikaku.scores);
      setPipsRecent(pips.scores);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Couldn't load admin scores", "error");
    } finally {
      setLoading(false);
    }
  };

  const saveToken = () => {
    const trimmed = normalizeAdminToken(tokenInput);
    if (!trimmed) {
      showToast("Enter your admin token first.", "error");
      return;
    }
    window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, trimmed);
    setActiveToken(trimmed);
    showToast("Admin token saved.", "success");
  };

  const submitShikaku = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeToken) {
      showToast("Enter your admin token first.", "error");
      return;
    }

    setSubmitting("shikaku");
    try {
      await fetchAdmin("/api/admin/shikaku/scores", activeToken, {
        method: "POST",
        body: JSON.stringify({
          sessionId: shikakuForm.sessionId.trim(),
          name: shikakuForm.name.trim(),
          seed: Number.parseInt(shikakuForm.seed, 10),
          difficulty: shikakuForm.difficulty,
          score: Number.parseInt(shikakuForm.score, 10),
          timeMs: Number.parseInt(shikakuForm.timeMs, 10),
          puzzleCount: Number.parseInt(shikakuForm.puzzleCount, 10),
          createdAt: fromDatetimeLocal(shikakuForm.createdAtLocal),
        }),
      });
      showToast("Shikaku score added.", "success");
      await loadRecentScores(activeToken);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Couldn't add Shikaku score", "error");
    } finally {
      setSubmitting(null);
    }
  };

  const submitPips = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeToken) {
      showToast("Enter your admin token first.", "error");
      return;
    }

    setSubmitting("pips");
    try {
      await fetchAdmin("/api/admin/pips/scores", activeToken, {
        method: "POST",
        body: JSON.stringify({
          sessionId: pipsForm.sessionId.trim(),
          name: pipsForm.name.trim(),
          seed: Number.parseInt(pipsForm.seed, 10),
          easyMs: Number.parseInt(pipsForm.easyMs, 10),
          mediumMs: Number.parseInt(pipsForm.mediumMs, 10),
          hardMs: Number.parseInt(pipsForm.hardMs, 10),
          totalMs: Number.parseInt(pipsForm.totalMs, 10),
          puzzleCount: Number.parseInt(pipsForm.puzzleCount, 10),
          createdAt: fromDatetimeLocal(pipsForm.createdAtLocal),
        }),
      });
      showToast("Pips score added.", "success");
      await loadRecentScores(activeToken);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Couldn't add Pips score", "error");
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="admin-scores-page">
      <header className="admin-scores-hero">
        <div>
          <p className="admin-scores-kicker">Admin</p>
          <h1>Solo Score Entry</h1>
          <p className="admin-scores-subtitle">
            Add Shikaku and Pips leaderboard rows manually, using recent scores and quick-fill presets as examples.
          </p>
        </div>
        <Link to="/" className="btn btn-muted">
          Back Home
        </Link>
      </header>

      <section className="admin-scores-card admin-scores-auth">
        <div className="admin-scores-auth-copy">
          <h2>
            <FiShield size={18} />
            Admin Token
          </h2>
          <p>This stays in local storage on this browser so you do not have to paste it every time.</p>
        </div>
        <div className="admin-scores-auth-controls">
          <input
            className="input"
            type="password"
            value={tokenInput}
            onChange={(event) => setTokenInput(event.target.value)}
            placeholder="Bearer secret"
          />
          <button className="btn btn-primary" type="button" onClick={saveToken}>
            Save Token
          </button>
          <button className="btn btn-muted" type="button" onClick={() => void loadRecentScores(tokenInput)}>
            <FiRefreshCw size={16} />
            Refresh
          </button>
        </div>
      </section>

      <section className="admin-scores-card">
        <div className="admin-scores-tabs">
          <button
            type="button"
            className={`admin-scores-tab${activeTab === "shikaku" ? " admin-scores-tab--active" : ""}`}
            onClick={() => setActiveTab("shikaku")}
          >
            Shikaku
          </button>
          <button
            type="button"
            className={`admin-scores-tab${activeTab === "pips" ? " admin-scores-tab--active" : ""}`}
            onClick={() => setActiveTab("pips")}
          >
            Pips
          </button>
        </div>

        {activeTab === "shikaku" ? (
          <div className="admin-scores-layout">
            <form className="admin-scores-form" onSubmit={submitShikaku}>
              <div className="admin-scores-section-head">
                <div>
                  <h2>New Shikaku Score</h2>
                  <p>Fields match the leaderboard table exactly. Leave created time blank to use right now.</p>
                </div>
                <button className="btn btn-muted" type="button" onClick={() => setShikakuForm(EMPTY_SHIKAKU_FORM)}>
                  Reset
                </button>
              </div>

              <div className="admin-scores-grid">
                <label className="admin-scores-field">
                  <span>Session ID</span>
                  <input className="input" value={shikakuForm.sessionId} onChange={(event) => setShikakuForm((prev) => ({ ...prev, sessionId: event.target.value }))} placeholder="session_lawson_01" />
                </label>
                <label className="admin-scores-field">
                  <span>Name</span>
                  <input className="input" value={shikakuForm.name} onChange={(event) => setShikakuForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Lawson" />
                </label>
                <label className="admin-scores-field">
                  <span>Seed</span>
                  <input className="input" inputMode="numeric" value={shikakuForm.seed} onChange={(event) => setShikakuForm((prev) => ({ ...prev, seed: event.target.value }))} placeholder="934971" />
                </label>
                <label className="admin-scores-field">
                  <span>Difficulty</span>
                  <select className="input" value={shikakuForm.difficulty} onChange={(event) => setShikakuForm((prev) => ({ ...prev, difficulty: event.target.value as ShikakuFormState["difficulty"] }))}>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                    <option value="expert">Expert</option>
                  </select>
                </label>
                <label className="admin-scores-field">
                  <span>Score</span>
                  <input className="input" inputMode="numeric" value={shikakuForm.score} onChange={(event) => setShikakuForm((prev) => ({ ...prev, score: event.target.value }))} placeholder="12450" />
                </label>
                <label className="admin-scores-field">
                  <span>Time (ms)</span>
                  <input className="input" inputMode="numeric" value={shikakuForm.timeMs} onChange={(event) => setShikakuForm((prev) => ({ ...prev, timeMs: event.target.value }))} placeholder="84231" />
                </label>
                <label className="admin-scores-field">
                  <span>Puzzle Count</span>
                  <input className="input" inputMode="numeric" value={shikakuForm.puzzleCount} onChange={(event) => setShikakuForm((prev) => ({ ...prev, puzzleCount: event.target.value }))} placeholder="5" />
                </label>
                <label className="admin-scores-field">
                  <span>Created At</span>
                  <input className="input" type="datetime-local" value={shikakuForm.createdAtLocal} onChange={(event) => setShikakuForm((prev) => ({ ...prev, createdAtLocal: event.target.value }))} />
                </label>
              </div>

              <div className="admin-scores-actions">
                <button className="btn btn-primary" type="submit" disabled={submitting === "shikaku"}>
                  {submitting === "shikaku" ? "Adding…" : "Add Shikaku Score"}
                </button>
              </div>
            </form>

            <aside className="admin-scores-sidebar">
              <div className="admin-scores-panel">
                <h3>Quick Presets</h3>
                <div className="admin-score-example-list">
                  {SHIKAKU_PRESETS.map((preset) => (
                    <button key={preset.label} type="button" className="admin-score-example" onClick={() => setShikakuForm(preset.values)}>
                      <strong>{preset.label}</strong>
                      <span>{preset.note}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="admin-scores-panel">
                <div className="admin-scores-panel-head">
                  <h3>Recent Scores</h3>
                  {loading && <span className="admin-scores-panel-note">Loading…</span>}
                </div>
                <div className="admin-score-recent-list">
                  {shikakuRecent.map((score) => (
                    <button
                      key={score.id}
                      type="button"
                      className="admin-score-recent"
                      onClick={() => setShikakuForm({
                        sessionId: score.sessionId,
                        name: score.name,
                        seed: String(score.seed),
                        difficulty: score.difficulty,
                        score: String(score.score),
                        timeMs: String(score.timeMs),
                        puzzleCount: String(score.puzzleCount),
                        createdAtLocal: toDatetimeLocal(score.createdAt),
                      })}
                    >
                      <span className="admin-score-recent-main">{score.name} · {score.difficulty}</span>
                      <span className="admin-score-recent-meta">{score.score.toLocaleString()} · {formatMs(score.timeMs)}</span>
                    </button>
                  ))}
                  {shikakuRecent.length === 0 && !loading && <p className="admin-scores-empty">No Shikaku scores loaded yet.</p>}
                </div>
              </div>
            </aside>
          </div>
        ) : (
          <div className="admin-scores-layout">
            <form className="admin-scores-form" onSubmit={submitPips}>
              <div className="admin-scores-section-head">
                <div>
                  <h2>New Pips Score</h2>
                  <p>Use the split fields plus total. The API checks that total matches Easy + Medium + Hard.</p>
                </div>
                <button className="btn btn-muted" type="button" onClick={() => setPipsForm(EMPTY_PIPS_FORM)}>
                  Reset
                </button>
              </div>

              <div className="admin-scores-grid">
                <label className="admin-scores-field">
                  <span>Session ID</span>
                  <input className="input" value={pipsForm.sessionId} onChange={(event) => setPipsForm((prev) => ({ ...prev, sessionId: event.target.value }))} placeholder="session_lawson_01" />
                </label>
                <label className="admin-scores-field">
                  <span>Name</span>
                  <input className="input" value={pipsForm.name} onChange={(event) => setPipsForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Lawson" />
                </label>
                <label className="admin-scores-field">
                  <span>Seed</span>
                  <input className="input" inputMode="numeric" value={pipsForm.seed} onChange={(event) => setPipsForm((prev) => ({ ...prev, seed: event.target.value }))} placeholder="934971" />
                </label>
                <label className="admin-scores-field">
                  <span>Easy (ms)</span>
                  <input className="input" inputMode="numeric" value={pipsForm.easyMs} onChange={(event) => setPipsForm((prev) => ({ ...prev, easyMs: event.target.value }))} placeholder="22840" />
                </label>
                <label className="admin-scores-field">
                  <span>Medium (ms)</span>
                  <input className="input" inputMode="numeric" value={pipsForm.mediumMs} onChange={(event) => setPipsForm((prev) => ({ ...prev, mediumMs: event.target.value }))} placeholder="35120" />
                </label>
                <label className="admin-scores-field">
                  <span>Hard (ms)</span>
                  <input className="input" inputMode="numeric" value={pipsForm.hardMs} onChange={(event) => setPipsForm((prev) => ({ ...prev, hardMs: event.target.value }))} placeholder="51640" />
                </label>
                <label className="admin-scores-field">
                  <span>Total (ms)</span>
                  <input className="input" inputMode="numeric" value={pipsForm.totalMs} onChange={(event) => setPipsForm((prev) => ({ ...prev, totalMs: event.target.value }))} placeholder="109600" />
                </label>
                <label className="admin-scores-field">
                  <span>Puzzle Count</span>
                  <input className="input" inputMode="numeric" value={pipsForm.puzzleCount} onChange={(event) => setPipsForm((prev) => ({ ...prev, puzzleCount: event.target.value }))} placeholder="3" />
                </label>
                <label className="admin-scores-field">
                  <span>Created At</span>
                  <input className="input" type="datetime-local" value={pipsForm.createdAtLocal} onChange={(event) => setPipsForm((prev) => ({ ...prev, createdAtLocal: event.target.value }))} />
                </label>
              </div>

              <div className="admin-scores-actions">
                <button className="btn btn-primary" type="submit" disabled={submitting === "pips"}>
                  {submitting === "pips" ? "Adding…" : "Add Pips Score"}
                </button>
                <button
                  className="btn btn-muted"
                  type="button"
                  onClick={() => setPipsForm((prev) => {
                    const easyMs = Number.parseInt(prev.easyMs, 10) || 0;
                    const mediumMs = Number.parseInt(prev.mediumMs, 10) || 0;
                    const hardMs = Number.parseInt(prev.hardMs, 10) || 0;
                    return { ...prev, totalMs: String(easyMs + mediumMs + hardMs) };
                  })}
                >
                  <FiZap size={16} />
                  Sum Splits
                </button>
              </div>
            </form>

            <aside className="admin-scores-sidebar">
              <div className="admin-scores-panel">
                <h3>Quick Presets</h3>
                <div className="admin-score-example-list">
                  {PIPS_PRESETS.map((preset) => (
                    <button key={preset.label} type="button" className="admin-score-example" onClick={() => setPipsForm(preset.values)}>
                      <strong>{preset.label}</strong>
                      <span>{preset.note}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="admin-scores-panel">
                <div className="admin-scores-panel-head">
                  <h3>Recent Scores</h3>
                  {loading && <span className="admin-scores-panel-note">Loading…</span>}
                </div>
                <div className="admin-score-recent-list">
                  {pipsRecent.map((score) => (
                    <button
                      key={score.id}
                      type="button"
                      className="admin-score-recent"
                      onClick={() => setPipsForm({
                        sessionId: score.sessionId,
                        name: score.name,
                        seed: String(score.seed),
                        easyMs: String(score.easyMs),
                        mediumMs: String(score.mediumMs),
                        hardMs: String(score.hardMs),
                        totalMs: String(score.totalMs),
                        puzzleCount: String(score.puzzleCount),
                        createdAtLocal: toDatetimeLocal(score.createdAt),
                      })}
                    >
                      <span className="admin-score-recent-main">{score.name} · seed {score.seed}</span>
                      <span className="admin-score-recent-meta">{formatMs(score.totalMs)} · {formatMs(score.easyMs)} / {formatMs(score.mediumMs)} / {formatMs(score.hardMs)}</span>
                    </button>
                  ))}
                  {pipsRecent.length === 0 && !loading && <p className="admin-scores-empty">No Pips scores loaded yet.</p>}
                </div>
              </div>
            </aside>
          </div>
        )}
      </section>

      <section className="admin-scores-card admin-scores-footnote">
        <p>
          Need a coffee link for manual backfills too?{" "}
          <a href="https://buymeacoffee.com/lawsonhart" target="_blank" rel="noreferrer">
            Support hosting
            <FiExternalLink size={14} />
          </a>
        </p>
      </section>
    </div>
  );
}
