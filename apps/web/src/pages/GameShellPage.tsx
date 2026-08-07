import { useState } from "react";
import { FiAward, FiEdit3, FiEye, FiMapPin, FiMessageSquare, FiRefreshCw, FiTag, FiUsers } from "react-icons/fi";
import { GAME_META, type GameSlug } from "@games/shared";
import { GameShellHeader, ShellPill, type GamePhase } from "../components/shared/GameShellHeader";
import "../styles/game-shared.css";

/**
 * Every state the shell header can be in, on one page. This is the place to
 * eyeball a change before it lands on top of five games at once.
 */

/* The icons stand in for what will live in each game's metadata later. */
const IMPOSTER_PHASES: GamePhase[] = [
  { id: "lobby", label: "Lobby", icon: <FiUsers />, hint: "Waiting for everyone to join. The host starts the round." },
  { id: "clues", label: "Clues", icon: <FiEdit3 />, hint: "Everyone writes one clue about the secret word." },
  { id: "voting", label: "Voting", icon: <FiEye />, hint: "Pick the player you think never saw the word." },
  { id: "results", label: "Results", icon: <FiAward />, hint: "See who the imposter was and who caught them." },
];

const SIGNAL_PHASES: GamePhase[] = [
  { id: "picking", label: "Picking", icon: <FiMapPin />, hint: "The leader is choosing a spot on the map." },
  { id: "clue", label: "Clue", icon: <FiMessageSquare />, hint: "The leader is writing a one word clue." },
  { id: "guess", label: "Guessing", icon: <FiMapPin />, hint: "Everyone else drops a pin where they think it is." },
  { id: "reveal", label: "Reveal", icon: <FiAward />, hint: "Scores for how close each guess landed." },
];

/** Every game wearing its own accent, straight from its metadata. */
const EVERY_GAME: GameSlug[] = ["imposter", "password", "chain", "shade", "location"];

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="game-section">
      <h3 className="game-section-label">{title}</h3>
      {note && <p className="game-section-subtle">{note}</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>{children}</div>
    </section>
  );
}

/** Drive the header the way a game would, so the track and the clock move. */
function Live() {
  const [index, setIndex] = useState(1);
  const [isHost, setIsHost] = useState(true);
  const [isSpectator, setIsSpectator] = useState(false);
  const [endsAt, setEndsAt] = useState(() => Date.now() + 90_000);

  const btn = {
    fontSize: "0.72rem",
    padding: "0.3rem 0.6rem",
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
  } as const;

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.75rem" }}>
        {IMPOSTER_PHASES.map((p, i) => (
          <button key={p.id} type="button" className={`btn ${i === index ? "btn-primary" : "btn-ghost"}`} style={btn} onClick={() => setIndex(i)}>
            {p.label}
          </button>
        ))}
        <span style={{ width: "1px", background: "var(--border)", margin: "0 0.3rem" }} />
        <button type="button" className={`btn ${isHost ? "btn-primary" : "btn-ghost"}`} style={btn} onClick={() => setIsHost((v) => !v)}>Host</button>
        <button type="button" className={`btn ${isSpectator ? "btn-primary" : "btn-ghost"}`} style={btn} onClick={() => setIsSpectator((v) => !v)}>Spectator</button>
        <button type="button" className="btn btn-ghost" style={btn} onClick={() => setEndsAt(Date.now() + 90_000)}><FiRefreshCw size={12} /> Restart clock</button>
        <button type="button" className="btn btn-ghost" style={btn} onClick={() => setEndsAt(Date.now() + 8_000)}>Nearly out</button>
      </div>

      <GameShellHeader
        collapsible
        game="imposter"
        title="Imposter"
        phases={IMPOSTER_PHASES}
        phase={IMPOSTER_PHASES[index]!.id}
        round={{ current: 2, total: 5 }}
        endsAt={endsAt}
        duration={90}
        code="H4TQ9"
        isHost={isHost}
        isSpectator={isSpectator}
        pills={<ShellPill icon={<FiTag />} tooltip="Which word bank this game is drawing from">Films</ShellPill>}
      />
    </>
  );
}

