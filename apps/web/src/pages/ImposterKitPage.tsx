import { useState } from "react";
import { FiBookOpen, FiClock, FiEye, FiFlag, FiGlobe, FiLock, FiPlay, FiZap } from "react-icons/fi";
import { GameShellHeader, ShellPill } from "../components/shared/GameShellHeader";
import { GameActions, GameButton, GameFacts } from "../components/shared/GameKit";
import { IMPOSTER_PHASES, ImposterLobby, MIN_IMPOSTER_PLAYERS, type ImposterPlayer } from "../components/imposter/ImposterLobby";
import "../styles/game-shared.css";

/**
 * Every piece of Imposter, on one page, driven by fake data. Same idea as
 * /dev/game-shell and /dev/player-cards: get a state right here before it goes
 * onto the real page, where half of them need three browser tabs to reach.
 *
 * Lobby first. The other phases land under it as they get built.
 */

const CAST: ImposterPlayer[] = [
  { sessionId: "seed-ada", name: "Ada", connected: true },
  { sessionId: "seed-bram", name: "Bram", connected: true },
  { sessionId: "seed-cleo", name: "Cleo", connected: true },
  { sessionId: "seed-dov", name: "Dov", connected: true },
  { sessionId: "seed-esme", name: "Esme", connected: false },
  { sessionId: "seed-finn", name: "Finn", connected: true },
];

const HOST = "seed-ada";

const SETTINGS = { rounds: 5, imposters: 1, roundDurationSec: 90, clueVisibility: 0.65 };

/* Every callback is a no-op. Nothing on this page talks to zero on purpose:
   the point is the look, and a dev page that can start a game is a dev page
   that needs a game. */
const NOOP = () => {};

const LOBBY = {
  hostId: HOST,
  settings: SETTINGS,
  category: "moviesAndShows",
  onStart: NOOP,
  onLeave: NOOP,
  onJoin: NOOP,
  onKick: NOOP,
};

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="game-section">
      <h3 className="game-section-label">{title}</h3>
      {note && <p className="game-section-subtle">{note}</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>{children}</div>
    </section>
  );
}

const toggle = {
  fontSize: "0.72rem",
  padding: "0.3rem 0.6rem",
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
} as const;

/** The lobby the way a player meets it: header on top, everything under it. */
function Live() {
  const [count, setCount] = useState(4);
  const [isHost, setIsHost] = useState(true);
  const [inGame, setInGame] = useState(true);
  const [isSpectator, setIsSpectator] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [starting, setStarting] = useState(false);

  const players = CAST.slice(0, count);
  /* Whoever you are, you are the second seat, so the "you" ring and the host
     star land on different cards and both stay visible. */
  const me = isHost ? HOST : "seed-bram";

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.75rem" }}>
        <button type="button" className="btn btn-ghost" style={toggle} onClick={() => setCount((n) => Math.max(0, n - 1))}>−</button>
        <span className="gk-actions-note" style={{ alignSelf: "center", minWidth: "5.5rem", textAlign: "center" }}>
          {count} player{count === 1 ? "" : "s"}
        </span>
        <button type="button" className="btn btn-ghost" style={toggle} onClick={() => setCount((n) => Math.min(CAST.length, n + 1))}>+</button>

        <span style={{ width: "1px", background: "var(--border)", margin: "0 0.3rem" }} />

        <button type="button" className={`btn ${isHost ? "btn-primary" : "btn-ghost"}`} style={toggle} onClick={() => setIsHost((v) => !v)}>Host</button>
        <button type="button" className={`btn ${inGame ? "btn-primary" : "btn-ghost"}`} style={toggle} onClick={() => setInGame((v) => !v)}>Joined</button>
        <button type="button" className={`btn ${isSpectator ? "btn-primary" : "btn-ghost"}`} style={toggle} onClick={() => setIsSpectator((v) => !v)}>Spectating</button>
        <button
          type="button"
          className="btn btn-ghost"
          style={toggle}
          onClick={() => { setStarting(true); setTimeout(() => setStarting(false), 1600); }}
        >
          <FiPlay size={12} /> Starting
        </button>
      </div>

      <GameShellHeader
        collapsible
        game="imposter"
        title="Imposter"
        phases={IMPOSTER_PHASES}
        phase="lobby"
        code="H4TQ9"
        isHost={isHost}
        isSpectator={isSpectator}
        pills={<ShellPill icon={<FiBookOpen />} tooltip="Which word bank this game is drawing from">Movies &amp; Shows</ShellPill>}
      />

      <ImposterLobby
        {...LOBBY}
        players={players}
        sessionId={me}
        isHost={isHost}
        inGame={inGame}
        isSpectator={isSpectator}
        starting={starting}
        actions={
          isHost ? (
            /* Stands in for LobbyVisibilityToggle, which needs zero. */
            <GameButton
              variant="secondary"
              icon={isPublic ? <FiGlobe /> : <FiLock />}
              onClick={() => setIsPublic((v) => !v)}
            >
              {isPublic ? "Public" : "Private"}
            </GameButton>
          ) : undefined
        }
      />
    </>
  );
}

