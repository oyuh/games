import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { FiClock, FiRefreshCw, FiShuffle, FiUploadCloud, FiX } from "react-icons/fi";
import { calculateScore, type Difficulty } from "../../lib/shikaku-engine";
import type { PipsDifficulty } from "../../lib/pips-engine";
import { showToast } from "../../lib/toast";

type AdminGameKind = "shikaku" | "pips";

type AdminSession = {
  sessionId: string;
  name?: string | null;
  gameId?: string | null;
  gameType?: string | null;
  lastSeen?: number | null;
};

type ShikakuDraft = {
  id: string;
  sessionId: string;
  name: string;
  seed: string;
  difficulty: Difficulty;
  score: string;
  timeMs: string;
  puzzleCount: string;
  createdAt: string;
};

type PipsDraft = {
  id: string;
  sessionId: string;
  name: string;
  seed: string;
  totalMs: string;
  easyMs: string;
  mediumMs: string;
  hardMs: string;
  puzzleCount: string;
  createdAt: string;
};

type AdminScoreModalProps = {
  apiBase: string;
  game: AdminGameKind;
  shikakuDefaults?: Partial<Pick<ShikakuDraft, "seed" | "score" | "timeMs" | "puzzleCount">> & {
    difficulty?: Difficulty;
  };
  pipsDefaults?: Partial<Pick<PipsDraft, "seed" | "totalMs" | "easyMs" | "mediumMs" | "hardMs" | "puzzleCount">>;
  onClose: () => void;
  onCreated?: () => void;
};

const ADMIN_TOKEN_STORAGE_KEY = "games.admin.token";
const LEGACY_ADMIN_SECRET_STORAGE_KEY = "games-admin-secret";
const SHIKAKU_DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard", "expert"];
const PIPS_DIFFICULTIES: PipsDifficulty[] = ["easy", "medium", "hard"];

