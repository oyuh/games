import { GAME_META, multiplayerTypeToGameSlug, type GameSlug } from "@games/shared";
import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { FiChevronRight, FiGithub, FiX } from "react-icons/fi";
import { InSessionModal } from "../../components/shared/InSessionModal";
import { ActiveGameModal } from "../../components/shared/ActiveGameBanner";
import { PublicGamesList } from "../../components/shared/PublicGamesBrowser";
import { GameIcon } from "../../components/shared/GameIcon";
import { GameSetup, type HomeState } from "../../components/home/GameSetup";
import { clearRecentGames, removeRecentGame, type RecentGame } from "../../lib/session";
import { HOME_ROUTE_GAMES, type HomeRouteGame } from "../../lib/home-route-highlight";
import { useHomePage } from "../../hooks/useHomePage";
import { BottomSheet } from "../components/BottomSheet";

const NEW_GAME_ISSUE_URL = "https://github.com/oyuh/games/issues/new?template=new-game.md&title=%5BNew%20Game%5D%20";

function accentStyle(game: GameSlug) {
  return { "--card-accent": GAME_META[game].accent } as CSSProperties;
}

function publicCount(home: HomeState, game: HomeRouteGame) {
  return {
    imposter: home.imposterPublicCount,
    password: home.passwordPublicCount,
    chain: home.chainPublicCount,
    shade: home.shadePublicCount,
    location: home.locationPublicCount,
  }[game];
}

function createGame(home: HomeState, game: HomeRouteGame) {
  const create = {
    imposter: home.createImposter,
    password: home.createPassword,
    chain: home.createChainReaction,
    shade: home.createShadeSignal,
    location: home.createLocationSignal,
  }[game];
  void create();
}

