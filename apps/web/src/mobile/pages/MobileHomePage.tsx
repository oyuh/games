import { DEFAULT_IMPOSTER_CLUE_VISIBILITY, GAME_META, IMPOSTER_CLUE_VISIBILITY_OPTIONS, imposterCategories, imposterCategoryLabels, chainCategories, chainCategoryLabels, multiplayerTypeToGameSlug, passwordCategories, passwordCategoryLabels, mutators, queries } from "@games/shared";
import { optimistic, useQuery, useZero } from "../../lib/zero";
import { nanoid } from "nanoid";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { FiArrowDown, FiArrowLeft, FiSearch, FiChevronDown, FiChevronUp, FiShare, FiGlobe, FiGithub } from "react-icons/fi";
import { InSessionModal } from "../../components/shared/InSessionModal";
import { ActiveGameModal } from "../../components/shared/ActiveGameBanner";
import { PublicGamesList, usePublicGameCount } from "../../components/shared/PublicGamesBrowser";
import { GameIcon } from "../../components/shared/GameIcon";
import { addRecentGame, clearRecentGames, ensureName as ensureSessionName, getDisplayName, getOrCreateStoredName, getRecentGames, hasVisited, leaveCurrentGame, markVisited, SessionGameType, setStoredName } from "../../lib/session";
import { showToast } from "../../lib/toast";
import { isNameRestricted } from "../../hooks/useAdminBroadcast";
import { type HomeRouteGame } from "../../lib/home-route-highlight";
import { useHomePage } from "../../hooks/useHomePage";

/** Scroll-wheel on a <select> cycles through its options */
function wheelSelect<T>(value: T, opts: readonly T[], set: (v: T) => void) {
  return (e: React.WheelEvent) => {
    const i = opts.indexOf(value);
    if (i < 0) return;
    const next = e.deltaY < 0 ? Math.max(0, i - 1) : Math.min(opts.length - 1, i + 1);
    if (next !== i) set(opts[next]!);
  };
}

function formatClueVisibility(value: number) {
  if (value <= 0) return "No hints";
  if (value >= 1) return "Full clues";
  return `${Math.round(value * 100)}% shown`;
}

const NEW_GAME_ISSUE_URL = "https://github.com/oyuh/games/issues/new?template=new-game.md&title=%5BNew%20Game%5D%20";