export function GameShellPage() {
  return (
    <main className="game-page" data-game-theme="imposter" style={{ display: "flex", flexDirection: "column", gap: "1.5rem", padding: "2rem 1rem", margin: "0 auto", maxWidth: "56rem" }}>
      <header>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, letterSpacing: "0.04em" }}>Game shell</h1>
        <p className="game-section-subtle">The header every multiplayer game wears. Phase, clock, role, code.</p>
      </header>

      <Section title="Live" note="drive it the way a game would">
        <Live />
      </Section>

      <Section title="Folded" note="the container goes, the line moves up to separate the rows, and the pills drop under it beside the clock">
        <GameShellHeader
          collapsible
          defaultCollapsed
          game="imposter"
          title="Imposter"
          phases={IMPOSTER_PHASES}
          phase="voting"
          round={{ current: 2, total: 5 }}
          endsAt={Date.now() + 40_000}
          duration={90}
          code="H4TQ9"
          isHost
          pills={<ShellPill icon={<FiTag />} tooltip="Word bank">Films</ShellPill>}
        />
        <GameShellHeader
          collapsible
          game="location"
          title="Location Signal"
          phases={SIGNAL_PHASES}
          phase="guess"
          round={{ current: 3, total: 4 }}
          endsAt={Date.now() + 70_000}
          duration={120}
          code="PL4NE"
          isSpectator
          pills={<ShellPill icon={<FiUsers />} tone="#34d399" tooltip="Whose turn">Blue Team</ShellPill>}
        />
      </Section>

      <Section title="Every game" note="each one wears its own accent, straight out of its metadata">
        {EVERY_GAME.map((slug) => (
          <GameShellHeader
            key={slug}
            game={slug}
            title={GAME_META[slug].title}
            phases={SIGNAL_PHASES}
            phase="clue"
            round={{ current: 2, total: 4 }}
            endsAt={Date.now() + 52_000}
            duration={90}
            code="H4TQ9"
            isHost
            pills={<ShellPill tone={GAME_META[slug].accent} tooltip="This game's accent">{GAME_META[slug].accent}</ShellPill>}
          />
        ))}
      </Section>

      <Section title="Every phase" note="named, counted and iconned. the number carries the progress, so no second track">
        {IMPOSTER_PHASES.map((p, i) => (
          <GameShellHeader
            key={p.id}
            game="imposter"
            title="Imposter"
            phases={IMPOSTER_PHASES}
            phase={p.id}
            {...(i > 0 ? { round: { current: 2, total: 5 } } : {})}
            {...(i > 0 ? { endsAt: Date.now() + 45_000, duration: 90 } : {})}
            code="H4TQ9"
            isHost={i === 0}
          />
        ))}
      </Section>

      <Section title="Clock" note="its own reading rather than a pill, and it drains">
        <GameShellHeader game="location" title="Location Signal" phases={SIGNAL_PHASES} phase="guess" endsAt={Date.now() + 118_000} duration={120} code="PL4NE" />
        <GameShellHeader game="location" title="Location Signal" phases={SIGNAL_PHASES} phase="guess" endsAt={Date.now() + 7_000} duration={120} code="PL4NE" />
        <GameShellHeader game="location" title="Location Signal" phases={SIGNAL_PHASES} phase="reveal" endsAt={Date.now()} duration={120} code="PL4NE" />
      </Section>

      <Section title="Roles" note="both in one case, so what you are is one object and not two loose icons">
        <GameShellHeader game="password" title="Password" phases={SIGNAL_PHASES} phase="clue" code="W0RDS" />
        <GameShellHeader game="password" title="Password" phases={SIGNAL_PHASES} phase="clue" code="W0RDS" isHost />
        <GameShellHeader game="password" title="Password" phases={SIGNAL_PHASES} phase="clue" code="W0RDS" isSpectator />
        <GameShellHeader game="password" title="Password" phases={SIGNAL_PHASES} phase="clue" code="W0RDS" isHost isSpectator />
      </Section>

      <Section title="Pills" note="anything else the game is doing. the header itself only draws the four fixed things">
        <GameShellHeader
          game="chain"
          title="Chain Reaction"
          phases={SIGNAL_PHASES}
          phase="clue"
          round={{ current: 3 }}
          endsAt={Date.now() + 30_000}
          duration={60}
          isHost
          pills={
            <>
              <ShellPill icon={<FiTag />} tone="#7ecbff" tooltip="Word bank">Animals</ShellPill>
              <ShellPill icon={<FiUsers />} tone="#34d399" tooltip="Whose turn it is">Blue Team</ShellPill>
              <ShellPill tone="#fbbf24" tooltip="Sudden death, one wrong answer ends it">Sudden death</ShellPill>
            </>
          }
        />
        <GameShellHeader game="shade" title="Shade Signal" phases={SIGNAL_PHASES} phase="picking" />
      </Section>
    </main>
  );
}
