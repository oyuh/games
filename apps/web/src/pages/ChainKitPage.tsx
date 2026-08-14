import { useState } from "react";
import { FiBookOpen, FiGlobe, FiLock, FiPlay } from "react-icons/fi";
import { GameShellHeader, ShellPill } from "../components/shared/GameShellHeader";
import { GameButton } from "../components/shared/GameKit";
import {
  ChainLobby,
  chainPhases,
  chainStartBlock,
  type ChainPlayer,
} from "../components/chain/ChainLobby";
import "../styles/game-shared.css";

/**
 * Every part of Chain Reaction, on one page, driven by fake data. Same idea as
 * /dev/password: get a state right here before it goes onto the real page,
 * where half of them need two browser tabs and somebody willing to lose.
 *
 * Lobby first. The other phases land under it as they get built.
 */

const CAST: ChainPlayer[] = [
  { sessionId: "seed-ada", name: "Ada", connected: true },
  { sessionId: "seed-bram", name: "Bram", connected: true },
];

const HOST = "seed-ada";

const SETTINGS = { chainLength: 5, rounds: 3, turnTimeSec: null, chainMode: "premade" as const, category: "animals" };

/* Every callback is a no-op. Nothing on this page talks to zero on purpose:
   the point is the look, and a dev page that can start a game is a dev page
   that needs a game. */
const NOOP = () => {};

const LOBBY = {
  hostId: HOST,
  settings: SETTINGS,
  onStart: NOOP,
  onLeave: NOOP,
  onJoin: NOOP,
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

/**
 * The lobby the way a player meets it, with the seat actually filling. Taking
 * the seat writes to the same local state the join mutator would write to, so
 * what you press here is what the real one has to do.
 */
function Live() {
  const [players, setPlayers] = useState<ChainPlayer[]>([CAST[0]!]);
  const [isHost, setIsHost] = useState(true);
  const [isSpectator, setIsSpectator] = useState(false);
  const [custom, setCustom] = useState(false);
  const [timed, setTimed] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [starting, setStarting] = useState(false);

  /* Whoever you are, you are the challenger when you are not hosting, so the
     "you" ring and the host crown land on different cards. */
  const me = isHost ? HOST : "seed-bram";
  const inGame = players.some((p) => p.sessionId === me);

  const settings = {
    ...SETTINGS,
    chainMode: custom ? ("custom" as const) : ("premade" as const),
    turnTimeSec: timed ? 90 : null,
  };

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.75rem" }}>
        <button
          type="button"
          className={`btn ${players.length === 2 ? "btn-primary" : "btn-ghost"}`}
          style={toggle}
          onClick={() => setPlayers((now) => (now.length === 2 ? [CAST[0]!] : CAST))}
        >
          Both seats
        </button>

        <span style={{ width: "1px", background: "var(--border)", margin: "0 0.3rem" }} />

        <button type="button" className={`btn ${isHost ? "btn-primary" : "btn-ghost"}`} style={toggle} onClick={() => setIsHost((v) => !v)}>Host</button>
        <button type="button" className={`btn ${isSpectator ? "btn-primary" : "btn-ghost"}`} style={toggle} onClick={() => setIsSpectator((v) => !v)}>Spectating</button>
        <button type="button" className={`btn ${custom ? "btn-primary" : "btn-ghost"}`} style={toggle} onClick={() => setCustom((v) => !v)}>Custom chains</button>
        <button type="button" className={`btn ${timed ? "btn-primary" : "btn-ghost"}`} style={toggle} onClick={() => setTimed((v) => !v)}>Timed</button>
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
        game="chain"
        title="Chain Reaction"
        phases={chainPhases(settings.chainMode)}
        phase="lobby"
        code="Q4LM8"
        isHost={isHost}
        isSpectator={isSpectator}
        pills={<ShellPill icon={<FiBookOpen />} tooltip="Which word bank the chains come from">Animals</ShellPill>}
      />

      <ChainLobby
        {...LOBBY}
        players={players}
        sessionId={me}
        settings={settings}
        isHost={isHost}
        inGame={inGame}
        isSpectator={isSpectator}
        starting={starting}
        onJoin={() => setPlayers(CAST)}
        onKick={(id) => setPlayers((now) => now.filter((p) => p.sessionId !== id))}
        actions={
          isHost ? (
            /* Stands in for LobbyVisibilityToggle, which needs zero. Same words
               as the real one: it is a switch, so it says what pressing it does
               rather than naming the state you are already in. */
            <GameButton
              variant="secondary"
              icon={isPublic ? <FiGlobe /> : <FiLock />}
              onClick={() => setIsPublic((v) => !v)}
            >
              {isPublic ? "Make it private" : "Make it public"}
            </GameButton>
          ) : undefined
        }
      />
    </>
  );
}

