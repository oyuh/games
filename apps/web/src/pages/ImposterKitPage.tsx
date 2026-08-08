import { useEffect, useRef, useState } from "react";
import { FiBookOpen, FiClock, FiEye, FiFlag, FiGlobe, FiLock, FiPlay, FiRefreshCw, FiZap } from "react-icons/fi";
import { GameShellHeader, ShellPill } from "../components/shared/GameShellHeader";
import { GameActions, GameButton, GameFacts } from "../components/shared/GameKit";
import { IMPOSTER_PHASES, ImposterLobby, MIN_IMPOSTER_PLAYERS, type ImposterPlayer } from "../components/imposter/ImposterLobby";
import { ImposterCluePhase, ImposterClueWall, ImposterComposer, ImposterWordCard } from "../components/imposter/ImposterClues";
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

/* Who writes what, and in what order. Real games do not arrive all at once
   and neither does this, because the whole point of the wall is watching it
   fill in. */
const SCRIPT: Array<{ typing?: string; clue?: [string, string] }> = [
  { typing: "seed-bram" },
  { typing: "seed-dov" },
  { clue: ["seed-bram", "cold ending"] },
  { typing: "seed-cleo" },
  { clue: ["seed-dov", "three hours long"] },
  { clue: ["seed-cleo", "the boat one"] },
];

const CLUE_CAST = CAST.slice(0, 4);

/** The clue phase running on its own, so the live parts actually move. */
function LiveClues() {
  const [step, setStep] = useState(0);
  const [isImposter, setIsImposter] = useState(false);
  const [clue, setClue] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const timer = useRef<number>(0);

  useEffect(() => {
    if (step >= SCRIPT.length) return;
    timer.current = window.setTimeout(() => setStep((n) => n + 1), 1800);
    return () => window.clearTimeout(timer.current);
  }, [step]);

  const done = SCRIPT.slice(0, step);
  const typing = done.flatMap((e) => (e.typing ? [e.typing] : []));
  const clues = done.flatMap((e) => (e.clue ? [{ sessionId: e.clue[0], text: e.clue[1] }] : []));
  const mine = submitted ? [{ sessionId: "seed-ada", text: clue }] : [];

  const reset = () => { setStep(0); setClue(""); setSubmitted(false); };

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.75rem" }}>
        <button type="button" className={`btn ${isImposter ? "btn-primary" : "btn-ghost"}`} style={toggle} onClick={() => setIsImposter((v) => !v)}>
          You are the imposter
        </button>
        <button type="button" className="btn btn-ghost" style={toggle} onClick={reset}>
          <FiRefreshCw size={12} /> Run it again
        </button>
      </div>

      <GameShellHeader
        collapsible
        game="imposter"
        title="Imposter"
        phases={IMPOSTER_PHASES}
        phase="playing"
        round={{ current: 2, total: 5 }}
        endsAt={Date.now() + 90_000}
        duration={90}
        code="H4TQ9"
        pills={<ShellPill icon={<FiBookOpen />} tooltip="Which word bank this game is drawing from">Movies &amp; Shows</ShellPill>}
      />

      <ImposterCluePhase
        role={isImposter ? "imposter" : "player"}
        secretWord="Titanic"
        category="moviesAndShows"
        players={CLUE_CAST}
        sessionId="seed-ada"
        clues={[...mine, ...clues]}
        typing={typing}
        clueVisibility={0.65}
        clue={clue}
        submitted={submitted}
        onClueChange={setClue}
        onSubmit={(event) => { event.preventDefault(); setSubmitted(true); }}
        onTyping={NOOP}
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

      <Section title="Clues, live" note="the phase the game actually is. watch the room fill in">
        <LiveClues />
      </Section>

      <Section title="What you know" note="the one loud thing in the game. being the imposter is a different state, so it looks like one">
        <ImposterWordCard role="player" secretWord="Titanic" category="moviesAndShows" />
        <ImposterWordCard role="imposter" secretWord={null} category="moviesAndShows" />
        <ImposterWordCard role="player" secretWord="Titanic" />
      </Section>

      <Section title="The box" note="empty, mid thought, and sent. it stays on screen after, because defending it is the next thing you do">
        <ImposterComposer role="player" value="" submitted={false} onChange={NOOP} onSubmit={NOOP} />
        <ImposterComposer role="imposter" value="" submitted={false} onChange={NOOP} onSubmit={NOOP} />
        <ImposterComposer role="player" value="cold ending" submitted={false} onChange={NOOP} onSubmit={NOOP} />
        <ImposterComposer role="player" value="cold ending" submitted onChange={NOOP} onSubmit={NOOP} />
      </Section>

      <Section title="The room" note="every slot at once: nothing, started, locked, and yours">
        <ImposterClueWall
          players={CAST}
          sessionId="seed-ada"
          typing={["seed-esme"]}
          clues={[
            { sessionId: "seed-ada", text: "cold ending" },
            { sessionId: "seed-bram", text: "the boat one" },
            { sessionId: "seed-cleo", text: "three hours long" },
          ]}
        />
      </Section>

      <Section title="The peek" note="what the imposter buys with the clue peek setting. same wall, more of it legible">
        <ImposterClueWall
          isImposter
          clueVisibility={0.65}
          players={CLUE_CAST}
          sessionId="seed-ada"
          clues={[
            { sessionId: "seed-bram", text: "the boat one" },
            { sessionId: "seed-cleo", text: "three hours long" },
          ]}
        />
        <ImposterClueWall
          isImposter
          clueVisibility={0.25}
          players={CLUE_CAST}
          sessionId="seed-ada"
          clues={[
            { sessionId: "seed-bram", text: "the boat one" },
            { sessionId: "seed-cleo", text: "three hours long" },
          ]}
        />
        <ImposterClueWall
          isImposter
          clueVisibility={0}
          players={CLUE_CAST}
          sessionId="seed-ada"
          clues={[
            { sessionId: "seed-bram", text: "the boat one" },
            { sessionId: "seed-cleo", text: "three hours long" },
          ]}
        />
      </Section>

      <Section title="Watching" note="a spectator or someone already out gets the room and nothing to write with">
        <ImposterCluePhase
          canWrite={false}
          role={undefined}
          secretWord={null}
          players={CLUE_CAST}
          sessionId="seed-zed"
          clues={[{ sessionId: "seed-bram", text: "the boat one" }]}
          typing={["seed-cleo"]}
          clue=""
          submitted={false}
          onClueChange={NOOP}
          onSubmit={NOOP}
        />
      </Section>

      <Section title="Setup" note="the settings on their own. same facts the home card summarised before anyone joined">
        <GameFacts
          label="Setup"
          facts={[
            { value: "Movies & Shows", icon: <FiBookOpen />, tone: "var(--game-accent)", tooltip: "Where the secret word gets picked from" },
            { value: 5, label: "rounds", icon: <FiFlag /> },
            { value: 2, label: "imposters", icon: <FiZap /> },
            { value: "None", label: "peek", icon: <FiEye />, tooltip: "The imposter reads nothing before writing" },
            { value: "90s", label: "to write", icon: <FiClock /> },
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