export function MobileHomePage({ sessionId }: { sessionId: string }) {
  const {
    zero, navigate,
    name, setName, savedName, firstVisit, nameInputRef,
    recentGames, setRecentGames, joinCode, setJoinCode, pendingAction,
    showInSessionModal, setShowInSessionModal,
    joiningFromOtherGame, pendingJoinTarget, setPendingJoinTarget, setPendingAction,
    imposterPublicCount, passwordPublicCount, chainPublicCount, shadePublicCount, locationPublicCount,
    imposterCategory, setImposterCategory, imposterImposters, setImposterImposters,
    imposterRounds, setImposterRounds, imposterClueVisibility, setImposterClueVisibility,
    passwordCategory, setPasswordCategory, passwordTeams, setPasswordTeams,
    passwordTargetScore, setPasswordTargetScore,
    chainCategory, setChainCategory, chainLength, setChainLength,
    chainRounds, setChainRounds, chainMode, setChainMode,
    shadeRoundsPerPlayer, setShadeRoundsPerPlayer, shadeHardMode, setShadeHardMode,
    shadeLeaderPick, setShadeLeaderPick,
    locCluePairs, setLocCluePairs, locRoundsPerPlayer, setLocRoundsPerPlayer,
    saveName, joinAny, confirmLeaveAndJoin,
    createImposter, createPassword, createChainReaction, createShadeSignal, createLocationSignal,
    routeHighlightClass,
  } = useHomePage(sessionId);

  /* Mobile-only layout state: one accordion key and one browser key, where
     desktop keeps five separate booleans of each. */
  const [expanded, setExpanded] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState<string | null>(null);
  const [showRecent, setShowRecent] = useState(false);
  const toggle = (key: string) => setExpanded(expanded === key ? null : key);

  return (
    <div className="m-home">
      <ActiveGameModal sessionId={sessionId} suppress={pendingAction !== null} />
      {/* Join Game – top of page */}
      <div className="m-card">
        <h3 className="m-home-section-title">
          <FiSearch size={14} style={{ opacity: 0.6 }} /> Join Game
        </h3>
        <div className="m-home-row">
          <input
            className="m-input"
            style={{ letterSpacing: "0.04em", fontWeight: 600, flex: 1 }}
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
        <h3 className="m-home-section-title">Display Name</h3>
        {/* Same hint the desktop card uses: it sits on the field it is about
            instead of being a banner about the page. */}
        {firstVisit && (
          <div className="m-home-welcome">
            <div className="m-home-welcome-row">
              <span className="m-home-welcome-icon"><FiArrowDown size={15} aria-hidden="true" /></span>
              <div className="m-home-welcome-text">
                <strong>Type a name here</strong>
                <span>Or skip it, you get a random one and can change it later.</span>
              </div>
            </div>
            <div className="m-home-welcome-divider" />
            <div className="m-home-welcome-row">
              <span className="m-home-welcome-icon"><FiShare size={14} aria-hidden="true" /></span>
              <div className="m-home-welcome-text">
                <strong>Install it as an app</strong>
                <span>Tap Share, then Add to Home Screen.</span>
              </div>
            </div>
          </div>
        )}

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
      <div className={`m-game-card m-game-card--imposter${routeHighlightClass("imposter")}`} data-home-game-card="imposter">
        <button className="m-game-card-header" onClick={() => toggle("imposter")}>
          <div className="m-game-card-info">
            <GameIcon game="imposter" size={18} />
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
        {(expanded === "imposter" || browsing === "imposter") && (
          browsing === "imposter" ? (
            <div className="m-game-card-config hc-card-anim" key="browse">
              <PublicGamesList gameType="imposter" sessionId={sessionId} />
              <button className="m-btn m-btn-muted m-home-back-icon" aria-label="Back to Imposter options" onClick={() => setBrowsing(null)}>
                <FiArrowLeft size={18} aria-hidden="true" />
              </button>
            </div>
          ) : (
          <div className="m-game-card-config hc-card-anim" key="config">
            <div className="m-config-field">
              <label htmlFor="mobile-home-imposter-category" className="m-config-label">Category</label>
              <select id="mobile-home-imposter-category" className="m-input" value={imposterCategory} onChange={(e) => setImposterCategory(e.target.value)} onWheel={wheelSelect(imposterCategory, imposterCategories as string[], setImposterCategory)}>
                {imposterCategories.map((key) => (
                  <option key={key} value={key}>{imposterCategoryLabels[key] ?? key}</option>
                ))}
              </select>
            </div>
            <div className="m-config-row">
              <div className="m-config-field" style={{ flex: 1 }}>
                <label htmlFor="mobile-home-imposter-count" className="m-config-label">Imposters</label>
                <select id="mobile-home-imposter-count" className="m-input" value={imposterImposters} onChange={(e) => setImposterImposters(Number(e.target.value))} onWheel={wheelSelect(imposterImposters, [1, 2, 3], setImposterImposters)}>
                  {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="m-config-field" style={{ flex: 1 }}>
                <label htmlFor="mobile-home-imposter-rounds" className="m-config-label">Rounds</label>
                <select id="mobile-home-imposter-rounds" className="m-input" value={imposterRounds} onChange={(e) => setImposterRounds(Number(e.target.value))} onWheel={wheelSelect(imposterRounds, [1, 2, 3, 5, 7, 10], setImposterRounds)}>
                  {[1, 2, 3, 5, 7, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <div className="m-config-field">
              <label htmlFor="mobile-home-imposter-clue-visibility" className="m-config-label">Hint Visibility</label>
              <select
                id="mobile-home-imposter-clue-visibility"
                className="m-input"
                value={imposterClueVisibility}
                onChange={(e) => setImposterClueVisibility(Number(e.target.value))}
                onWheel={wheelSelect(imposterClueVisibility, IMPOSTER_CLUE_VISIBILITY_OPTIONS, setImposterClueVisibility)}
              >
                {IMPOSTER_CLUE_VISIBILITY_OPTIONS.map((value) => (
                  <option key={value} value={value}>{formatClueVisibility(value)}</option>
                ))}
              </select>
            </div>
            <div className="m-create-actions">
              <button className={`m-btn m-browse-globe${imposterPublicCount === 0 ? " m-globe-empty" : ""}`} onClick={() => { setBrowsing("imposter"); setExpanded(null); }} data-tooltip="Browse Public Games" data-tooltip-variant="info">
                <FiGlobe size={16} />
                {imposterPublicCount > 0 && <span className="hc-globe-badge">{imposterPublicCount}</span>}
              </button>
              <button
                className="m-btn m-btn-primary m-create-it-btn"
                onClick={() => void createImposter()}
                disabled={pendingAction !== null}
              >
                {pendingAction === "create-imposter" ? "Creating…" : "Create It!"}
              </button>
            </div>
          </div>
          )
        )}
      </div>

      {/* Password */}
      <div className={`m-game-card m-game-card--password${routeHighlightClass("password")}`} data-home-game-card="password">
        <button className="m-game-card-header" onClick={() => toggle("password")}>
          <div className="m-game-card-info">
            <GameIcon game="password" size={18} />
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
        {(expanded === "password" || browsing === "password") && (
          browsing === "password" ? (
            <div className="m-game-card-config hc-card-anim" key="browse">
              <PublicGamesList gameType="password" sessionId={sessionId} />
              <button className="m-btn m-btn-muted m-home-back-icon" aria-label="Back to Password options" onClick={() => setBrowsing(null)}>
                <FiArrowLeft size={18} aria-hidden="true" />
              </button>
            </div>
          ) : (
          <div className="m-game-card-config hc-card-anim" key="config">
            <div className="m-config-field">
              <label htmlFor="mobile-home-password-category" className="m-config-label">Category</label>
              <select id="mobile-home-password-category" className="m-input" value={passwordCategory} onChange={(e) => setPasswordCategory(e.target.value)} onWheel={wheelSelect(passwordCategory, passwordCategories as string[], setPasswordCategory)}>
                {passwordCategories.map((key) => (
                  <option key={key} value={key}>{passwordCategoryLabels[key] ?? key}</option>
                ))}
              </select>
            </div>
            <div className="m-config-row">
              <div className="m-config-field" style={{ flex: 1 }}>
                <label htmlFor="mobile-home-password-teams" className="m-config-label">Teams</label>
                <select id="mobile-home-password-teams" className="m-input" value={passwordTeams} onChange={(e) => setPasswordTeams(Number(e.target.value))} onWheel={wheelSelect(passwordTeams, [2, 3, 4, 5, 6], setPasswordTeams)}>
                  {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="m-config-field" style={{ flex: 1 }}>
                <label htmlFor="mobile-home-password-target-score" className="m-config-label">Target Score</label>
                <select id="mobile-home-password-target-score" className="m-input" value={passwordTargetScore} onChange={(e) => setPasswordTargetScore(Number(e.target.value))} onWheel={wheelSelect(passwordTargetScore, [3, 5, 7, 10, 15, 20], setPasswordTargetScore)}>
                  {[3, 5, 7, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <div className="m-create-actions">
              <button className={`m-btn m-browse-globe${passwordPublicCount === 0 ? " m-globe-empty" : ""}`} onClick={() => { setBrowsing("password"); setExpanded(null); }} data-tooltip="Browse Public Games" data-tooltip-variant="info">
                <FiGlobe size={16} />
                {passwordPublicCount > 0 && <span className="hc-globe-badge">{passwordPublicCount}</span>}
              </button>
              <button
                className="m-btn m-btn-primary m-create-it-btn"
                onClick={() => void createPassword()}
                disabled={pendingAction !== null}
              >
                {pendingAction === "create-password" ? "Creating…" : "Create It!"}
              </button>
            </div>
          </div>
          )
        )}
      </div>

      {/* Chain Reaction */}
      <div className={`m-game-card m-game-card--chain${routeHighlightClass("chain")}`} data-home-game-card="chain">
        <button className="m-game-card-header" onClick={() => toggle("chain")}>
          <div className="m-game-card-info">
            <GameIcon game="chain" size={18} />
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
        {(expanded === "chain" || browsing === "chain") && (
          browsing === "chain" ? (
            <div className="m-game-card-config hc-card-anim" key="browse">
              <PublicGamesList gameType="chain_reaction" sessionId={sessionId} />
              <button className="m-btn m-btn-muted m-home-back-icon" aria-label="Back to Chain Reaction options" onClick={() => setBrowsing(null)}>
                <FiArrowLeft size={18} aria-hidden="true" />
              </button>
            </div>
          ) : (
          <div className="m-game-card-config hc-card-anim" key="config">
            <div className="m-config-field">
              <label htmlFor="mobile-home-chain-category" className="m-config-label">Category</label>
              <select id="mobile-home-chain-category" className="m-input" value={chainCategory} onChange={(e) => setChainCategory(e.target.value)} onWheel={wheelSelect(chainCategory, chainCategories as string[], setChainCategory)}>
                {chainCategories.map((key) => (
                  <option key={key} value={key}>{chainCategoryLabels[key] ?? key}</option>
                ))}
              </select>
            </div>
            <div className="m-config-row">
              <div className="m-config-field" style={{ flex: 1 }}>
                <label htmlFor="mobile-home-chain-length" className="m-config-label">Length</label>
                <select id="mobile-home-chain-length" className="m-input" value={chainLength} onChange={(e) => setChainLength(Number(e.target.value))} onWheel={wheelSelect(chainLength, [5, 6, 7, 8, 9, 10], setChainLength)}>
                  {[5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n} words</option>)}
                </select>
              </div>
              <div className="m-config-field" style={{ flex: 1 }}>
                <label htmlFor="mobile-home-chain-rounds" className="m-config-label">Rounds</label>
                <select id="mobile-home-chain-rounds" className="m-input" value={chainRounds} onChange={(e) => setChainRounds(Number(e.target.value))} onWheel={wheelSelect(chainRounds, [1, 2, 3, 5, 7], setChainRounds)}>
                  {[1, 2, 3, 5, 7].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <div className="m-config-field">
              <label htmlFor="mobile-home-chain-mode" className="m-config-label">Mode</label>
              <select id="mobile-home-chain-mode" className="m-input" value={chainMode} onChange={(e) => setChainMode(e.target.value as "premade" | "custom")} onWheel={wheelSelect(chainMode, ["premade", "custom"] as const, (v) => setChainMode(v as "premade" | "custom"))}>
                <option value="premade">Random (premade)</option>
                <option value="custom">Custom (write your own)</option>
              </select>
            </div>
            <div className="m-create-actions">
              <button className={`m-btn m-browse-globe${chainPublicCount === 0 ? " m-globe-empty" : ""}`} onClick={() => { setBrowsing("chain"); setExpanded(null); }} data-tooltip="Browse Public Games" data-tooltip-variant="info">
                <FiGlobe size={16} />
                {chainPublicCount > 0 && <span className="hc-globe-badge">{chainPublicCount}</span>}
              </button>
              <button
                className="m-btn m-btn-primary m-create-it-btn"
                onClick={() => void createChainReaction()}
                disabled={pendingAction !== null}
              >
                {pendingAction === "create-chain" ? "Creating…" : "Create It!"}
              </button>
            </div>
          </div>
          )
        )}
      </div>

      {/* Shade Signal */}
      <div className={`m-game-card m-game-card--shade${routeHighlightClass("shade")}`} data-home-game-card="shade">
        <button className="m-game-card-header" onClick={() => toggle("shade")}>
          <div className="m-game-card-info">
            <GameIcon game="shade" size={18} />
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
        {(expanded === "shade" || browsing === "shade") && (
          browsing === "shade" ? (
            <div className="m-game-card-config hc-card-anim" key="browse">
              <PublicGamesList gameType="shade_signal" sessionId={sessionId} />
              <button className="m-btn m-btn-muted m-home-back-icon" aria-label="Back to Shade Signal options" onClick={() => setBrowsing(null)}>
                <FiArrowLeft size={18} aria-hidden="true" />
              </button>
            </div>
          ) : (
          <div className="m-game-card-config hc-card-anim" key="config">
            <div className="m-config-row">
              <div className="m-config-field" style={{ flex: 1 }}>
                <label htmlFor="mobile-home-shade-rounds-per-player" className="m-config-label">Game Length</label>
                <select id="mobile-home-shade-rounds-per-player" className="m-input" value={shadeRoundsPerPlayer} onChange={(e) => setShadeRoundsPerPlayer(Number(e.target.value))} onWheel={wheelSelect(shadeRoundsPerPlayer, [1, 2, 3], setShadeRoundsPerPlayer)}>
                  <option value={1}>Quick</option>
                  <option value={2}>Standard</option>
                  <option value={3}>Long</option>
                </select>
              </div>
              <div className="m-config-field" style={{ flex: 1 }}>
                <label htmlFor="mobile-home-shade-clue-rules" className="m-config-label">Clue Rules</label>
                <select id="mobile-home-shade-clue-rules" className="m-input" value={shadeHardMode ? "yes" : "no"} onChange={(e) => setShadeHardMode(e.target.value === "yes")}>
                  <option value="no">Normal</option>
                  <option value="yes">No Colors</option>
                </select>
              </div>
            </div>
            <label className="hc-config-check">
              <input
                type="checkbox"
                checked={shadeLeaderPick}
                onChange={(e) => setShadeLeaderPick(e.target.checked)}
              />
              🎨 Leader picks their own color
            </label>
            <div className="m-create-actions">
              <button className={`m-btn m-browse-globe${shadePublicCount === 0 ? " m-globe-empty" : ""}`} onClick={() => { setBrowsing("shade"); setExpanded(null); }} data-tooltip="Browse Public Games" data-tooltip-variant="info">
                <FiGlobe size={16} />
                {shadePublicCount > 0 && <span className="hc-globe-badge">{shadePublicCount}</span>}
              </button>
              <button
                className="m-btn m-btn-primary m-create-it-btn"
                onClick={() => void createShadeSignal()}
                disabled={pendingAction !== null}
              >
                {pendingAction === "create-shade" ? "Creating…" : "Create It!"}
              </button>
            </div>
          </div>
          )
        )}
      </div>

      <div className={`m-game-card m-game-card--location${routeHighlightClass("location")}`} data-home-game-card="location">
        <button className="m-game-card-header" onClick={() => toggle("location")}>
          <div className="m-game-card-info">
            <GameIcon game="location" size={18} />
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
        {(expanded === "location" || browsing === "location") && (
          browsing === "location" ? (
            <div className="m-game-card-config hc-card-anim" key="browse">
              <PublicGamesList gameType="location_signal" sessionId={sessionId} />
              <button className="m-btn m-btn-muted m-home-back-icon" aria-label="Back to Location Signal options" onClick={() => setBrowsing(null)}>
                <FiArrowLeft size={18} aria-hidden="true" />
              </button>
            </div>
          ) : (
          <div className="m-game-card-config hc-card-anim" key="config">
            <div className="m-config-row">
              <div className="m-config-field" style={{ flex: 1 }}>
                <label htmlFor="mobile-home-location-clue-pairs" className="m-config-label">Clue Pairs</label>
                <select id="mobile-home-location-clue-pairs" className="m-input" value={locCluePairs} onChange={(e) => setLocCluePairs(Number(e.target.value))} onWheel={wheelSelect(locCluePairs, [1, 2, 3, 4], setLocCluePairs)}>
                  <option value={1}>1 pair</option>
                  <option value={2}>2 pairs</option>
                  <option value={3}>3 pairs</option>
                  <option value={4}>4 pairs</option>
                </select>
              </div>
              <div className="m-config-field" style={{ flex: 1 }}>
                <label htmlFor="mobile-home-location-rounds-per-player" className="m-config-label">Rounds / Player</label>
                <select id="mobile-home-location-rounds-per-player" className="m-input" value={locRoundsPerPlayer} onChange={(e) => setLocRoundsPerPlayer(Number(e.target.value))} onWheel={wheelSelect(locRoundsPerPlayer, [1, 2, 3], setLocRoundsPerPlayer)}>
                  <option value={1}>1 each</option>
                  <option value={2}>2 each</option>
                  <option value={3}>3 each</option>
                </select>
              </div>
            </div>
            <div className="m-create-actions">
              <button className={`m-btn m-browse-globe${locationPublicCount === 0 ? " m-globe-empty" : ""}`} onClick={() => { setBrowsing("location"); setExpanded(null); }} data-tooltip="Browse Public Games" data-tooltip-variant="info">
                <FiGlobe size={16} />
                {locationPublicCount > 0 && <span className="hc-globe-badge">{locationPublicCount}</span>}
              </button>
              <button
                className="m-btn m-btn-primary m-create-it-btn"
                onClick={() => void createLocationSignal()}
                disabled={pendingAction !== null}
              >
                {pendingAction === "create-location" ? "Creating…" : "Create It!"}
              </button>
            </div>
          </div>
          )
        )}
      </div>

      {/* ── Solo / Singleplayer Games ──────────────────── */}
      <h3 className="m-home-games-heading" style={{ marginTop: "0.5rem" }}>Singleplayer</h3>

      <Link to="/shikaku" className="m-solo-card m-solo-card--shikaku" data-game-theme="shikaku">
        <div className="m-solo-card-icon"><GameIcon game="shikaku" size={20} /></div>
        <div className="m-solo-card-body">
          <h3 className="m-solo-card-title">Shikaku</h3>
          <p className="m-solo-card-desc">Divide the grid into rectangles</p>
        </div>
        <span className="m-solo-card-cta">Click to Play</span>
      </Link>

      <Link to="/pips" className="m-solo-card m-solo-card--pips" data-game-theme="pips">
        <div className="m-solo-card-icon"><GameIcon game="pips" size={20} /></div>
        <div className="m-solo-card-body">
          <h3 className="m-solo-card-title">Pips</h3>
          <p className="m-solo-card-desc">Fill the board with dominoes</p>
        </div>
        <span className="m-solo-card-cta">Click to Play</span>
      </Link>

      <a
        href={NEW_GAME_ISSUE_URL}
        target="_blank"
        rel="noreferrer"
        className="m-solo-card m-solo-card--ideas"
      >
        <div className="m-solo-card-icon"><FiGithub size={20} /></div>
        <div className="m-solo-card-body">
          <h3 className="m-solo-card-title">Coming Soon</h3>
          <p className="m-solo-card-desc">Suggest the next singleplayer game on GitHub</p>
        </div>
        <span className="m-solo-card-cta">Coming Soon</span>
      </a>

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
  const typeLabel = labelForRecentGameType(game.gameType);

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

function labelForRecentGameType(gameType: string) {
  if (gameType === "imposter" || gameType === "password" || gameType === "chain_reaction" || gameType === "shade_signal" || gameType === "location_signal") {
    return GAME_META[multiplayerTypeToGameSlug(gameType)].title;
  }
  return gameType.charAt(0).toUpperCase() + gameType.slice(1);
}
