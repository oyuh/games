import { useState, type ReactNode } from "react";
import { FiGlobe, FiLock, FiPlay } from "react-icons/fi";
import { GameShellHeader } from "../components/shared/GameShellHeader";
import { GameButton } from "../components/shared/GameKit";
import {
  MIN_SHADE_PLAYERS,
  ShadeExplorer,
  ShadeLobby,
  shadePhases,
  shadeStartBlock,
  type ShadePlayer,
} from "../components/shade/ShadeLobby";
import { SHADE_BANDS, ShadeGrid, shadeDistLabel } from "../components/shade/ShadeGrid";
import "../styles/game-shared.css";

/**
 * Every part of Shade Signal, on one page, driven by fake data. Same idea as
 * /dev/imposter and /dev/chain: get a state right before it goes onto the real
 * page, where reaching the lobby with a full room means three browser tabs and
 * reaching a reveal means playing a round to get there.
 */

const CAST: ShadePlayer[] = [
  { sessionId: "seed-ada", name: "Ada", connected: true },
  { sessionId: "seed-bram", name: "Bram", connected: true },
  { sessionId: "seed-cleo", name: "Cleo", connected: true },
  { sessionId: "seed-dov", name: "Dov", connected: true },
];

const HOST = "seed-ada";

/* The defaults the create mutator hands out, so what this page shows is what a
   fresh room actually looks like. */
const SETTINGS = { hardMode: false, clueDurationSec: 45, guessDurationSec: 30, roundsPerPlayer: 1, leaderPick: false };

/* A fixed seed, so the board looks the same every time this page is opened and
   a change to the colour maths is visible rather than lost in the shuffle. */
const GRID = { rows: 10, cols: 12, seed: 4213 };

const NAMES: Record<string, string> = { "seed-ada": "Ada", "seed-bram": "Bram", "seed-cleo": "Cleo", "seed-dov": "Dov" };

/* Every callback is a no-op. Nothing on this page talks to zero on purpose:
   the point is the look, and a dev page that can start a game is a dev page
   that needs a game. */
const NOOP = () => {};

const LOBBY = {
  hostId: HOST,
  settings: SETTINGS,
  grid: GRID,
  sessionById: NAMES,
  onStart: NOOP,
  onLeave: NOOP,
  onJoin: NOOP,
};

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
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
 * The lobby the way a player meets it, with the room actually filling up. The
 * start hint is the interesting one to drive: it is the only thing standing
 * between a host and a mutator that would have thrown the press back.
 */