function toLocalDateTimeValue(ms: number) {
  const date = new Date(ms);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromLocalDateTimeValue(value: string) {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function randomInt(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function randomSeed() {
  return randomInt(100_000, 999_999);
}

function shortId(value: string) {
  return value.length <= 12 ? value : `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function sessionDisplayName(session?: AdminSession | null) {
  if (!session) return "";
  const name = session.name?.trim();
  return name || `Player ${shortId(session.sessionId)}`;
}

function makeInitialShikakuDraft(defaults?: AdminScoreModalProps["shikakuDefaults"]): ShikakuDraft {
  const difficulty = defaults?.difficulty ?? "easy";
  const timeMs = Number(defaults?.timeMs ?? 150_000);
  return {
    id: "",
    sessionId: "",
    name: "",
    seed: String(defaults?.seed ?? randomSeed()),
    difficulty,
    score: String(defaults?.score ?? calculateScore(timeMs, difficulty)),
    timeMs: String(timeMs),
    puzzleCount: String(defaults?.puzzleCount ?? 5),
    createdAt: toLocalDateTimeValue(Date.now()),
  };
}

function makeInitialPipsDraft(defaults?: AdminScoreModalProps["pipsDefaults"]): PipsDraft {
  const easyMs = Number(defaults?.easyMs ?? 22_000);
  const mediumMs = Number(defaults?.mediumMs ?? 42_000);
  const hardMs = Number(defaults?.hardMs ?? 68_000);
  const totalMs = Number(defaults?.totalMs ?? easyMs + mediumMs + hardMs);
  return {
    id: "",
    sessionId: "",
    name: "",
    seed: String(defaults?.seed ?? randomSeed()),
    totalMs: String(totalMs),
    easyMs: String(easyMs),
    mediumMs: String(mediumMs),
    hardMs: String(hardMs),
    puzzleCount: String(defaults?.puzzleCount ?? 3),
    createdAt: toLocalDateTimeValue(Date.now()),
  };
}

function readWholeNumber(value: string, label: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a positive number.`);
  }
  return Math.floor(parsed);
}

function formatMs(value: string) {
  const ms = Number(value);
  if (!Number.isFinite(ms)) return "--";
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const tenths = Math.floor((ms % 1000) / 100);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

export function AdminScoreModal({
  apiBase,
  game,
  shikakuDefaults,
  pipsDefaults,
  onClose,
  onCreated,
}: AdminScoreModalProps) {
  const [secret, setSecret] = useState(() => (
    localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)
      ?? localStorage.getItem(LEGACY_ADMIN_SECRET_STORAGE_KEY)
      ?? ""
  ).trim().replace(/^Bearer\s+/i, ""));
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [shikakuDraft, setShikakuDraft] = useState(() => makeInitialShikakuDraft(shikakuDefaults));
  const [pipsDraft, setPipsDraft] = useState(() => makeInitialPipsDraft(pipsDefaults));

  const selectedSession = useMemo(
    () => sessions.find((session) => session.sessionId === selectedSessionId) ?? null,
    [selectedSessionId, sessions],
  );

  const adminFetch = async (path: string, options: RequestInit = {}) => {
    const trimmedSecret = secret.trim().replace(/^Bearer\s+/i, "");
    if (!trimmedSecret) {
      throw new Error("Enter the admin secret first.");
    }

    const response = await fetch(`${apiBase}/api/admin${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${trimmedSecret}`,
        ...options.headers,
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || `Admin API error ${response.status}`);
    }
    localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, trimmedSecret);
    localStorage.removeItem(LEGACY_ADMIN_SECRET_STORAGE_KEY);
    return data;
  };

  const loadSessions = async () => {
    setLoadingSessions(true);
    setStatus(null);
    try {
      const data = await adminFetch("/clients?pageSize=200");
      const nextSessions = (data.clients ?? []) as AdminSession[];
      setSessions(nextSessions);
      setStatus(nextSessions.length ? `Loaded ${nextSessions.length} active session${nextSessions.length === 1 ? "" : "s"}.` : "No active sessions found.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to load active sessions.");
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    if (secret.trim()) {
      void loadSessions();
    }
  }, []);

  const applySession = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    const session = sessions.find((item) => item.sessionId === sessionId);
    if (!session) return;

    const name = sessionDisplayName(session);
    setShikakuDraft((current) => ({ ...current, sessionId: session.sessionId, name }));
    setPipsDraft((current) => ({ ...current, sessionId: session.sessionId, name }));
  };

  const randomizeShikaku = () => {
    setShikakuDraft((current) => {
      const ranges: Record<Difficulty, [number, number]> = {
        easy: [95_000, 210_000],
        medium: [190_000, 430_000],
        hard: [310_000, 650_000],
        expert: [460_000, 880_000],
      };
      const timeMs = randomInt(...ranges[current.difficulty]);
      return {
        ...current,
        seed: String(randomSeed()),
        timeMs: String(timeMs),
        score: String(calculateScore(timeMs, current.difficulty)),
        puzzleCount: "5",
        createdAt: toLocalDateTimeValue(Date.now()),
      };
    });
  };

  const randomizePips = () => {
    const easyMs = randomInt(16_000, 32_000);
    const mediumMs = randomInt(31_000, 58_000);
    const hardMs = randomInt(52_000, 96_000);
    setPipsDraft((current) => ({
      ...current,
      seed: String(randomSeed()),
      easyMs: String(easyMs),
      mediumMs: String(mediumMs),
      hardMs: String(hardMs),
      totalMs: String(easyMs + mediumMs + hardMs),
      puzzleCount: "3",
      createdAt: toLocalDateTimeValue(Date.now()),
    }));
  };

  const updateShikakuTime = (value: string) => {
    setShikakuDraft((current) => {
      const parsed = Number(value);
      return {
        ...current,
        timeMs: value,
        score: Number.isFinite(parsed) && parsed >= 0
          ? String(calculateScore(Math.floor(parsed), current.difficulty))
          : current.score,
      };
    });
  };

  const updateShikakuDifficulty = (difficulty: Difficulty) => {
    setShikakuDraft((current) => {
      const parsed = Number(current.timeMs);
      return {
        ...current,
        difficulty,
        score: Number.isFinite(parsed) && parsed >= 0
          ? String(calculateScore(Math.floor(parsed), difficulty))
          : current.score,
      };
    });
  };

  const updatePipsSplit = (key: "easyMs" | "mediumMs" | "hardMs", value: string) => {
    setPipsDraft((current) => {
      const next = { ...current, [key]: value };
      const easyMs = Number(next.easyMs);
      const mediumMs = Number(next.mediumMs);
      const hardMs = Number(next.hardMs);
      if ([easyMs, mediumMs, hardMs].every((item) => Number.isFinite(item) && item >= 0)) {
        next.totalMs = String(Math.floor(easyMs) + Math.floor(mediumMs) + Math.floor(hardMs));
      }
      return next;
    });
  };

  const submit = async () => {
    setSubmitting(true);
    setStatus(null);
    try {
      if (game === "shikaku") {
        const payload = {
          ...(shikakuDraft.id.trim() ? { id: shikakuDraft.id.trim() } : {}),
          sessionId: shikakuDraft.sessionId.trim(),
          name: shikakuDraft.name.trim(),
          seed: readWholeNumber(shikakuDraft.seed, "Seed"),
          difficulty: shikakuDraft.difficulty,
          score: readWholeNumber(shikakuDraft.score, "Score"),
          timeMs: readWholeNumber(shikakuDraft.timeMs, "Time"),
          puzzleCount: readWholeNumber(shikakuDraft.puzzleCount, "Puzzle count"),
          createdAt: fromLocalDateTimeValue(shikakuDraft.createdAt),
        };
        await adminFetch("/shikaku/scores", { method: "POST", body: JSON.stringify(payload) });
      } else {
        const easyMs = readWholeNumber(pipsDraft.easyMs, "Easy split");
        const mediumMs = readWholeNumber(pipsDraft.mediumMs, "Medium split");
        const hardMs = readWholeNumber(pipsDraft.hardMs, "Hard split");
        const payload = {
          ...(pipsDraft.id.trim() ? { id: pipsDraft.id.trim() } : {}),
          sessionId: pipsDraft.sessionId.trim(),
          name: pipsDraft.name.trim(),
          seed: readWholeNumber(pipsDraft.seed, "Seed"),
          easyMs,
          mediumMs,
          hardMs,
          totalMs: easyMs + mediumMs + hardMs,
          puzzleCount: readWholeNumber(pipsDraft.puzzleCount, "Puzzle count"),
          createdAt: fromLocalDateTimeValue(pipsDraft.createdAt),
        };
        await adminFetch("/pips/scores", { method: "POST", body: JSON.stringify(payload) });
      }

      showToast(`${game === "shikaku" ? "Shikaku score" : "Pips run"} added.`, "success");
      onCreated?.();
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to add score.";
      setStatus(message);
      showToast(message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const title = game === "shikaku" ? "Add Shikaku Score" : "Add Pips Run";
  const accent = game === "shikaku" ? "#34d399" : "#fb923c";

  return (
    <div className="modal-overlay admin-score-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-panel admin-score-modal" style={{ "--admin-score-accent": accent } as CSSProperties}>
        <div className="modal-header admin-score-header">
          <div>
            <p className="admin-score-kicker">Admin</p>
            <h2 className="modal-title admin-score-title">{title}</h2>
          </div>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Close admin score modal">
            <FiX size={18} />
          </button>
        </div>

        <div className="modal-body admin-score-body">
          <section className="admin-score-section">
            <div className="admin-score-section-head">
              <span>Access</span>
              <button className="admin-score-mini-btn" type="button" onClick={() => void loadSessions()} disabled={loadingSessions}>
                <FiRefreshCw size={13} /> {loadingSessions ? "Loading" : "Load Sessions"}
              </button>
            </div>
            <div className="admin-score-grid admin-score-grid--two">
              <label className="admin-score-field">
                <span>Admin token</span>
                <input value={secret} onChange={(event) => setSecret(event.target.value)} type="password" placeholder="ADMIN_TOKEN" />
              </label>
              <label className="admin-score-field">
                <span>Active session</span>
                <select value={selectedSessionId} onChange={(event) => applySession(event.target.value)}>
                  <option value="">Choose active session</option>
                  {sessions.map((session) => (
                    <option key={session.sessionId} value={session.sessionId}>
                      {sessionDisplayName(session)} - {shortId(session.sessionId)} {session.gameType ? `- ${session.gameType}` : "- idle"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {selectedSession && (
              <p className="admin-score-note">
                Selected {sessionDisplayName(selectedSession)} / {selectedSession.gameType ?? "idle"} / {shortId(selectedSession.sessionId)}
              </p>
            )}
          </section>

          {game === "shikaku" ? (
            <section className="admin-score-section">
              <div className="admin-score-section-head">
                <span>Score Fields</span>
                <button className="admin-score-mini-btn" type="button" onClick={randomizeShikaku}>
                  <FiShuffle size={13} /> Randomize
                </button>
              </div>
              <div className="admin-score-grid admin-score-grid--two">
                <TextField label="Record id" value={shikakuDraft.id} placeholder="optional" onChange={(value) => setShikakuDraft((current) => ({ ...current, id: value }))} />
                <TextField label="Session id" value={shikakuDraft.sessionId} onChange={(value) => setShikakuDraft((current) => ({ ...current, sessionId: value }))} />
                <TextField label="Player name" value={shikakuDraft.name} onChange={(value) => setShikakuDraft((current) => ({ ...current, name: value }))} />
                <TextField label="Seed" type="number" value={shikakuDraft.seed} onChange={(value) => setShikakuDraft((current) => ({ ...current, seed: value }))} />
                <label className="admin-score-field">
                  <span>Difficulty</span>
                  <select value={shikakuDraft.difficulty} onChange={(event) => updateShikakuDifficulty(event.target.value as Difficulty)}>
                    {SHIKAKU_DIFFICULTIES.map((difficulty) => (
                      <option key={difficulty} value={difficulty}>{difficulty}</option>
                    ))}
                  </select>
                </label>
                <TextField label="Time ms" type="number" value={shikakuDraft.timeMs} onChange={updateShikakuTime} />
                <TextField label="Score" type="number" value={shikakuDraft.score} onChange={(value) => setShikakuDraft((current) => ({ ...current, score: value }))} />
                <TextField label="Puzzle count" type="number" value={shikakuDraft.puzzleCount} onChange={(value) => setShikakuDraft((current) => ({ ...current, puzzleCount: value }))} />
                <TextField label="Submitted at" type="datetime-local" value={shikakuDraft.createdAt} onChange={(value) => setShikakuDraft((current) => ({ ...current, createdAt: value }))} />
                <div className="admin-score-derived">
                  <FiClock size={14} />
                  <span>{formatMs(shikakuDraft.timeMs)}</span>
                </div>
              </div>
            </section>
          ) : (
            <section className="admin-score-section">
              <div className="admin-score-section-head">
                <span>Run Fields</span>
                <button className="admin-score-mini-btn" type="button" onClick={randomizePips}>
                  <FiShuffle size={13} /> Randomize
                </button>
              </div>
              <div className="admin-score-grid admin-score-grid--two">
                <TextField label="Record id" value={pipsDraft.id} placeholder="optional" onChange={(value) => setPipsDraft((current) => ({ ...current, id: value }))} />
                <TextField label="Session id" value={pipsDraft.sessionId} onChange={(value) => setPipsDraft((current) => ({ ...current, sessionId: value }))} />
                <TextField label="Player name" value={pipsDraft.name} onChange={(value) => setPipsDraft((current) => ({ ...current, name: value }))} />
                <TextField label="Seed" type="number" value={pipsDraft.seed} onChange={(value) => setPipsDraft((current) => ({ ...current, seed: value }))} />
                <TextField label="Easy ms" type="number" value={pipsDraft.easyMs} onChange={(value) => updatePipsSplit("easyMs", value)} />
                <TextField label="Medium ms" type="number" value={pipsDraft.mediumMs} onChange={(value) => updatePipsSplit("mediumMs", value)} />
                <TextField label="Hard ms" type="number" value={pipsDraft.hardMs} onChange={(value) => updatePipsSplit("hardMs", value)} />
                <TextField label="Total ms" type="number" value={pipsDraft.totalMs} onChange={(value) => setPipsDraft((current) => ({ ...current, totalMs: value }))} disabled />
                <TextField label="Puzzle count" type="number" value={pipsDraft.puzzleCount} onChange={(value) => setPipsDraft((current) => ({ ...current, puzzleCount: value }))} />
                <TextField label="Submitted at" type="datetime-local" value={pipsDraft.createdAt} onChange={(value) => setPipsDraft((current) => ({ ...current, createdAt: value }))} />
              </div>
              <div className="admin-score-splits">
                {PIPS_DIFFICULTIES.map((difficulty) => (
                  <span key={difficulty}>{difficulty}: {formatMs(pipsDraft[`${difficulty}Ms` as keyof PipsDraft])}</span>
                ))}
                <strong>Total: {formatMs(pipsDraft.totalMs)}</strong>
              </div>
            </section>
          )}

          {status && <p className="admin-score-status">{status}</p>}

          <div className="admin-score-actions">
            <button className="btn btn-muted" type="button" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary game-action-btn" type="button" onClick={() => void submit()} disabled={submitting}>
              <FiUploadCloud size={16} /> {submitting ? "Adding..." : "Add Score"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="admin-score-field">
      <span>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        min={type === "number" ? 0 : undefined}
        placeholder={placeholder}
        disabled={disabled}
      />
    </label>
  );
}
