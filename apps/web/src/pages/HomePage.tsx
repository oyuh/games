import { mutators, queries } from "@games/shared";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { nanoid } from "nanoid";
import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FaGithub } from "react-icons/fa";
import { SiDiscord } from "react-icons/si";
import { addRecentGame, clearRecentGames, getRecentGames, getStoredName, setStoredName } from "../lib/session";

export function HomePage({ sessionId }: { sessionId: string }) {
  const zero = useZero();
  const navigate = useNavigate();
  const [name, setName] = useState(getStoredName());
  const [savedName, setSavedName] = useState(getStoredName());
  const [recentGames, setRecentGames] = useState(getRecentGames());
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"create-imposter" | "create-password" | "join" | null>(null);
  const [imposterMatches] = useQuery(queries.imposter.byCode({ code: joinCode || "______" }));
  const [passwordMatches] = useQuery(queries.password.byCode({ code: joinCode || "______" }));

  useEffect(() => {
    setName(savedName);
  }, [savedName]);

  const syncSessionProfile = async (nextName: string) => {
    await zero
      .mutate(
        mutators.sessions.upsert({
          id: sessionId,
          name: nextName || null
        })
      )
      .server;
  };

  useEffect(() => {
    void syncSessionProfile(savedName);
  }, [zero, sessionId, savedName]);

  const saveName = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    setStoredName(trimmedName);
    setSavedName(trimmedName);
    if (trimmedName) {
      await zero.mutate(mutators.sessions.setName({ id: sessionId, name: trimmedName })).server;
      return;
    }
    await syncSessionProfile("");
  };

  const playAsGuest = async () => {
    setStoredName("");
    setSavedName("");
    setName("");
    await syncSessionProfile("");
  };

  const createImposter = async () => {
    setError(null);
    setPendingAction("create-imposter");
    const id = nanoid();
    try {
      const result = await zero.mutate(mutators.imposter.create({ id, hostId: sessionId })).server;
      if (result.type === "error") {
        setError(result.error.message);
        return;
      }
      navigate(`/imposter/${id}`);
    } finally {
      setPendingAction(null);
    }
  };

  const createPassword = async () => {
    setError(null);
    setPendingAction("create-password");
    const id = nanoid();
    try {
      const result = await zero.mutate(mutators.password.create({ id, hostId: sessionId })).server;
      if (result.type === "error") {
        setError(result.error.message);
        return;
      }
      navigate(`/password/${id}/begin`);
    } finally {
      setPendingAction(null);
    }
  };

  const joinAny = async () => {
    setError(null);
    setPendingAction("join");

    const normalizedCode = joinCode.trim().toUpperCase();
    if (!normalizedCode) {
      setError("Enter a join code first.");
      setPendingAction(null);
      return;
    }

    try {
      const imposterGame = imposterMatches[0];
      if (imposterGame) {
        const result = await zero
          .mutate(mutators.imposter.join({ gameId: imposterGame.id, sessionId }))
          .server;
        if (result.type === "error") {
          setError(result.error.message);
          return;
        }
        addRecentGame({ id: imposterGame.id, code: imposterGame.code, gameType: "imposter" });
        setRecentGames(getRecentGames());
        navigate(`/imposter/${imposterGame.id}`);
        return;
      }

      const passwordGame = passwordMatches[0];
      if (passwordGame) {
        const result = await zero
          .mutate(mutators.password.join({ gameId: passwordGame.id, sessionId }))
          .server;
        if (result.type === "error") {
          setError(result.error.message);
          return;
        }
        addRecentGame({ id: passwordGame.id, code: passwordGame.code, gameType: "password" });
        setRecentGames(getRecentGames());
        navigate(`/password/${passwordGame.id}/begin`);
        return;
      }

      setError("No game found for that code.");
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <main className="min-h-[80vh] flex flex-col items-center justify-start px-4 py-8 relative">
      {/* Heading */}
      <div className="mb-8 text-center">
        <h1 className="gradient-heading text-4xl font-extrabold uppercase tracking-widest mb-2">
          Start A Game
        </h1>
        <p style={{ color: "var(--secondary)", fontSize: "0.95rem" }}>
          Create a room, share the code, play instantly.
        </p>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-5xl">

        {/* ── Profile card ─────────────────────────────────── */}
        <div className="card p-6 flex flex-col gap-4">
          <div>
            <h2 className="gradient-heading text-xl font-bold uppercase tracking-widest mb-1">
              Profile
            </h2>
            <p style={{ color: "var(--secondary)", fontSize: "0.8rem" }}>
              Set your display name for rooms.
            </p>
          </div>
          <div className="panel flex flex-col gap-3">
            {savedName && (
              <p style={{ color: "var(--muted-foreground)", fontSize: "0.8rem" }}>
                Playing as: <strong style={{ color: "var(--primary)" }}>{savedName}</strong>
              </p>
            )}
            <form className="flex flex-col gap-2" onSubmit={saveName}>
              <label style={{ color: "var(--muted-foreground)", fontSize: "0.8rem", fontWeight: 600 }}>
                Your name
              </label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter display name"
                maxLength={32}
              />
              <div className="flex gap-2 mt-1">
                <button type="submit" className="btn btn-primary flex-1">
                  Save
                </button>
                <button type="button" className="btn btn-muted flex-1" onClick={() => void playAsGuest()}>
                  Guest
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* ── Imposter card ─────────────────────────────────── */}
        <div className="card p-6 flex flex-col gap-4">
          <div>
            <h2 className="gradient-heading text-xl font-bold uppercase tracking-widest mb-1">
              Imposter
            </h2>
            <p style={{ color: "var(--secondary)", fontSize: "0.8rem" }}>
              One player is the imposter. Give clues, find the liar, vote them out.
            </p>
          </div>
          <div className="panel flex-1 flex flex-col gap-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
            <div className="flex items-center gap-2">
              <span style={{ color: "var(--primary)" }}>•</span> 4–10 players
            </div>
            <div className="flex items-center gap-2">
              <span style={{ color: "var(--primary)" }}>•</span> Secret word + clues
            </div>
            <div className="flex items-center gap-2">
              <span style={{ color: "var(--primary)" }}>•</span> Multiple rounds
            </div>
          </div>
          <button
            className="btn btn-primary w-full mt-auto"
            onClick={() => void createImposter()}
            disabled={pendingAction !== null}
          >
            {pendingAction === "create-imposter" ? "Creating…" : "Create Imposter Room"}
          </button>
        </div>

        {/* ── Password card ─────────────────────────────────── */}
        <div className="card p-6 flex flex-col gap-4">
          <div>
            <h2 className="gradient-heading text-xl font-bold uppercase tracking-widest mb-1">
              Password
            </h2>
            <p style={{ color: "var(--secondary)", fontSize: "0.8rem" }}>
              Teams take turns giving one-word clues to guess the secret word.
            </p>
          </div>
          <div className="panel flex-1 flex flex-col gap-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
            <div className="flex items-center gap-2">
              <span style={{ color: "var(--primary)" }}>•</span> Team-based
            </div>
            <div className="flex items-center gap-2">
              <span style={{ color: "var(--primary)" }}>•</span> One-word clues only
            </div>
            <div className="flex items-center gap-2">
              <span style={{ color: "var(--primary)" }}>•</span> Timed rounds
            </div>
          </div>
          <button
            className="btn btn-primary w-full mt-auto"
            onClick={() => void createPassword()}
            disabled={pendingAction !== null}
          >
            {pendingAction === "create-password" ? "Creating…" : "Create Password Room"}
          </button>
        </div>

        {/* ── Join card ─────────────────────────────────────── */}
        <div className="card p-6 flex flex-col gap-4">
          <div>
            <h2 className="gradient-heading text-xl font-bold uppercase tracking-widest mb-1">
              Join Game
            </h2>
            <p style={{ color: "var(--secondary)", fontSize: "0.8rem" }}>
              Have a code? Jump into an existing room.
            </p>
          </div>
          <div className="panel flex flex-col gap-3">
            <input
              className="input"
              value={joinCode}
              onChange={(e) =>
                setJoinCode(
                  e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, "")
                    .slice(0, 6)
                )
              }
              placeholder="Enter join code"
              maxLength={6}
            />
            <button
              className="btn btn-primary w-full"
              onClick={() => void joinAny()}
              disabled={pendingAction !== null}
            >
              {pendingAction === "join" ? "Joining…" : "Join"}
            </button>
            {error && (
              <p style={{ color: "#f87171", fontSize: "0.8rem" }}>{error}</p>
            )}
          </div>
        </div>

        {/* ── Recent games card ─────────────────────────────── */}
        <div className="card p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="gradient-heading text-xl font-bold uppercase tracking-widest">
              Recent
            </h2>
            <button
              className="btn btn-muted"
              style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
              onClick={() => {
                clearRecentGames();
                setRecentGames([]);
              }}
              disabled={!recentGames.length}
            >
              Clear
            </button>
          </div>
          {recentGames.length ? (
            <div className="panel flex flex-col gap-2">
              {recentGames.map((game) => (
                <div
                  key={`${game.gameType}-${game.id}`}
                  className="flex items-center justify-between gap-2"
                  style={{
                    padding: "0.5rem 0.75rem",
                    borderRadius: "0.5rem",
                    background: "color-mix(in srgb, var(--primary) 8%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--primary) 20%, transparent)",
                  }}
                >
                  <div>
                    <p style={{ fontSize: "0.7rem", color: "var(--secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      {game.gameType}
                    </p>
                    <p style={{ fontSize: "1rem", fontWeight: 700, letterSpacing: "0.15em", color: "var(--primary)" }}>
                      {game.code}
                    </p>
                  </div>
                  <Link
                    to={game.gameType === "imposter" ? `/imposter/${game.id}` : `/password/${game.id}/begin`}
                    className="btn btn-ghost"
                    style={{ fontSize: "0.75rem", padding: "0.3rem 0.7rem" }}
                  >
                    Rejoin
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: "var(--secondary)", fontSize: "0.85rem" }}>
              No recent games yet.
            </p>
          )}
        </div>

        {/* ── Social / Links card ───────────────────────────── */}
        <div className="card p-6 flex flex-col gap-4">
          <div>
            <h2 className="gradient-heading text-xl font-bold uppercase tracking-widest mb-1">
              Links
            </h2>
            <p style={{ color: "var(--secondary)", fontSize: "0.8rem" }}>
              Stay connected and follow updates.
            </p>
          </div>
          <div className="panel flex flex-col gap-2">
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="social-link"
            >
              <span className="flex items-center gap-2">
                <FaGithub size={16} /> GitHub
              </span>
              <span style={{ fontSize: "0.75rem", color: "var(--secondary)" }}>→</span>
            </a>
            <a
              href="https://discord.com"
              target="_blank"
              rel="noopener noreferrer"
              className="social-link"
            >
              <span className="flex items-center gap-2">
                <SiDiscord size={16} /> Discord
              </span>
              <span style={{ fontSize: "0.75rem", color: "var(--secondary)" }}>→</span>
            </a>
          </div>
        </div>

      </div>
    </main>
  );
}
