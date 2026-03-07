import { imposterCategories, imposterCategoryLabels, mutators, queries } from "@games/shared";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { nanoid } from "nanoid";
import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiChevronLeft, FiChevronRight, FiSearch, FiUsers } from "react-icons/fi";
import { addRecentGame, clearRecentGames, getRecentGames, getStoredName, RecentGame, setStoredName } from "../lib/session";
import { showToast } from "../lib/toast";

const isDev = import.meta.env.DEV;

export function HomePage({ sessionId }: { sessionId: string }) {
  const zero = useZero();
  const navigate = useNavigate();
  const [name, setName] = useState(getStoredName());
  const [savedName, setSavedName] = useState(getStoredName());
  const [recentGames, setRecentGames] = useState(getRecentGames());
  const [joinCode, setJoinCode] = useState("");
  const [pendingAction, setPendingAction] = useState<"create-imposter" | "create-password" | "create-chain" | "join" | null>(null);
  const [imposterMatches] = useQuery(queries.imposter.byCode({ code: joinCode || "______" }));
  const [passwordMatches] = useQuery(queries.password.byCode({ code: joinCode || "______" }));
  const [chainMatches] = useQuery(queries.chainReaction.byCode({ code: joinCode || "______" }));

  // Imposter config
  const [imposterExpanded, setImposterExpanded] = useState(false);
  const [imposterCategory, setImposterCategory] = useState("animals");
  const [imposterImposters, setImposterImposters] = useState(1);
  const [imposterRounds, setImposterRounds] = useState(3);

  // Password config
  const [passwordExpanded, setPasswordExpanded] = useState(false);
  const [passwordTeams, setPasswordTeams] = useState(2);
  const [passwordTargetScore, setPasswordTargetScore] = useState(10);

  // Chain Reaction config
  const [chainExpanded, setChainExpanded] = useState(false);
  const [chainLength, setChainLength] = useState(5);
  const [chainRounds, setChainRounds] = useState(3);
  const [chainMode, setChainMode] = useState<"premade" | "custom">("premade");

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

  const createChainReaction = async () => {
    setPendingAction("create-chain");
    const id = nanoid();
    try {
      const result = await zero.mutate(mutators.chainReaction.create({ id, hostId: sessionId, chainLength, rounds: chainRounds, chainMode })).server;
      if (result.type === "error") {
        showToast(result.error.message, "error");
        return;
      }
      navigate(`/chain/${id}`);
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
      const chainGame = chainMatches[0];
      if (chainGame) {
        const result = await zero.mutate(mutators.chainReaction.join({ gameId: chainGame.id, sessionId })).server;
        if (result.type === "error") { showToast(result.error.message, "error"); return; }
        addRecentGame({ id: chainGame.id, code: chainGame.code, gameType: "chain_reaction" });
        setRecentGames(getRecentGames());
        navigate(`/chain/${chainGame.id}`);
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
                  <RecentGameItem key={`${game.gameType}-${game.id}`} game={game} sessionId={sessionId} />
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
                  <button className="btn btn-muted hc-demo-btn" onClick={() => void createDemoChainReaction("lobby")}>
                    CR Lobby
                  </button>
                  <button className="btn btn-muted hc-demo-btn" onClick={() => void createDemoChainReaction("submitting")}>
                    CR Submit
                  </button>
                  <button className="btn btn-muted hc-demo-btn" onClick={() => void createDemoChainReaction("playing")}>
                    CR Play
                  </button>
                  <button className="btn btn-muted hc-demo-btn" onClick={() => void createDemoChainReaction("finished")}>
                    CR Finish
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

          {/* Gameplay preview (hidden when config expanded) */}
          {!imposterExpanded && (
            <div className="hc-coming-preview">
              <div className="hc-mini-board">
                <div className="hc-mini-board-header hc-mini-board-header--imposter">
                  <span>Secret Word: DOG</span>
                </div>
                <div className="hc-mini-board-rows">
                  <div className="hc-mini-row">
                    <span className="hc-mini-avatar hc-mini-avatar--imposter">A</span>
                    <span className="hc-mini-clue">"Fluffy"</span>
                    <span className="hc-mini-badge hc-mini-badge--ok">✓</span>
                  </div>
                  <div className="hc-mini-row">
                    <span className="hc-mini-avatar hc-mini-avatar--imposter">B</span>
                    <span className="hc-mini-clue">"Loyal"</span>
                    <span className="hc-mini-badge hc-mini-badge--ok">✓</span>
                  </div>
                  <div className="hc-mini-row hc-mini-row--suspect">
                    <span className="hc-mini-avatar hc-mini-avatar--suspect">C</span>
                    <span className="hc-mini-clue">"Uhh..."</span>
                    <span className="hc-mini-badge hc-mini-badge--caught">🕵️</span>
                  </div>
                </div>
              </div>
            </div>
          )}

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

          {/* Gameplay preview (hidden when config expanded) */}
          {!passwordExpanded && (
            <div className="hc-coming-preview">
              <div className="hc-mini-board">
                <div className="hc-mini-board-header hc-mini-board-header--password">
                  <span>🎯 OCEAN</span>
                </div>
                <div className="hc-mini-board-rows">
                  <div className="hc-mini-row">
                    <span className="hc-mini-avatar hc-mini-avatar--password">A</span>
                    <span className="hc-mini-clue">Clue: "Waves"</span>
                  </div>
                  <div className="hc-mini-row">
                    <span className="hc-mini-avatar hc-mini-avatar--password">B</span>
                    <span className="hc-mini-clue">Guess: OCEAN</span>
                    <span className="hc-mini-badge hc-mini-badge--correct">+3</span>
                  </div>
                </div>
              </div>
            </div>
          )}

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

      {/* ── Card 4: Chain Reaction ─────────────────────────── */}
      <div className="home-card home-card--chain">
        <div className="home-card-body hc-centered">
          <h2 className="hc-game-title-lg">Chain Reaction</h2>
          <p className="hc-game-desc">Race to solve a chain of linked words. Every word connects to the next.</p>

          <div className="hc-game-tags hc-game-tags--centered">
            <span className="hc-tag">2 players</span>
            <span className="hc-tag">Word chains</span>
            <span className="hc-tag">Turns</span>
          </div>

          {/* Gameplay preview (hidden when config expanded) */}
          {!chainExpanded && (
            <div className="hc-coming-preview">
              <div className="hc-chain-example">
                <span className="hc-chain-word hc-chain-word--revealed">FIRE</span>
                <span className="hc-chain-word hc-chain-word--hidden">_ _ _ _ _</span>
                <span className="hc-chain-word hc-chain-word--hidden">_ _ _ _</span>
                <span className="hc-chain-word hc-chain-word--hidden">_ _ _ _</span>
                <span className="hc-chain-word hc-chain-word--revealed">LANGUAGE</span>
              </div>
            </div>
          )}

          {/* Expandable config */}
          {chainExpanded && (
            <div className="hc-config">
              <div className="hc-config-row">
                <div className="hc-config-field flex-1">
                  <label className="hc-config-label">Chain Length</label>
                  <select
                    className="input"
                    value={chainLength}
                    onChange={(e) => setChainLength(Number(e.target.value))}
                  >
                    {[5, 6, 7, 8, 9, 10].map((n) => (
                      <option key={n} value={n}>{n} words</option>
                    ))}
                  </select>
                </div>
                <div className="hc-config-field flex-1">
                  <label className="hc-config-label">Rounds</label>
                  <select
                    className="input"
                    value={chainRounds}
                    onChange={(e) => setChainRounds(Number(e.target.value))}
                  >
                    {[1, 2, 3, 5, 7].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="hc-config-row">
                <div className="hc-config-field flex-1">
                  <label className="hc-config-label">Chain Mode</label>
                  <select
                    className="input"
                    value={chainMode}
                    onChange={(e) => setChainMode(e.target.value as "premade" | "custom")}
                  >
                    <option value="premade">Random (premade)</option>
                    <option value="custom">Custom (both players write)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          <div className="hc-game-actions">
            {!chainExpanded ? (
              <button className="btn btn-primary w-full" onClick={() => setChainExpanded(true)}>
                Create Game
              </button>
            ) : (
              <div className="hc-row">
                <button className="btn btn-muted flex-1" onClick={() => setChainExpanded(false)}>
                  Back
                </button>
                <button
                  className="btn btn-primary flex-1"
                  onClick={() => void createChainReaction()}
                  disabled={pendingAction !== null}
                >
                  {pendingAction === "create-chain" ? "Creating…" : "Go"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Card 5: Shade Signal (Coming Soon) ─────────────── */}
      <div className="home-card home-card--shade">
        <div className="home-card-body hc-centered">
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

          <div className="hc-game-actions">
            <button className="btn btn-muted w-full" disabled>Coming Soon</button>
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

  async function createDemoChainReaction(phase: "lobby" | "submitting" | "playing" | "finished") {
    const id = nanoid();
    const p1 = sessionId;
    const p2 = "demo-p2";
    const players = [
      { sessionId: p1, name: savedName || "You", connected: true },
      { sessionId: p2, name: "Alice", connected: true },
    ];
    const lobbyPlayers = phase === "lobby" ? [players[0]!] : players;

    // Per-player chains (each player guesses their own chain, created by opponent)
    const p1Words = ["RAIN", "DROP", "KICK", "BACK", "FIRE"];
    const p2Words = ["SUN", "LIGHT", "HOUSE", "WORK", "OUT"];

    const makeSlots = (words: string[], progress: "none" | "partial" | "done") =>
      words.map((word, i) => {
        const isEdge = i === 0 || i === words.length - 1;
        if (progress === "none") return { word, revealed: isEdge, lettersShown: isEdge ? word.length : 0, solvedBy: null };
        if (progress === "partial") {
          const revealed = isEdge || i === 1;
          return { word, revealed, lettersShown: revealed ? word.length : (i === 2 ? 1 : 0), solvedBy: i === 1 ? p1 : null };
        }
        return { word, revealed: true, lettersShown: word.length, solvedBy: isEdge ? null : p1 };
      });

    let chain: Record<string, Array<{ word: string; revealed: boolean; lettersShown: number; solvedBy: string | null }>> = {};
    if (phase === "playing") {
      chain = {
        [p1]: makeSlots(p1Words, "partial"),
        [p2]: makeSlots(p2Words, "none"),
      };
    } else if (phase === "finished") {
      chain = {
        [p1]: makeSlots(p1Words, "done"),
        [p2]: makeSlots(p2Words, "done"),
      };
    }

    const roundHistory = phase === "finished" ? [
      {
        round: 1,
        chains: {
          [p1]: p1Words.map((word, i) => ({ word, solvedBy: i === 0 || i === p1Words.length - 1 ? null : p1, lettersShown: word.length })),
          [p2]: p2Words.map((word, i) => ({ word, solvedBy: i === 0 || i === p2Words.length - 1 ? null : p2, lettersShown: word.length })),
        },
        scores: { [p1]: 2, [p2]: 1 }
      },
      {
        round: 2,
        chains: {
          [p1]: ["COLD", "SNAP", "CHAT", "ROOM", "KEY"].map((word, i) => ({ word, solvedBy: i === 0 || i === 4 ? null : p1, lettersShown: word.length })),
          [p2]: ["BLUE", "BELL", "TOWER", "BLOCK", "CHAIN"].map((word, i) => ({ word, solvedBy: i === 0 || i === 4 ? null : p2, lettersShown: word.length })),
        },
        scores: { [p1]: 1, [p2]: 2 }
      }
    ] : [];

    const scores: Record<string, number> = phase === "lobby" ? {} :
      phase === "finished" ? { [p1]: 3, [p2]: 3 } : { [p1]: 1, [p2]: 0 };

    const submittedChains: Record<string, string[]> = phase === "submitting"
      ? { [p1]: p1Words }
      : {};

    await zero.mutate(mutators.demo.seedChainReaction({
      id,
      hostId: p1,
      phase,
      players: lobbyPlayers,
      chain,
      submittedChains,
      scores,
      roundHistory,
      settings: {
        chainLength: 5,
        rounds: phase === "finished" ? 2 : 3,
        currentRound: phase === "lobby" ? 1 : phase === "finished" ? 2 : 1,
        turnTimeSec: null,
        phaseEndsAt: null,
        chainMode: phase === "submitting" ? "custom" : "premade"
      }
    }));

    addRecentGame({ id, code: "DEMO", gameType: "chain_reaction" });
    setRecentGames(getRecentGames());
    navigate(`/chain-reaction/${id}`);
  }
}

/* ── Recent game item with deleted check + hover results ───── */

function RecentGameItem({ game, sessionId }: { game: RecentGame; sessionId: string }) {
  const [imposterResults] = useQuery(game.gameType === "imposter" ? queries.imposter.byId({ id: game.id }) : queries.imposter.byId({ id: "__none__" }));
  const [passwordResults] = useQuery(game.gameType === "password" ? queries.password.byId({ id: game.id }) : queries.password.byId({ id: "__none__" }));
  const [chainResults] = useQuery(game.gameType === "chain_reaction" ? queries.chainReaction.byId({ id: game.id }) : queries.chainReaction.byId({ id: "__none__" }));

  const gameData = game.gameType === "imposter" ? imposterResults[0]
    : game.gameType === "password" ? passwordResults[0]
    : chainResults[0];

  const isDeleted = !gameData;
  const isEnded = gameData && (gameData.phase === "finished" || gameData.phase === "ended");

  const link = game.gameType === "imposter"
    ? `/imposter/${game.id}`
    : game.gameType === "password"
    ? `/password/${game.id}/begin`
    : `/chain/${game.id}`;

  const typeLabel = game.gameType === "chain_reaction" ? "chain reaction" : game.gameType;

  // Tooltip content for finished games
  const tooltip = useMemo(() => {
    if (!isEnded || !gameData) return null;

    if (game.gameType === "imposter" && "round_history" in gameData) {
      const g = gameData as typeof imposterResults[0];
      if (!g) return null;
      const lines: string[] = [];
      const players = g.players ?? [];
      const nameOf = (id: string) => players.find((p) => p.sessionId === id)?.name ?? id.slice(0, 6);

      for (const r of g.round_history ?? []) {
        const impostersStr = r.imposters.map(nameOf).join(", ");
        lines.push(`R${r.round}: "${r.secretWord}" — ${r.caught ? "caught" : "missed"} (${impostersStr})`);
      }
      return lines.join("\n") || "No rounds played";
    }

    if (game.gameType === "password" && "teams" in gameData) {
      const g = gameData as typeof passwordResults[0];
      if (!g) return null;
      const lines: string[] = [];
      const teams = g.teams ?? [];
      for (const [teamKey, score] of Object.entries(g.scores ?? {})) {
        const teamIdx = parseInt(teamKey, 10);
        const teamName = teams[teamIdx]?.name ?? `Team ${teamIdx + 1}`;
        lines.push(`${teamName}: ${score} pts`);
      }
      return lines.join("\n") || "No scores";
    }

    if (game.gameType === "chain_reaction" && "round_history" in gameData) {
      const g = gameData as typeof chainResults[0];
      if (!g) return null;
      const players = g.players ?? [];
      const nameOf = (id: string) => players.find((p) => p.sessionId === id)?.name ?? id.slice(0, 6);
      const lines: string[] = [];

      // Final scores
      const sorted = Object.entries(g.scores ?? {}).sort(([, a], [, b]) => b - a);
      lines.push(sorted.map(([id, s]) => `${nameOf(id)}: ${s}`).join(" vs "));

      // Per round
      for (const r of g.round_history ?? []) {
        const roundScores = Object.entries(r.scores ?? {})
          .map(([id, s]) => `${nameOf(id)} ${s}`)
          .join(" / ");
        lines.push(`R${r.round}: ${roundScores}`);
      }
      return lines.join("\n") || "No rounds played";
    }

    return null;
  }, [isEnded, gameData, game.gameType]);

  if (isDeleted) {
    return (
      <div className="hc-recent-item hc-recent-item--deleted">
        <span className="hc-recent-type">{typeLabel}</span>
        <span className="hc-recent-code">{game.code}</span>
        <span className="hc-recent-badge hc-recent-badge--deleted">deleted</span>
      </div>
    );
  }

  if (isEnded) {
    return (
      <Link to={link} className="hc-recent-item hc-recent-item--ended" title={tooltip ?? undefined}>
        <span className="hc-recent-type">{typeLabel}</span>
        <span className="hc-recent-code">{game.code}</span>
        <span className="hc-recent-badge hc-recent-badge--ended">{gameData.phase}</span>
      </Link>
    );
  }

  return (
    <Link to={link} className="hc-recent-item">
      <span className="hc-recent-type">{typeLabel}</span>
      <span className="hc-recent-code">{game.code}</span>
      <span className="hc-recent-badge">{gameData.phase}</span>
    </Link>
  );
}