export function ChainKitPage() {
  return (
    <main
      className="game-page"
      data-game-theme="chain"
      style={{ display: "flex", flexDirection: "column", gap: "1.5rem", padding: "2rem 1rem", margin: "0 auto", maxWidth: "56rem" }}
    >
      <header>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, letterSpacing: "0.04em" }}>Chain Reaction</h1>
        <p className="game-section-subtle">Every part of the game, in every state, out of the shared kit.</p>
      </header>

      <Section title="Live" note="drive the lobby the way a player would meet it. press the empty seat to take it">
        <Live />
      </Section>

      <Section title="Waiting on somebody" note="one player and an empty seat. the duel keeps its shape, so it is obvious what is missing rather than what is broken">
        <ChainLobby {...LOBBY} players={[CAST[0]!]} sessionId={HOST} isHost inGame />
      </Section>

      <Section title="Ready" note="two of them, and the only thing left is the host pressing go">
        <ChainLobby {...LOBBY} players={CAST} sessionId={HOST} isHost inGame onKick={NOOP} />
      </Section>

      <Section title="Custom chains" note="the mode that changes what the game is, so it is the fact that gets the colour. the start button says what it actually does">
        <ChainLobby
          {...LOBBY}
          players={CAST}
          sessionId={HOST}
          settings={{ ...SETTINGS, chainMode: "custom", chainLength: 7, rounds: 1, turnTimeSec: 120 }}
          isHost
          inGame
          onKick={NOOP}
        />
      </Section>

      <Section title="Not the host" note="no start button, and no disabled one either. one line and the way out">
        <ChainLobby {...LOBBY} players={CAST} sessionId="seed-bram" isHost={false} inGame />
      </Section>

      <Section title="Not in it" note="someone who followed a link to a free seat, someone who found it full, and someone already watching">
        <ChainLobby {...LOBBY} players={[CAST[0]!]} sessionId="seed-zed" isHost={false} inGame={false} />
        <ChainLobby {...LOBBY} players={CAST} sessionId="seed-zed" isHost={false} inGame={false} />
        <ChainLobby {...LOBBY} players={CAST} sessionId="seed-zed" isHost={false} inGame={false} isSpectator />
      </Section>

      <Section title="Somebody dropped" note="the seat is still theirs, so it says so rather than going empty">
        <ChainLobby
          {...LOBBY}
          players={[CAST[0]!, { ...CAST[1]!, connected: false }]}
          sessionId={HOST}
          isHost
          inGame
          onKick={NOOP}
        />
      </Section>

      <Section title="What the hint says" note="the start rule in the server's own words, so the lobby never promises a start that bounces">
        <ul className="game-section-subtle" style={{ display: "grid", gap: "0.3rem", paddingLeft: "1rem" }}>
          {[[], [CAST[0]!], CAST].map((players, i) => (
            <li key={i}>{chainStartBlock(players) ?? "Nothing in the way, the button is live."}</li>
          ))}
        </ul>
      </Section>
    </main>
  );
}
