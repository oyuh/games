import { imposterCategories, imposterCategoryLabels, chainCategories, chainCategoryLabels, passwordCategories, passwordCategoryLabels, mutators, queries } from "@games/shared";
import { useQuery, useZero } from "../../lib/zero";
import { nanoid } from "nanoid";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiSearch, FiUsers, FiEye, FiShield, FiLink, FiMapPin, FiChevronDown, FiChevronUp } from "react-icons/fi";
import { PiPaintBrushBold } from "react-icons/pi";
import { InSessionModal } from "../../components/shared/InSessionModal";
import { addRecentGame, clearRecentGames, getRecentGames, getStoredName, hasVisited, leaveCurrentGame, markVisited, SessionGameType, setStoredName } from "../../lib/session";
import { showToast } from "../../lib/toast";

const adjectives = [
  "Swift", "Sneaky", "Cosmic", "Lucky", "Dizzy", "Frosty", "Bold", "Chill",
  "Witty", "Fierce", "Jolly", "Mystic", "Nifty", "Pixel", "Rapid", "Silent",
  "Turbo", "Vivid", "Wacky", "Zesty", "Brave", "Clever", "Funky", "Groovy",
];
const nouns = [
  "Panda", "Fox", "Falcon", "Otter", "Wolf", "Shark", "Raven", "Lynx",
  "Cobra", "Badger", "Hawk", "Tiger", "Bear", "Moose", "Owl", "Penguin",
  "Dragon", "Phoenix", "Pirate", "Knight", "Ninja", "Wizard", "Ghost", "Robot",
];

function randomName(): string {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)]!;
  const noun = nouns[Math.floor(Math.random() * nouns.length)]!;
  return `${adj}${noun}`;
}

