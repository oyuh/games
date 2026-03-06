import { imposterCategories, imposterCategoryLabels, mutators, queries } from "@games/shared";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { nanoid } from "nanoid";
import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiChevronLeft, FiChevronRight, FiLink, FiSearch, FiUsers } from "react-icons/fi";
import { IoColorPaletteOutline } from "react-icons/io5";
import { addRecentGame, clearRecentGames, getRecentGames, getStoredName, setStoredName } from "../lib/session";
import { showToast } from "../lib/toast";

const isDev = import.meta.env.DEV;

export function HomePage({ sessionId }: { sessionId: string }) {
  const zero = useZero();
  const navigate = useNavigate();
  const [name, setName] = useState(getStoredName());
  const [savedName, setSavedName] = useState(getStoredName());
  const [recentGames, setRecentGames] = useState(getRecentGames());
  const [joinCode, setJoinCode] = useState("");
  const [pendingAction, setPendingAction] = useState<"create-imposter" | "create-password" | "join" | null>(null);
  const [imposterMatches] = useQuery(queries.imposter.byCode({ code: joinCode || "______" }));
  const [passwordMatches] = useQuery(queries.password.byCode({ code: joinCode || "______" }));

  // Imposter config
  const [imposterExpanded, setImposterExpanded] = useState(false);
  const [imposterCategory, setImposterCategory] = useState("animals");
  const [imposterImposters, setImposterImposters] = useState(1);
  const [imposterRounds, setImposterRounds] = useState(3);

  // Password config
  const [passwordExpanded, setPasswordExpanded] = useState(false);
  const [passwordTeams, setPasswordTeams] = useState(2);
  const [passwordTargetScore, setPasswordTargetScore] = useState(10);

  const saveName = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    setStoredName(trimmedName);
    setSavedName(trimmedName);
    if (trimmedName) {
      await zero.mutate(mutators.sessions.setName({ id: sessionId, name: trimmedName })).server;
    } else {
      await zero.mutate(mutators.sessions.upsert({ id: sessionId, name: null })).server;
    }
  };

  const createImposter = async () => {
    setPendingAction("create-imposter");
    const id = nanoid();
    try {
      const result = await zero.mutate(mutators.imposter.create({ id, hostId: sessionId, category: imposterCategory, rounds: imposterRounds, imposters: imposterImposters })).server;
      if (result.type === "error") {
        showToast(result.error.message, "error");
        return;
      }
      navigate(`/imposter/${id}`);
    } finally {
      setPendingAction(null);
    }
  };

  const createPassword = async () => {
    setPendingAction("create-password");
    const id = nanoid();
    try {
      const result = await zero.mutate(mutators.password.create({ id, hostId: sessionId, teamCount: passwordTeams, targetScore: passwordTargetScore })).server;
      if (result.type === "error") {
        showToast(result.error.message, "error");
        return;
      }
      navigate(`/password/${id}/begin`);
    } finally {
      setPendingAction(null);
    }
  };

  const joinAny = async () => {
    setPendingAction("join");
    const normalizedCode = joinCode.trim().toUpperCase();
    if (!normalizedCode) {
      showToast("Enter a join code first.", "error");
      setPendingAction(null);
      return;
    }
    try {
      const imposterGame = imposterMatches[0];
      if (imposterGame) {
        const result = await zero.mutate(mutators.imposter.join({ gameId: imposterGame.id, sessionId })).server;
        if (result.type === "error") { showToast(result.error.message, "error"); return; }
        addRecentGame({ id: imposterGame.id, code: imposterGame.code, gameType: "imposter" });
        setRecentGames(getRecentGames());
        navigate(`/imposter/${imposterGame.id}`);
        return;
      }
      const passwordGame = passwordMatches[0];
      if (passwordGame) {
        const result = await zero.mutate(mutators.password.join({ gameId: passwordGame.id, sessionId })).server;
        if (result.type === "error") { showToast(result.error.message, "error"); return; }
        addRecentGame({ id: passwordGame.id, code: passwordGame.code, gameType: "password" });
        setRecentGames(getRecentGames());
        navigate(`/password/${passwordGame.id}/begin`);
        return;
      }
      showToast("No game found for that code.", "error");
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="home-cards">

      {/* ── Card 1: Utils ──────────────────────────────────── */}
      <div className="home-card home-card--utils">
        <div className="home-card-body">
          {/* Name section */}
          <section className="hc-section">
            <h3 className="hc-label">Display Name</h3>
            {savedName && (
              <p className="hc-sublabel">
                Playing as <span className="text-primary font-semibold">{savedName}</span>
              </p>
            )}
            <form className="hc-row" onSubmit={saveName}>
              <input
                className="input flex-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter name…"
                maxLength={32}
              />
              <button type="submit" className="btn btn-primary">Save</button>
            </form>
          </section>

          <div className="hc-divider" />

          {/* Join section */}
          <section className="hc-section">
            <h3 className="hc-label">
              <FiSearch size={14} style={{ opacity: 0.6 }} /> Join Game
            </h3>
            <div className="hc-row">
              <input
                className="input flex-1"
                style={{ letterSpacing: "0.15em", fontWeight: 600 }}
                value={joinCode}
                onChange={(e) =>
                  setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))
                }
                placeholder="ABCXYZ"
                maxLength={6}
              />
              <button
                className="btn btn-primary"
                onClick={() => void joinAny()}
                disabled={pendingAction !== null}
              >
                {pendingAction === "join" ? "…" : "Join"}
              </button>
            </div>
          </section>

          <div className="hc-divider" />

          {/* Recent games — always shown */}
          <section className="hc-section">
            <div className="flex items-center justify-between">
              <h3 className="hc-label">Recent</h3>
              {recentGames.length > 0 && (
                <button
                  className="hc-text-btn"
                  onClick={() => { clearRecentGames(); setRecentGames([]); }}
                >
                  Clear
                </button>
              )}
            </div>
            {recentGames.length > 0 ? (
              <div className="hc-recent-list">
                {recentGames.map((game) => (
                  <Link
                    key={`${game.gameType}-${game.id}`}
                    to={game.gameType === "imposter" ? `/imposter/${game.id}` : `/password/${game.id}/begin`}
                    className="hc-recent-item"
                  >
                    <span className="hc-recent-type">{game.gameType}</span>
                    <span className="hc-recent-code">{game.code}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="hc-empty-text">No recent games yet</p>
            )}
          </section>

          {/* Dev-only: demo games */}
          {isDev && (
            <>
              <div className="hc-divider" />
              <section className="hc-section">
                <h3 className="hc-label">Dev: Demo Games</h3>
                <div className="hc-demo-grid">
                  <button className="btn btn-muted hc-demo-btn" onClick={() => void createDemoImposter("lobby")}>
                    Imp Lobby
                  </button>
                  <button className="btn btn-muted hc-demo-btn" onClick={() => void createDemoImposter("playing")}>
                    Imp Play
                  </button>
                  <button className="btn btn-muted hc-demo-btn" onClick={() => void createDemoImposter("voting")}>
                    Imp Vote
                  </button>
                  <button className="btn btn-muted hc-demo-btn" onClick={() => void createDemoImposter("results")}>
                    Imp Results
                  </button>
                  <button className="btn btn-muted hc-demo-btn" onClick={() => void createDemoPassword("lobby")}>
                    Pwd Lobby
                  </button>
                  <button className="btn btn-muted hc-demo-btn" onClick={() => void createDemoPassword("playing")}>
                    Pwd Play
                  </button>
                  <button className="btn btn-muted hc-demo-btn" onClick={() => void createDemoPassword("results")}>
                    Pwd Results
                  </button>
                </div>
              </section>
            </>
          )}
        </div>
      </div>

      {/* ── Card 2: Imposter ───────────────────────────────── */}
      <div className="home-card home-card--imposter">
        <div className="home-card-body hc-centered">
          <h2 className="hc-game-title-lg">Imposter</h2>
          <p className="hc-game-desc">Find the liar. Give clues. Vote them out.</p>

          <div className="hc-game-tags hc-game-tags--centered">
            <span className="hc-tag">4–10 players</span>
            <span className="hc-tag">Deduction</span>
            <span className="hc-tag">Timed rounds</span>
          </div>

          {/* Expandable config */}
          {imposterExpanded && (
            <div className="hc-config">
              <div className="hc-config-field">
                <label className="hc-config-label">Category</label>
                <select
                  className="input"
                  value={imposterCategory}
                  onChange={(e) => setImposterCategory(e.target.value)}
                >
                  {imposterCategories.map((key) => (
                    <option key={key} value={key}>{imposterCategoryLabels[key] ?? key}</option>
                  ))}
                </select>
              </div>
              <div className="hc-config-row">
                <div className="hc-config-field flex-1">
                  <label className="hc-config-label">Imposters</label>
                  <select
                    className="input"
                    value={imposterImposters}
                    onChange={(e) => setImposterImposters(Number(e.target.value))}
                  >
                    {[1, 2, 3].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <div className="hc-config-field flex-1">
                  <label className="hc-config-label">Rounds</label>
                  <select
                    className="input"
                    value={imposterRounds}
                    onChange={(e) => setImposterRounds(Number(e.target.value))}
                  >
                    {[1, 2, 3, 5, 7, 10].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          <div className="hc-game-actions">
            {!imposterExpanded ? (
              <button className="btn btn-primary w-full" onClick={() => setImposterExpanded(true)}>
                Create Game
              </button>
            ) : (
              <div className="hc-row">
                <button className="btn btn-muted flex-1" onClick={() => setImposterExpanded(false)}>
                  Back
                </button>
                <button
                  className="btn btn-primary flex-1"
                  onClick={() => void createImposter()}
                  disabled={pendingAction !== null}
                >
                  {pendingAction === "create-imposter" ? "Creating…" : "Go"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Card 3: Password ───────────────────────────────── */}
      <div className="home-card home-card--password">
        <div className="home-card-body hc-centered">
          <h2 className="hc-game-title-lg">Password</h2>
          <p className="hc-game-desc">One-word clues. Team guessing. First to target wins.</p>

          <div className="hc-game-tags hc-game-tags--centered">
            <span className="hc-tag">Teams</span>
            <span className="hc-tag">Word clues</span>
            <span className="hc-tag">Timed</span>
          </div>

          {/* Expandable config */}
          {passwordExpanded && (
            <div className="hc-config">
              <div className="hc-config-row">
                <div className="hc-config-field flex-1">
                  <label className="hc-config-label">
                    <FiUsers size={13} style={{ opacity: 0.6 }} /> Teams
                  </label>
                  <select
                    className="input"
                    value={passwordTeams}
                    onChange={(e) => setPasswordTeams(Number(e.target.value))}
                  >
                    {[2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>{n} teams</option>
                    ))}
                  </select>
                </div>
                <div className="hc-config-field flex-1">
                  <label className="hc-config-label">Points to Win</label>
                  <select
                    className="input"
                    value={passwordTargetScore}
                    onChange={(e) => setPasswordTargetScore(Number(e.target.value))}
                  >
                    {[3, 5, 7, 10, 15, 20].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          <div className="hc-game-actions">
            {!passwordExpanded ? (
              <button className="btn btn-primary w-full" onClick={() => setPasswordExpanded(true)}>
                Create Game
              </button>
            ) : (
              <div className="hc-row">
                <button className="btn btn-muted flex-1" onClick={() => setPasswordExpanded(false)}>
                  Back
                </button>
                <button
                  className="btn btn-primary flex-1"
                  onClick={() => void createPassword()}
                  disabled={pendingAction !== null}
                >
                  {pendingAction === "create-password" ? "Creating…" : "Go"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Card 4: Chain Reaction (Coming Soon) ──────────── */}
      <div className="home-card home-card--chain">
        <div className="home-card-body hc-centered">
          <div className="hc-coming-soon-badge">Coming Soon</div>
          <FiLink size={36} className="hc-coming-icon" style={{ color: "#34d399" }} />
          <h2 className="hc-game-title-lg">Chain Reaction</h2>
          <p className="hc-game-desc">Race to solve a chain of linked words. Every word connects to the next.</p>

          <div className="hc-game-tags hc-game-tags--centered">
            <span className="hc-tag">2 players</span>
            <span className="hc-tag">Word chains</span>
            <span className="hc-tag">Turns</span>
          </div>

          <div className="hc-coming-preview">
            <div className="hc-chain-example">
              <span className="hc-chain-word hc-chain-word--revealed">FIRE</span>
              <span className="hc-chain-word hc-chain-word--hidden">_ _ _ _ _</span>
              <span className="hc-chain-word hc-chain-word--hidden">_ _ _ _</span>
              <span className="hc-chain-word hc-chain-word--hidden">_ _ _ _</span>
              <span className="hc-chain-word hc-chain-word--revealed">LANGUAGE</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Card 5: Shade Signal (Coming Soon) ─────────────── */}
      <div className="home-card home-card--shade">
        <div className="home-card-body hc-centered">
          <div className="hc-coming-soon-badge">Coming Soon</div>
          <IoColorPaletteOutline size={36} className="hc-coming-icon" style={{ color: "#f472b6" }} />
          <h2 className="hc-game-title-lg">Shade Signal</h2>
          <p className="hc-game-desc">One leader, one color. Give clues and guess the target shade.</p>

          <div className="hc-game-tags hc-game-tags--centered">
            <span className="hc-tag">3–10 players</span>
            <span className="hc-tag">Color clues</span>
            <span className="hc-tag">Proximity</span>
          </div>

          <div className="hc-coming-preview">
            <div className="hc-shade-grid">
              {Array.from({ length: 20 }, (_, i) => (
                <div
                  key={i}
                  className="hc-shade-cell"
                  style={{ background: `hsl(${i * 18}, 60%, ${45 + (i % 3) * 10}%)` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicators (mobile) */}
      <div className="home-cards-dots">
        <span className="home-cards-dot" />
        <span className="home-cards-dot" />
        <span className="home-cards-dot" />
        <span className="home-cards-dot" />
        <span className="home-cards-dot" />
      </div>
    </div>
  );

  /* ── Dev-only demo helpers ─────────────────────────── */
  async function createDemoImposter(phase: "lobby" | "playing" | "voting" | "results") {
    const id = nanoid();
    const ts = Date.now();
    const fakePlayers = [
      { sessionId, name: savedName || "You", connected: true, role: "player" as const },
      { sessionId: "demo-p2", name: "Alice", connected: true, role: "player" as const },
      { sessionId: "demo-p3", name: "Bob", connected: true, role: "player" as const },
      { sessionId: "demo-p4", name: "Charlie", connected: true, role: "imposter" as const },
      { sessionId: "demo-p5", name: "Diana", connected: false, role: "player" as const },
    ];
    const lobbyPlayers = fakePlayers.map(({ role: _r, ...p }) => p);
    const fakeClues = [
      { sessionId, text: "Fluffy", createdAt: ts - 30_000 },
      { sessionId: "demo-p2", text: "Barks", createdAt: ts - 25_000 },
      { sessionId: "demo-p3", text: "Loyal", createdAt: ts - 20_000 },
      { sessionId: "demo-p4", text: "Fast", createdAt: ts - 15_000 },
    ];
    const fakeVotes = [
      { voterId: sessionId, targetId: "demo-p4" },
      { voterId: "demo-p2", targetId: "demo-p4" },
      { voterId: "demo-p3", targetId: "demo-p4" },
      { voterId: "demo-p4", targetId: "demo-p2" },
    ];

    await zero.mutate(mutators.demo.seedImposter({
      id,
      hostId: sessionId,
      phase,
      secretWord: phase === "lobby" ? null : "Dog",
      players: phase === "lobby" ? lobbyPlayers : fakePlayers,
      clues: phase === "playing" || phase === "voting" || phase === "results" ? fakeClues : [],
      votes: phase === "results" ? fakeVotes : phase === "voting" ? fakeVotes.slice(0, 2) : [],
      currentRound: phase === "lobby" ? 1 : 2,
      phaseEndsAt: phase === "playing" || phase === "voting" ? ts + 60_000 : null,
    }));

    // Seed some demo chat messages
    if (phase !== "lobby") {
      const chatMsgs = [
        { id: nanoid(), gameType: "imposter" as const, gameId: id, senderId: sessionId, senderName: savedName || "You", text: "Hey everyone! Good luck this round \ud83c\udfae" },
        { id: nanoid(), gameType: "imposter" as const, gameId: id, senderId: "demo-p2", senderName: "Alice", text: "gl hf!" },
        { id: nanoid(), gameType: "imposter" as const, gameId: id, senderId: "demo-p3", senderName: "Bob", text: "I have no idea what the word is lol" },
        { id: nanoid(), gameType: "imposter" as const, gameId: id, senderId: "demo-p4", senderName: "Charlie", text: "hmm suspicious \ud83e\udd14" },
        { id: nanoid(), gameType: "imposter" as const, gameId: id, senderId: "demo-p2", senderName: "Alice", text: "Charlie seems nervous..." },
      ];
      for (const msg of chatMsgs) {
        await zero.mutate(mutators.chat.send(msg));
      }
    }

    addRecentGame({ id, code: "DEMO", gameType: "imposter" });
    setRecentGames(getRecentGames());
    navigate(`/imposter/${id}`);
  }

  async function createDemoPassword(phase: "lobby" | "playing" | "results") {
    const id = nanoid();
    const ts = Date.now();
    const teams = [
      { name: "Team 1", members: [sessionId, "demo-p2"] },
      { name: "Team 2", members: ["demo-p3", "demo-p4"] },
    ];
    const scores: Record<string, number> = { "Team 1": phase === "results" ? 10 : 4, "Team 2": phase === "results" ? 7 : 3 };
    const rounds = phase !== "lobby" ? [
      { round: 1, teamIndex: 0, guesserId: "demo-p2", word: "Ocean", clues: [{ sessionId, text: "Waves" }], guess: "Ocean", correct: true },
      { round: 2, teamIndex: 1, guesserId: "demo-p4", word: "Fire", clues: [{ sessionId: "demo-p3", text: "Hot" }], guess: "Sun", correct: false },
      { round: 3, teamIndex: 0, guesserId: sessionId, word: "Guitar", clues: [{ sessionId: "demo-p2", text: "Strings" }], guess: "Guitar", correct: true },
    ] : [];
    const activeRounds = phase === "playing" ? [
      {
        teamIndex: 0,
        guesserId: "demo-p2",
        word: "Balloon" as string | null,
        clues: [] as Array<{ sessionId: string; text: string }>,
        guess: null as string | null,
      },
      {
        teamIndex: 1,
        guesserId: "demo-p4",
        word: "Balloon" as string | null,
        clues: [] as Array<{ sessionId: string; text: string }>,
        guess: null as string | null,
      }
    ] : [];

    await zero.mutate(mutators.demo.seedPassword({
      id,
      hostId: sessionId,
      phase,
      teams,
      scores,
      rounds,
      currentRound: phase === "lobby" ? 1 : 4,
      activeRounds,
      targetScore: 10,
      roundEndsAt: phase === "playing" ? ts + 45_000 : null,
    }));

    // Seed some demo chat messages
    if (phase !== "lobby") {
      const chatMsgs = [
        { id: nanoid(), gameType: "password" as const, gameId: id, senderId: sessionId, senderName: savedName || "You", text: "Let's go team! \ud83d\udcaa" },
        { id: nanoid(), gameType: "password" as const, gameId: id, senderId: "demo-p3", senderName: "Bob", text: "Good luck everyone!" },
        { id: nanoid(), gameType: "password" as const, gameId: id, senderId: "demo-p4", senderName: "Charlie", text: "We're catching up \ud83d\udcc8" },
        { id: nanoid(), gameType: "password" as const, gameId: id, senderId: "demo-p2", senderName: "Alice", text: "nice round!" },
      ];
      for (const msg of chatMsgs) {
        await zero.mutate(mutators.chat.send(msg));
      }
    }

    addRecentGame({ id, code: "DEMO", gameType: "password" });
    setRecentGames(getRecentGames());
    navigate(phase === "results" ? `/password/${id}/results` : phase === "playing" ? `/password/${id}` : `/password/${id}/begin`);
  }
}