function Live() {
  const [count, setCount] = useState(1);
  const [isHost, setIsHost] = useState(true);
  const [isSpectator, setIsSpectator] = useState(false);
  const [hardMode, setHardMode] = useState(false);
  const [leaderPick, setLeaderPick] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [starting, setStarting] = useState(false);

  /* Whoever you are, you are somebody else when you are not hosting, so the
     "you" ring and the host crown land on different cards. */
  const me = isHost ? HOST : "seed-cleo";
  const players = CAST.slice(0, count);
  const inGame = players.some((p) => p.sessionId === me);
  const settings = { ...SETTINGS, hardMode, leaderPick };

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.75rem" }}>
        {[1, 2, 3, 4].map((n) => (
          <button
            key={n}
            type="button"
            className={`btn ${count === n ? "btn-primary" : "btn-ghost"}`}
            style={toggle}
            onClick={() => setCount(n)}
          >
            {n} {n === 1 ? "player" : "players"}
          </button>
        ))}

        <span style={{ width: "1px", background: "var(--border)", margin: "0 0.3rem" }} />

        <button type="button" className={`btn ${isHost ? "btn-primary" : "btn-ghost"}`} style={toggle} onClick={() => setIsHost((v) => !v)}>Host</button>
        <button type="button" className={`btn ${isSpectator ? "btn-primary" : "btn-ghost"}`} style={toggle} onClick={() => setIsSpectator((v) => !v)}>Spectating</button>
        <button type="button" className={`btn ${hardMode ? "btn-primary" : "btn-ghost"}`} style={toggle} onClick={() => setHardMode((v) => !v)}>Hard mode</button>
        <button type="button" className={`btn ${leaderPick ? "btn-primary" : "btn-ghost"}`} style={toggle} onClick={() => setLeaderPick((v) => !v)}>Leader picks</button>
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
        game="shade"
        title="Shade Signal"
        phases={shadePhases(leaderPick)}
        phase="lobby"
        code="V7KP2"
        isHost={isHost}
        isSpectator={isSpectator}
      />

      <ShadeLobby
        {...LOBBY}
        players={players}
        sessionId={me}
        settings={settings}
        isHost={isHost}
        inGame={inGame}
        isSpectator={isSpectator}
        starting={starting}
        onJoin={() => setCount((n) => Math.max(n, 3))}
        onKick={(id) => setCount(() => CAST.filter((p) => p.sessionId !== id).length)}
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

const TARGET = { row: 4, col: 7 };

/* Four guesses that land in four different bands, so the reveal below shows
   the whole ladder rather than three people who all did about as well. */
const GUESSES = [
  { sessionId: "seed-bram", name: "Bram", row: 4, col: 7, note: "Clue 2, spot on, +5" },
  { sessionId: "seed-cleo", name: "Cleo", row: 5, col: 8, note: "Clue 2, 1 away, +3" },
  { sessionId: "seed-dov", name: "Dov", row: 2, col: 5, note: "Clue 2, 2 away, +2", you: true },
  { sessionId: "seed-eve", name: "Eve", row: 8, col: 1, note: "Clue 2, 4 away, nothing" },
];

export function ShadeKitPage() {
  return (
    <main
      className="game-page"
      data-game-theme="shade"
      style={{ display: "flex", flexDirection: "column", gap: "1.5rem", padding: "2rem 1rem", margin: "0 auto", maxWidth: "56rem" }}
    >
      <header>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, letterSpacing: "0.04em" }}>Shade Signal</h1>
        <p className="game-section-subtle">Every part of the game, in every state, out of the shared kit.</p>
      </header>

      <Section title="Live" note="drive the lobby the way a player would meet it. the room fills, the round count follows it, and the start hint says what the mutator would have said">
        <Live />
      </Section>

      <Section title="Waiting on somebody" note="two of the three. the board is already there to be poked at, which is the point of putting it in the lobby">
        <ShadeLobby {...LOBBY} players={CAST.slice(0, 2)} sessionId={HOST} isHost inGame />
      </Section>

      <Section title="Ready" note="three of them, and the only thing left is the host pressing go">
        <ShadeLobby {...LOBBY} players={CAST.slice(0, 3)} sessionId={HOST} isHost inGame onKick={NOOP} />
      </Section>

      <Section title="Hard mode, and the leader picking" note="the two settings that change the game rather than its length. no colour names is the one that gets the accent, because it is the one you have to play around">
        <ShadeLobby
          {...LOBBY}
          players={CAST}
          sessionId={HOST}
          settings={{ ...SETTINGS, hardMode: true, leaderPick: true, roundsPerPlayer: 2, clueDurationSec: 60, guessDurationSec: 20 }}
          isHost
          inGame
          onKick={NOOP}
        />
      </Section>

      <Section title="Not the host" note="no start button, and no disabled one either. one line and the way out">
        <ShadeLobby {...LOBBY} players={CAST.slice(0, 3)} sessionId="seed-cleo" isHost={false} inGame />
      </Section>

      <Section title="Not in it" note="somebody who followed a link, and somebody already watching">
        <ShadeLobby {...LOBBY} players={CAST.slice(0, 3)} sessionId="seed-zed" isHost={false} inGame={false} />
        <ShadeLobby {...LOBBY} players={CAST.slice(0, 3)} sessionId="seed-zed" isHost={false} inGame={false} isSpectator />
      </Section>

      <Section title="Somebody dropped" note="they keep their place in the order, so the card says so rather than going missing">
        <ShadeLobby
          {...LOBBY}
          players={[CAST[0]!, CAST[1]!, { ...CAST[2]!, connected: false }]}
          sessionId={HOST}
          isHost
          inGame
          onKick={NOOP}
        />
      </Section>

      <Section title="The board on its own" note="press a cell. this is the same component every phase uses, so what the lobby lets you play with is the thing you will be scored on">
        <ShadeExplorer {...GRID} />
      </Section>

      <Section title="What the board says in each phase" note="nothing, your pick, the bands, and everybody at the end. one mark colour throughout, because the hundred and twenty under it are the puzzle">
        <ShadeGrid {...GRID} />
        <ShadeGrid {...GRID} selected={{ row: 6, col: 3 }} onSelect={NOOP} />
        <ShadeGrid {...GRID} target={TARGET} zones scores />
        <ShadeGrid {...GRID} target={TARGET} zones markers={GUESSES} />
      </Section>

      <Section title="Two people on one cell" note="the thing worth seeing is that they agreed, so the faces stack rather than one of them winning the square">
        <ShadeGrid
          {...GRID}
          size="sm"
          target={TARGET}
          zones
          markers={[
            { sessionId: "seed-bram", name: "Bram", row: 3, col: 6, note: "Clue 1" },
            { sessionId: "seed-cleo", name: "Cleo", row: 3, col: 6, note: "Clue 1" },
            { sessionId: "seed-dov", name: "Dov", row: 3, col: 6, note: "Clue 1", you: true },
          ]}
        />
      </Section>

      <Section title="What the hint says" note="the start rule in the mutator's own words, so the lobby never promises a start that bounces">
        <ul className="game-section-subtle" style={{ display: "grid", gap: "0.3rem", paddingLeft: "1rem" }}>
          {[0, 1, 2, 3].map((n) => (
            <li key={n}>{shadeStartBlock(CAST.slice(0, n)) ?? `Nothing in the way, the button is live. (${MIN_SHADE_PLAYERS} is the floor.)`}</li>
          ))}
        </ul>
      </Section>

      <Section title="The ladder" note="one place says what a guess pays, and the rings, the pills and the tooltips all read it">
        <ul className="game-section-subtle" style={{ display: "grid", gap: "0.3rem", paddingLeft: "1rem" }}>
          {SHADE_BANDS.map((band) => (
            <li key={band.dist}>{shadeDistLabel(band.dist)} is {band.points} point{band.points === 1 ? "" : "s"}</li>
          ))}
          <li>Anything further out is nothing.</li>
        </ul>
      </Section>
    </main>
  );
}