export function MobileHomePage({ sessionId }: { sessionId: string }) {
  const zero = useZero();
  const navigate = useNavigate();
  const [name, setName] = useState(getStoredName());
  const [savedName, setSavedName] = useState(getStoredName());
  const [firstVisit, setFirstVisit] = useState(() => !hasVisited());
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const newName = (e as CustomEvent<string>).detail || "";
      setName(newName);
      setSavedName(newName);
    };
    window.addEventListener("games:name-changed", handler);
    return () => window.removeEventListener("games:name-changed", handler);
  }, []);

  const [recentGames, setRecentGames] = useState(getRecentGames());
  const [joinCode, setJoinCode] = useState("");
  const [showRecent, setShowRecent] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [imposterMatches] = useQuery(queries.imposter.byCode({ code: joinCode || "______" }));
  const [passwordMatches] = useQuery(queries.password.byCode({ code: joinCode || "______" }));
  const [chainMatches] = useQuery(queries.chainReaction.byCode({ code: joinCode || "______" }));
  const [shadeMatches] = useQuery(queries.shadeSignal.byCode({ code: joinCode || "______" }));
  const [locationMatches] = useQuery(queries.locationSignal.byCode({ code: joinCode || "______" }));
  const [mySessionRows] = useQuery(queries.sessions.byId({ id: sessionId }));
  const [showInSessionModal, setShowInSessionModal] = useState(false);
  const [joiningFromOtherGame, setJoiningFromOtherGame] = useState(false);
  const [pendingJoinTarget, setPendingJoinTarget] = useState<{ gameType: SessionGameType; gameId: string; code: string; route: string } | null>(null);

  // Game configs
  const [expanded, setExpanded] = useState<string | null>(null);
  const [imposterCategory, setImposterCategory] = useState("animals");
  const [imposterImposters, setImposterImposters] = useState(1);
  const [imposterRounds, setImposterRounds] = useState(3);
  const [passwordTeams, setPasswordTeams] = useState(2);
  const [passwordTargetScore, setPasswordTargetScore] = useState(10);
  const [passwordCategory, setPasswordCategory] = useState("animals");
  const [chainLength, setChainLength] = useState(5);
  const [chainRounds, setChainRounds] = useState(3);
  const [chainMode, setChainMode] = useState<"premade" | "custom">("premade");
  const [chainCategory, setChainCategory] = useState("animals");
  const [shadeRoundsPerPlayer, setShadeRoundsPerPlayer] = useState(1);
  const [shadeHardMode, setShadeHardMode] = useState(false);
  const [shadeLeaderPick, setShadeLeaderPick] = useState(false);
  const [locCluePairs, setLocCluePairs] = useState(2);
  const [locRoundsPerPlayer, setLocRoundsPerPlayer] = useState(1);

  useEffect(() => {
    if (firstVisit && nameInputRef.current) nameInputRef.current.focus();
  }, [firstVisit]);

  const ensureName = useCallback(() => {
    if (!getStoredName()) {
      const generated = randomName();
      setStoredName(generated);
      setName(generated);
      setSavedName(generated);
      void zero.mutate(mutators.sessions.setName({ id: sessionId, name: generated }));
    }
  }, [zero, sessionId]);

  const dismissFirstVisit = useCallback(() => {
    if (firstVisit) {
      ensureName();
      markVisited();
      setFirstVisit(false);
    }
  }, [firstVisit, ensureName]);

  useEffect(() => {
    if (!firstVisit) return;
    const handler = () => dismissFirstVisit();
    window.addEventListener("click", handler, { capture: true });
    return () => window.removeEventListener("click", handler, { capture: true });
  }, [firstVisit, dismissFirstVisit]);

  const saveName = async (event: FormEvent) => {
    event.preventDefault();
    dismissFirstVisit();
    const sanitizedName = name.replace(/\s/g, "");
    setStoredName(sanitizedName);
    setSavedName(sanitizedName);
    if (sanitizedName) {
      await zero.mutate(mutators.sessions.setName({ id: sessionId, name: sanitizedName })).server;
    } else {
      await zero.mutate(mutators.sessions.upsert({ id: sessionId, name: null })).server;
    }
  };

  const createImposter = async () => {
    setPendingAction("create-imposter");
    const id = nanoid();
    try {
      const result = await zero.mutate(mutators.imposter.create({ id, hostId: sessionId, category: imposterCategory, rounds: imposterRounds, imposters: imposterImposters })).server;
      if (result.type === "error") { showToast(result.error.message, "error"); return; }
      navigate(`/imposter/${id}`);
    } finally { setPendingAction(null); }
  };

  const createPassword = async () => {
    setPendingAction("create-password");
    const id = nanoid();
    try {
      const result = await zero.mutate(mutators.password.create({ id, hostId: sessionId, teamCount: passwordTeams, targetScore: passwordTargetScore, category: passwordCategory })).server;
      if (result.type === "error") { showToast(result.error.message, "error"); return; }
      navigate(`/password/${id}/begin`);
    } finally { setPendingAction(null); }
  };

  const createChainReaction = async () => {
    setPendingAction("create-chain");
    const id = nanoid();
    try {
      const result = await zero.mutate(mutators.chainReaction.create({ id, hostId: sessionId, chainLength, rounds: chainRounds, chainMode, category: chainCategory })).server;
      if (result.type === "error") { showToast(result.error.message, "error"); return; }
      navigate(`/chain/${id}`);
    } finally { setPendingAction(null); }
  };

  const createShadeSignal = async () => {
    setPendingAction("create-shade");
    const id = nanoid();
    try {
      const result = await zero.mutate(mutators.shadeSignal.create({ id, hostId: sessionId, roundsPerPlayer: shadeRoundsPerPlayer, hardMode: shadeHardMode, leaderPick: shadeLeaderPick })).server;
      if (result.type === "error") { showToast(result.error.message, "error"); return; }
      navigate(`/shade/${id}`);
    } finally { setPendingAction(null); }
  };

  const createLocationSignal = async () => {
    setPendingAction("create-location");
    const id = nanoid();
    try {
      const result = await zero.mutate(mutators.locationSignal.create({ id, hostId: sessionId, roundsPerPlayer: locRoundsPerPlayer, cluePairs: locCluePairs })).server;
      if (result.type === "error") { showToast(result.error.message, "error"); return; }
      navigate(`/location/${id}`);
    } finally { setPendingAction(null); }
  };

  const joinAny = async () => {
    setPendingAction("join");
    const normalizedCode = joinCode.trim().toUpperCase();
    if (!normalizedCode) { showToast("Enter a join code first.", "error"); setPendingAction(null); return; }
    ensureName();

    const mySession = mySessionRows[0] ?? null;
    const activeGameType = (mySession?.game_type ?? null) as SessionGameType | null;
    const activeGameId = mySession?.game_id ?? null;

    const queueJoinIfNeeded = (target: { gameType: SessionGameType; gameId: string; code: string; route: string }) => {
      const inAnotherGame = Boolean(activeGameType && activeGameId && (activeGameType !== target.gameType || activeGameId !== target.gameId));
      if (inAnotherGame) {
        if (activeGameType && activeGameId) {
          void leaveCurrentGame(zero, sessionId, activeGameType, activeGameId)
            .catch(() => showToast("Couldn't leave previous game cleanly", "error"));
        }
      }
      return false;
    };

    const performJoinTarget = async (target: { gameType: SessionGameType; gameId: string; code: string; route: string }) => {
      if (target.gameType === "imposter") {
        const result = await zero.mutate(mutators.imposter.join({ gameId: target.gameId, sessionId })).server;
        if (result.type === "error") { showToast(result.error.message, "error"); return; }
      } else if (target.gameType === "password") {
        const result = await zero.mutate(mutators.password.join({ gameId: target.gameId, sessionId })).server;
        if (result.type === "error") { showToast(result.error.message, "error"); return; }
      } else if (target.gameType === "chain_reaction") {
        const result = await zero.mutate(mutators.chainReaction.join({ gameId: target.gameId, sessionId })).server;
        if (result.type === "error") { showToast(result.error.message, "error"); return; }
      } else if (target.gameType === "shade_signal") {
        const result = await zero.mutate(mutators.shadeSignal.join({ gameId: target.gameId, sessionId })).server;
        if (result.type === "error") { showToast(result.error.message, "error"); return; }
      } else {
        const result = await zero.mutate(mutators.locationSignal.join({ gameId: target.gameId, sessionId })).server;
        if (result.type === "error") { showToast(result.error.message, "error"); return; }
      }
      addRecentGame({ id: target.gameId, code: target.code, gameType: target.gameType });
      setRecentGames(getRecentGames());
      navigate(target.route);
    };

    try {
      const imposterGame = imposterMatches[0];
      if (imposterGame) {
        const target = { gameType: "imposter" as const, gameId: imposterGame.id, code: imposterGame.code, route: `/imposter/${imposterGame.id}` };
        if (queueJoinIfNeeded(target)) return;
        await performJoinTarget(target);
        return;
      }
      const passwordGame = passwordMatches[0];
      if (passwordGame) {
        const target = { gameType: "password" as const, gameId: passwordGame.id, code: passwordGame.code, route: `/password/${passwordGame.id}/begin` };
        if (queueJoinIfNeeded(target)) return;
        await performJoinTarget(target);
        return;
      }
      const chainGame = chainMatches[0];
      if (chainGame) {
        const target = { gameType: "chain_reaction" as const, gameId: chainGame.id, code: chainGame.code, route: `/chain/${chainGame.id}` };
        if (queueJoinIfNeeded(target)) return;
        await performJoinTarget(target);
        return;
      }
      const shadeGame = shadeMatches[0];
      if (shadeGame) {
        const target = { gameType: "shade_signal" as const, gameId: shadeGame.id, code: shadeGame.code, route: `/shade/${shadeGame.id}` };
        if (queueJoinIfNeeded(target)) return;
        await performJoinTarget(target);
        return;
      }
      const locationGame = locationMatches[0];
      if (locationGame) {
        const target = { gameType: "location_signal" as const, gameId: locationGame.id, code: locationGame.code, route: `/location/${locationGame.id}` };
        if (queueJoinIfNeeded(target)) return;
        await performJoinTarget(target);
        return;
      }
      showToast("No game found for that code.", "error");
    } finally { setPendingAction(null); }
  };

  const confirmLeaveAndJoin = () => {
    if (!pendingJoinTarget) {
      setShowInSessionModal(false);
      return;
    }
    const mySession = mySessionRows[0] ?? null;
    const activeGameType = (mySession?.game_type ?? null) as SessionGameType | null;
    const activeGameId = mySession?.game_id ?? null;
    if (!activeGameType || !activeGameId) {
      setShowInSessionModal(false);
      setPendingJoinTarget(null);
      return;
    }
    setJoiningFromOtherGame(true);
    void leaveCurrentGame(zero, sessionId, activeGameType, activeGameId)
      .then(async () => {
        const target = pendingJoinTarget;
        if (!target) return;
        if (target.gameType === "imposter") {
          const result = await zero.mutate(mutators.imposter.join({ gameId: target.gameId, sessionId })).server;
          if (result.type === "error") { showToast(result.error.message, "error"); return; }
        } else if (target.gameType === "password") {
          const result = await zero.mutate(mutators.password.join({ gameId: target.gameId, sessionId })).server;
          if (result.type === "error") { showToast(result.error.message, "error"); return; }
        } else if (target.gameType === "chain_reaction") {
          const result = await zero.mutate(mutators.chainReaction.join({ gameId: target.gameId, sessionId })).server;
          if (result.type === "error") { showToast(result.error.message, "error"); return; }
        } else if (target.gameType === "shade_signal") {
          const result = await zero.mutate(mutators.shadeSignal.join({ gameId: target.gameId, sessionId })).server;
          if (result.type === "error") { showToast(result.error.message, "error"); return; }
        } else {
          const result = await zero.mutate(mutators.locationSignal.join({ gameId: target.gameId, sessionId })).server;
          if (result.type === "error") { showToast(result.error.message, "error"); return; }
        }
        addRecentGame({ id: target.gameId, code: target.code, gameType: target.gameType });
        setRecentGames(getRecentGames());
        navigate(target.route);
      })
      .catch(() => showToast("Couldn't leave current game", "error"))
      .finally(() => {
        setJoiningFromOtherGame(false);
        setShowInSessionModal(false);
        setPendingJoinTarget(null);
        setPendingAction(null);
      });
  };

  const toggle = (key: string) => setExpanded(expanded === key ? null : key);

  return (
    <div className="m-home">
      {/* Join Game – top of page */}
      <div className="m-card">
        <h3 className="m-home-section-title">
          <FiSearch size={14} style={{ opacity: 0.6 }} /> Join Game
        </h3>
        <div className="m-home-row">
          <input
            className="m-input"
            style={{ letterSpacing: "0.15em", fontWeight: 600, flex: 1 }}
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
            placeholder="ABCXYZ"
            maxLength={6}
          />
          <button
            className="m-btn m-btn-primary"
            onClick={() => void joinAny()}
            disabled={pendingAction !== null}
          >
            {pendingAction === "join" ? "…" : "Join"}
          </button>
        </div>

        {/* Recent Games – collapsible, connected to join section */}
        {recentGames.length > 0 && (
          <div className="m-recent-dropdown">
            <button className="m-recent-toggle" onClick={() => setShowRecent(!showRecent)}>
              <span>Recent Games</span>
              <div className="m-recent-toggle-right">
                <button className="m-text-btn" onClick={(e) => { e.stopPropagation(); clearRecentGames(); setRecentGames([]); setShowRecent(false); }}>Clear</button>
                {showRecent ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
              </div>
            </button>
            <div className={`m-recent-collapsible ${showRecent ? "m-recent-collapsible--open" : ""}`}>
              <div className="m-recent-list">
                {recentGames.map((game) => (
                  <MobileRecentGameItem key={`${game.gameType}-${game.id}`} game={game} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Display Name */}
      <div className="m-card">
        {firstVisit && (
          <div className="m-home-welcome">
            <span style={{ fontSize: "1.3rem" }}>⚡</span>
            <p>Welcome! Set a display name to get started.</p>
          </div>
        )}

        <h3 className="m-home-section-title">Display Name</h3>
        {savedName && (
          <p className="m-home-sublabel">
            Playing as <span style={{ color: "var(--primary)", fontWeight: 600 }}>{savedName}</span>
          </p>
        )}
        <form className="m-home-row" onSubmit={saveName}>
          <input
            className="m-input"
            ref={nameInputRef}
            value={name}
            onChange={(e) => setName(e.target.value.replace(/\s/g, ""))}
            placeholder="Enter name…"
            maxLength={32}
            style={{ flex: 1 }}
          />
          <button type="submit" className="m-btn m-btn-primary">Save</button>
        </form>
      </div>

      {/* Game Cards */}
      <h3 className="m-home-games-heading">Create a Game</h3>

      {/* Imposter */}
      <div className="m-game-card m-game-card--imposter">
        <button className="m-game-card-header" onClick={() => toggle("imposter")}>
          <div className="m-game-card-info">
            <FiEye size={18} />
            <div>
              <h3 className="m-game-card-title">Imposter</h3>
              <p className="m-game-card-desc">Find the liar. Give clues. Vote them out.</p>
            </div>
          </div>
          {expanded === "imposter" ? <FiChevronUp size={18} /> : <FiChevronDown size={18} />}
        </button>
        <div className="m-game-card-tags">
          <span className="m-tag">3–10 players</span>
          <span className="m-tag">Deduction</span>
          <span className="m-tag">Timed</span>
        </div>
        {expanded === "imposter" && (
          <div className="m-game-card-config">
            <div className="m-config-field">
              <label className="m-config-label">Category</label>
              <select className="m-input" value={imposterCategory} onChange={(e) => setImposterCategory(e.target.value)}>
                {imposterCategories.map((key) => (
                  <option key={key} value={key}>{imposterCategoryLabels[key] ?? key}</option>
                ))}
              </select>
            </div>
            <div className="m-config-row">
              <div className="m-config-field" style={{ flex: 1 }}>
                <label className="m-config-label">Imposters</label>
                <select className="m-input" value={imposterImposters} onChange={(e) => setImposterImposters(Number(e.target.value))}>
                  {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="m-config-field" style={{ flex: 1 }}>
                <label className="m-config-label">Rounds</label>
                <select className="m-input" value={imposterRounds} onChange={(e) => setImposterRounds(Number(e.target.value))}>
                  {[1, 2, 3, 5, 7, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <button
              className="m-btn m-btn-primary"
              style={{ width: "100%", marginTop: "0.5rem" }}
              onClick={() => void createImposter()}
              disabled={pendingAction !== null}
            >
              {pendingAction === "create-imposter" ? "Creating…" : "Create Imposter Game"}
            </button>
          </div>
        )}
      </div>

      {/* Password */}
      <div className="m-game-card m-game-card--password">
        <button className="m-game-card-header" onClick={() => toggle("password")}>
          <div className="m-game-card-info">
            <FiShield size={18} />
            <div>
              <h3 className="m-game-card-title">Password</h3>
              <p className="m-game-card-desc">One-word clues. Team guessing. First to target wins.</p>
            </div>
          </div>
          {expanded === "password" ? <FiChevronUp size={18} /> : <FiChevronDown size={18} />}
        </button>
        <div className="m-game-card-tags">
          <span className="m-tag">Teams</span>
          <span className="m-tag">Word clues</span>
          <span className="m-tag">Timed</span>
        </div>
        {expanded === "password" && (
          <div className="m-game-card-config">
            <div className="m-config-field">
              <label className="m-config-label">Category</label>
              <select className="m-input" value={passwordCategory} onChange={(e) => setPasswordCategory(e.target.value)}>
                {passwordCategories.map((key) => (
                  <option key={key} value={key}>{passwordCategoryLabels[key] ?? key}</option>
                ))}
              </select>
            </div>
            <div className="m-config-row">
              <div className="m-config-field" style={{ flex: 1 }}>
                <label className="m-config-label"><FiUsers size={13} /> Teams</label>
                <select className="m-input" value={passwordTeams} onChange={(e) => setPasswordTeams(Number(e.target.value))}>
                  {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} teams</option>)}
                </select>
              </div>
              <div className="m-config-field" style={{ flex: 1 }}>
                <label className="m-config-label">Points to Win</label>
                <select className="m-input" value={passwordTargetScore} onChange={(e) => setPasswordTargetScore(Number(e.target.value))}>
                  {[3, 5, 7, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <button
              className="m-btn m-btn-primary"
              style={{ width: "100%", marginTop: "0.5rem" }}
              onClick={() => void createPassword()}
              disabled={pendingAction !== null}
            >
              {pendingAction === "create-password" ? "Creating…" : "Create Password Game"}
            </button>
          </div>
        )}
      </div>

      {/* Chain Reaction */}
      <div className="m-game-card m-game-card--chain">
        <button className="m-game-card-header" onClick={() => toggle("chain")}>
          <div className="m-game-card-info">
            <FiLink size={18} />
            <div>
              <h3 className="m-game-card-title">Chain Reaction</h3>
              <p className="m-game-card-desc">Race to solve linked word chains in a 1v1 duel.</p>
            </div>
          </div>
          {expanded === "chain" ? <FiChevronUp size={18} /> : <FiChevronDown size={18} />}
        </button>
        <div className="m-game-card-tags">
          <span className="m-tag">2 players</span>
          <span className="m-tag">Word chains</span>
          <span className="m-tag">Turns</span>
        </div>
        {expanded === "chain" && (
          <div className="m-game-card-config">
            <div className="m-config-field">
              <label className="m-config-label">Category</label>
              <select className="m-input" value={chainCategory} onChange={(e) => setChainCategory(e.target.value)}>
                {chainCategories.map((key) => (
                  <option key={key} value={key}>{chainCategoryLabels[key] ?? key}</option>
                ))}
              </select>
            </div>
            <div className="m-config-row">
              <div className="m-config-field" style={{ flex: 1 }}>
                <label className="m-config-label">Chain Length</label>
                <select className="m-input" value={chainLength} onChange={(e) => setChainLength(Number(e.target.value))}>
                  {[5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n} words</option>)}
                </select>
              </div>
              <div className="m-config-field" style={{ flex: 1 }}>
                <label className="m-config-label">Rounds</label>
                <select className="m-input" value={chainRounds} onChange={(e) => setChainRounds(Number(e.target.value))}>
                  {[1, 2, 3, 5, 7].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <div className="m-config-field">
              <label className="m-config-label">Chain Mode</label>
              <select className="m-input" value={chainMode} onChange={(e) => setChainMode(e.target.value as "premade" | "custom")}>
                <option value="premade">Random (premade)</option>
                <option value="custom">Custom (both write)</option>
              </select>
            </div>
            <button
              className="m-btn m-btn-primary"
              style={{ width: "100%", marginTop: "0.5rem" }}
              onClick={() => void createChainReaction()}
              disabled={pendingAction !== null}
            >
              {pendingAction === "create-chain" ? "Creating…" : "Create Chain Reaction"}
            </button>
          </div>
        )}
      </div>

      {/* Shade Signal */}
      <div className="m-game-card m-game-card--shade">
        <button className="m-game-card-header" onClick={() => toggle("shade")}>
          <div className="m-game-card-info">
            <PiPaintBrushBold size={18} />
            <div>
              <h3 className="m-game-card-title">Shade Signal</h3>
              <p className="m-game-card-desc">One leader, one color. Give clues and guess the shade.</p>
            </div>
          </div>
          {expanded === "shade" ? <FiChevronUp size={18} /> : <FiChevronDown size={18} />}
        </button>
        <div className="m-game-card-tags">
          <span className="m-tag">3–10 players</span>
          <span className="m-tag">Color clues</span>
          <span className="m-tag">Proximity</span>
        </div>
        {expanded === "shade" && (
          <div className="m-game-card-config">
            <div className="m-config-row">
              <div className="m-config-field" style={{ flex: 1 }}>
                <label className="m-config-label">Game Length</label>
                <select className="m-input" value={shadeRoundsPerPlayer} onChange={(e) => setShadeRoundsPerPlayer(Number(e.target.value))}>
                  <option value={1}>Quick (1 each)</option>
                  <option value={2}>Standard (2 each)</option>
                  <option value={3}>Long (3 each)</option>
                </select>
              </div>
              <div className="m-config-field" style={{ flex: 1 }}>
                <label className="m-config-label">Clue Rules</label>
                <select className="m-input" value={shadeHardMode ? "yes" : "no"} onChange={(e) => setShadeHardMode(e.target.value === "yes")}>
                  <option value="no">Normal</option>
                  <option value="yes">No Color Names</option>
                </select>
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.82rem", color: "var(--secondary)", cursor: "pointer", marginTop: "0.25rem" }}>
              <input
                type="checkbox"
                checked={shadeLeaderPick}
                onChange={(e) => setShadeLeaderPick(e.target.checked)}
                style={{ accentColor: "var(--primary)" }}
              />
              🎨 Leader picks their own color
            </label>
            <button
              className="m-btn m-btn-primary"
              style={{ width: "100%", marginTop: "0.5rem" }}
              onClick={() => void createShadeSignal()}
              disabled={pendingAction !== null}
            >
              {pendingAction === "create-shade" ? "Creating…" : "Create Shade Signal"}
            </button>
          </div>
        )}
      </div>

      <div className="m-game-card m-game-card--location">
        <button className="m-game-card-header" onClick={() => toggle("location")}>
          <div className="m-game-card-info">
            <FiMapPin size={18} />
            <div>
              <h3 className="m-game-card-title">Location Signal</h3>
              <p className="m-game-card-desc">Pick a spot on the globe. Give clues. Guess the location.</p>
            </div>
          </div>
          {expanded === "location" ? <FiChevronUp size={18} /> : <FiChevronDown size={18} />}
        </button>
        <div className="m-game-card-tags">
          <span className="m-tag">2–10 players</span>
          <span className="m-tag">Geography</span>
          <span className="m-tag">Distance Scoring</span>
        </div>
        {expanded === "location" && (
          <div className="m-game-card-config">
            <div className="m-config-row">
              <div className="m-config-field">
                <label className="m-config-label">Clue Pairs</label>
                <select className="m-input" value={locCluePairs} onChange={(e) => setLocCluePairs(Number(e.target.value))}>
                  <option value={1}>1 pair (quick)</option>
                  <option value={2}>2 pairs (standard)</option>
                  <option value={3}>3 pairs (long)</option>
                  <option value={4}>4 pairs (marathon)</option>
                </select>
              </div>
              <div className="m-config-field">
                <label className="m-config-label">Rounds / Player</label>
                <select className="m-input" value={locRoundsPerPlayer} onChange={(e) => setLocRoundsPerPlayer(Number(e.target.value))}>
                  <option value={1}>Quick (1)</option>
                  <option value={2}>Standard (2)</option>
                  <option value={3}>Long (3)</option>
                </select>
              </div>
            </div>
            <button
              className="m-btn m-btn-primary"
              style={{ width: "100%" }}
              onClick={() => void createLocationSignal()}
              disabled={pendingAction !== null}
            >
              {pendingAction === "create-location" ? "Creating…" : "Create Location Signal"}
            </button>
          </div>
        )}
      </div>

      {showInSessionModal && pendingJoinTarget && (
        <InSessionModal
          gameType={pendingJoinTarget.gameType}
          busy={joiningFromOtherGame}
          onCancel={() => {
            setShowInSessionModal(false);
            setPendingJoinTarget(null);
            setPendingAction(null);
          }}
          onConfirm={confirmLeaveAndJoin}
        />
      )}
    </div>
  );
}

/* ── Recent game item (mobile) ───── */
function MobileRecentGameItem({ game }: { game: { id: string; code: string; gameType: string } }) {
  const typeLabel = game.gameType === "chain_reaction" ? "Chain Reaction" : game.gameType === "shade_signal" ? "Shade Signal" : game.gameType === "location_signal" ? "Location Signal" : game.gameType.charAt(0).toUpperCase() + game.gameType.slice(1);

  const link = game.gameType === "imposter"
    ? `/imposter/${game.id}`
    : game.gameType === "password"
    ? `/password/${game.id}/begin`
    : game.gameType === "shade_signal"
    ? `/shade/${game.id}`
    : game.gameType === "location_signal"
    ? `/location/${game.id}`
    : `/chain/${game.id}`;

  return (
    <Link to={link} className="m-recent-item">
      <span className="m-recent-type">{typeLabel}</span>
      <span className="m-recent-code">{game.code}</span>
    </Link>
  );
}