export function ImposterKitPage() {
  return (
    <main
      className="game-page"
      data-game-theme="imposter"
      style={{ display: "flex", flexDirection: "column", gap: "1.5rem", padding: "2rem 1rem", margin: "0 auto", maxWidth: "56rem" }}
    >
      <header>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, letterSpacing: "0.04em" }}>Imposter</h1>
        <p className="game-section-subtle">Every part of the game, in every state, out of the shared kit.</p>
      </header>

      <Section title="Live" note="drive the lobby the way a player would meet it">
        <Live />
      </Section>

      <Section title="Waiting on people" note={`under ${MIN_IMPOSTER_PLAYERS}, the host gets told what is missing rather than a dead button`}>
        <ImposterLobby {...LOBBY} players={[]} sessionId={HOST} isHost inGame />
        <ImposterLobby {...LOBBY} players={CAST.slice(0, 2)} sessionId={HOST} isHost inGame />
      </Section>

      <Section title="Ready" note="three plays, four plays better, and the lobby says so without nagging">
        <ImposterLobby {...LOBBY} players={CAST.slice(0, 3)} sessionId={HOST} isHost inGame />
        <ImposterLobby {...LOBBY} players={CAST} sessionId={HOST} isHost inGame />
      </Section>

      <Section title="Not the host" note="no start button, and no disabled one either. one line and the way out">
        <ImposterLobby {...LOBBY} players={CAST} sessionId="seed-cleo" isHost={false} inGame />
      </Section>

      <Section title="Not in it yet" note="someone who followed a link, and someone already watching">
        <ImposterLobby {...LOBBY} players={CAST.slice(0, 4)} sessionId="seed-zed" isHost={false} inGame={false} />
        <ImposterLobby {...LOBBY} players={CAST.slice(0, 4)} sessionId="seed-zed" isHost={false} inGame={false} isSpectator />
      </Section>

      <Section title="Setup" note="the settings on their own. same facts the home card summarised before anyone joined">
        <GameFacts
          label="Setup"
          facts={[
            { label: "Word bank", value: "Movies & Shows", icon: <FiBookOpen />, accent: "var(--game-accent)", tooltip: "Where the secret word gets picked from" },
            { label: "Rounds", value: 5, icon: <FiFlag /> },
            { label: "Imposters", value: 2, icon: <FiZap /> },
            { label: "Clue peek", value: "None", icon: <FiEye />, tooltip: "The imposter reads nothing before writing" },
            { label: "Clue time", value: "90s", icon: <FiClock /> },
          ]}
        />
      </Section>

      <Section title="Actions" note="the row a phase ends on. the hint sits above so it is not arguing with the button">
        <GameActions hint="3 players to start, 1 more to go.">
          <GameButton variant="secondary" icon={<FiLock />}>Private</GameButton>
          <GameButton variant="primary" icon={<FiPlay />} disabled>Start the round</GameButton>
          <GameButton variant="ghost">Leave</GameButton>
        </GameActions>

        <GameActions>
          <span className="gk-actions-note">Waiting for the host to start…</span>
          <GameButton variant="ghost">Leave</GameButton>
        </GameActions>
      </Section>
    </main>
  );
}