export function MobileHomePage({ sessionId }: { sessionId: string }) {
  const home = useHomePage(sessionId);
  const { name, setName, savedName, firstVisit, nameInputRef, recentGames, setRecentGames, joinCode, setJoinCode, pendingAction } = home;

  // A /imposter style link lands here as ?game=imposter, so open that game's
  // sheet straight away instead of making them find the row.
  const [sheetGame, setSheetGame] = useState<HomeRouteGame | null>(home.activeRouteHighlight);
  const [browsing, setBrowsing] = useState(false);

  const openSheet = (game: HomeRouteGame) => {
    setBrowsing(false);
    setSheetGame(game);
  };

  return (
    <div className="m-home">
      <ActiveGameModal sessionId={sessionId} suppress={pendingAction !== null} />

      <header className="m-head">
        <h1 className="m-head-title">Games</h1>
        <p className="m-head-sub">
          {savedName ? <>Playing as <strong>{savedName}</strong></> : "Pick a name, then start or join a game."}
        </p>
      </header>

      <section className="m-section">
        <h2 className="m-label">Join a game</h2>
        <form
          className="m-field-row"
          onSubmit={(event) => {
            event.preventDefault();
            void home.joinAny();
          }}
        >
          <input
            className="m-input m-code-input"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
            placeholder="ABCXYZ"
            maxLength={6}
            autoCapitalize="characters"
            autoComplete="off"
            enterKeyHint="go"
            aria-label="Game code"
          />
          <button className="m-btn m-btn--primary" type="submit" disabled={pendingAction !== null}>
            {pendingAction === "join" ? "Joining…" : "Join"}
          </button>
        </form>
      </section>

      <section className="m-section">
        <h2 className="m-label">Your name</h2>
        <form className="m-field-row" onSubmit={home.saveName}>
          <input
            className="m-input"
            ref={nameInputRef}
            value={name}
            onChange={(e) => setName(e.target.value.replace(/\s/g, ""))}
            placeholder="Enter name…"
            maxLength={32}
            autoComplete="nickname"
            enterKeyHint="done"
            aria-label="Display name"
          />
          <button type="submit" className="m-btn m-btn--quiet">Save</button>
        </form>
        {firstVisit && (
          <p className="m-note">
            Skip it and you get a random name you can change later. To keep this on your home screen, tap Share, then
            Add to Home Screen.
          </p>
        )}
      </section>

      {recentGames.length > 0 && (
        <section className="m-section">
          <div className="m-section-head">
            <h2 className="m-label">Recent</h2>
            <button
              className="m-link"
              type="button"
              onClick={() => {
                clearRecentGames();
                setRecentGames([]);
              }}
            >
              Clear
            </button>
          </div>
          <ul className="m-list">
            {recentGames.map((game) => (
              <RecentRow
                key={`${game.gameType}-${game.id}`}
                game={game}
                onRemove={() => {
                  removeRecentGame(game.id, game.gameType);
                  setRecentGames((current) => current.filter((g) => !(g.id === game.id && g.gameType === game.gameType)));
                }}
              />
            ))}
          </ul>
        </section>
      )}

      <section className="m-section">
        <h2 className="m-label">Multiplayer</h2>
        <ul className="m-list">
          {HOME_ROUTE_GAMES.map((game) => {
            const meta = GAME_META[game];
            const live = publicCount(home, game);
            return (
              <li key={game}>
                <button className="m-row" type="button" style={accentStyle(game)} onClick={() => openSheet(game)}>
                  <span className="m-row-icon"><GameIcon game={game} size={18} /></span>
                  <span className="m-row-text">
                    <span className="m-row-title">{meta.title}</span>
                    <span className="m-row-meta">{meta.shortDescription}</span>
                  </span>
                  <span className="m-row-end">
                    {live > 0 ? <span className="m-row-live">{live} live</span> : meta.players}
                    <FiChevronRight size={16} aria-hidden="true" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="m-section">
        <h2 className="m-label">Solo</h2>
        <ul className="m-list">
          {(["shikaku", "pips"] as const).map((game) => (
            <li key={game}>
              <Link className="m-row" to={`/${game}`} style={accentStyle(game)}>
                <span className="m-row-icon"><GameIcon game={game} size={18} /></span>
                <span className="m-row-text">
                  <span className="m-row-title">{GAME_META[game].title}</span>
                  <span className="m-row-meta">{GAME_META[game].shortDescription}</span>
                </span>
                <span className="m-row-end"><FiChevronRight size={16} aria-hidden="true" /></span>
              </Link>
            </li>
          ))}
          <li>
            <a className="m-row" href={NEW_GAME_ISSUE_URL} target="_blank" rel="noreferrer">
              <span className="m-row-icon"><FiGithub size={18} /></span>
              <span className="m-row-text">
                <span className="m-row-title">Suggest a game</span>
                <span className="m-row-meta">Open an issue on GitHub</span>
              </span>
              <span className="m-row-end"><FiChevronRight size={16} aria-hidden="true" /></span>
            </a>
          </li>
        </ul>
      </section>

      {sheetGame && (
        <BottomSheet title={GAME_META[sheetGame].title} onClose={() => setSheetGame(null)}>
          <div className="m-create" style={accentStyle(sheetGame)}>
            <p className="m-create-meta">
              {GAME_META[sheetGame].players} players · {GAME_META[sheetGame].shortDescription}
            </p>

            {browsing ? (
              <>
                <PublicGamesList gameType={GAME_META[sheetGame].multiplayerType!} sessionId={sessionId} />
                <button className="m-link m-create-link" type="button" onClick={() => setBrowsing(false)}>
                  Back to settings
                </button>
              </>
            ) : (
              <>
                <GameSetup game={sheetGame} home={home} />
                <button
                  className="m-btn m-btn--primary m-btn--block"
                  type="button"
                  disabled={pendingAction !== null}
                  onClick={() => createGame(home, sheetGame)}
                >
                  {pendingAction === `create-${sheetGame}` ? "Creating…" : "Create game"}
                </button>
                <button className="m-link m-create-link" type="button" onClick={() => setBrowsing(true)}>
                  {publicCount(home, sheetGame) > 0
                    ? `${publicCount(home, sheetGame)} public game${publicCount(home, sheetGame) === 1 ? "" : "s"} to join`
                    : "Browse public games"}
                  <FiChevronRight size={14} aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </BottomSheet>
      )}

      {home.showInSessionModal && home.pendingJoinTarget && (
        <InSessionModal
          gameType={home.pendingJoinTarget.gameType}
          busy={home.joiningFromOtherGame}
          onCancel={() => {
            home.setShowInSessionModal(false);
            home.setPendingJoinTarget(null);
            home.setPendingAction(null);
          }}
          onConfirm={home.confirmLeaveAndJoin}
        />
      )}
    </div>
  );
}

function recentLink(game: RecentGame) {
  if (game.gameType === "imposter") return `/imposter/${game.id}`;
  if (game.gameType === "password") return `/password/${game.id}/begin`;
  if (game.gameType === "shade_signal") return `/shade/${game.id}`;
  if (game.gameType === "location_signal") return `/location/${game.id}`;
  return `/chain/${game.id}`;
}

function RecentRow({ game, onRemove }: { game: RecentGame; onRemove: () => void }) {
  const slug = multiplayerTypeToGameSlug(game.gameType);

  return (
    <li className="m-row-wrap">
      <Link className="m-row" to={recentLink(game)} style={accentStyle(slug)}>
        <span className="m-row-icon"><GameIcon game={slug} size={18} /></span>
        <span className="m-row-text">
          <span className="m-row-title">{GAME_META[slug].title}</span>
          <span className="m-row-meta m-row-code">{game.code}</span>
        </span>
      </Link>
      <button className="m-row-action" type="button" aria-label={`Remove ${game.code} from recent`} onClick={onRemove}>
        <FiX size={16} />
      </button>
    </li>
  );
}
