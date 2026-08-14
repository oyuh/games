import { useState } from "react";
import { FiBookOpen, FiClock, FiFlag, FiGlobe, FiLock, FiPlay, FiRefreshCw, FiSkipForward } from "react-icons/fi";
import { GameShellHeader, ShellPill } from "../components/shared/GameShellHeader";
import { GameButton, GameFacts } from "../components/shared/GameKit";
import {
  PASSWORD_PHASES,
  PASSWORD_SKIPS,
  PasswordLobby,
  formatRoundLength,
  passwordStartBlock,
  type PasswordTeam,
} from "../components/password/PasswordLobby";
import "../styles/game-shared.css";

/**
 * Every part of Password, on one page, driven by fake data. Same idea as
 * /dev/imposter: get a state right here before it goes onto the real page,
 * where half of them need four browser tabs and two teams to reach.
 *
 * Lobby first. The other phases land under it as they get built.
 */

const CAST = [
  { sessionId: "seed-ada", name: "Ada" },
  { sessionId: "seed-bram", name: "Bram" },
  { sessionId: "seed-cleo", name: "Cleo" },
  { sessionId: "seed-dov", name: "Dov" },
  { sessionId: "seed-esme", name: "Esme" },
  { sessionId: "seed-finn", name: "Finn" },
];

const NAMES: Record<string, string> = Object.fromEntries(CAST.map((p) => [p.sessionId, p.name]));

const HOST = "seed-ada";

const SETTINGS = { targetScore: 10, roundDurationSec: 300, category: "animals" };

/** The names the create mutator hands out, so these read like a real game. */
function empty(count: number): PasswordTeam[] {
  return Array.from({ length: count }, (_, i) => ({ name: `Team ${String.fromCharCode(65 + i)}`, members: [] }));
}

/** Deals the first `players` of the cast round robin, the way people actually
 *  end up spread when everyone presses join. */
function deal(players: number, teamCount = 2): PasswordTeam[] {
  const teams = empty(teamCount);
  CAST.slice(0, players).forEach((player, i) => {
    teams[i % teamCount]!.members.push(player.sessionId);
  });
  return teams;
}

/* Every callback is a no-op. Nothing on this page talks to zero on purpose:
   the point is the look, and a dev page that can start a game is a dev page
   that needs a game. */
const NOOP = () => {};

const LOBBY = {
  hostId: HOST,
  names: NAMES,
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
 * The lobby the way a player meets it, with the teams actually moving. Joining
 * and dragging both write to the same local state a mutator would write to, so
 * what you press here is what the real one has to do.
 */
function Live() {
  const [teamCount, setTeamCount] = useState(2);
  const [count, setCount] = useState(4);
  const [teams, setTeams] = useState(() => deal(4, 2));
  const [isHost, setIsHost] = useState(true);
  const [inGame, setInGame] = useState(true);
  const [isSpectator, setIsSpectator] = useState(false);
  const [locked, setLocked] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [starting, setStarting] = useState(false);

  /* Whoever you are, you are the second seat when you are not hosting, so the
     "you" ring and the host crown land on different cards. */
  const me = isHost ? HOST : "seed-bram";

  const reset = (players: number, sides: number) => {
    setCount(players);
    setTeamCount(sides);
    setTeams(deal(players, sides));
  };

  const move = (playerId: string, teamName: string) =>
    setTeams((current) =>
      current.map((team) => ({
        ...team,
        members: team.name === teamName
          ? [...team.members.filter((id) => id !== playerId), playerId]
          : team.members.filter((id) => id !== playerId),
      })),
    );

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.75rem" }}>
        <button type="button" className="btn btn-ghost" style={toggle} onClick={() => reset(Math.max(0, count - 1), teamCount)}>−</button>
        <span className="gk-actions-note" style={{ alignSelf: "center", minWidth: "5.5rem", textAlign: "center" }}>
          {count} player{count === 1 ? "" : "s"}
        </span>
        <button type="button" className="btn btn-ghost" style={toggle} onClick={() => reset(Math.min(CAST.length, count + 1), teamCount)}>+</button>

        <span style={{ width: "1px", background: "var(--border)", margin: "0 0.3rem" }} />

        {[2, 3].map((n) => (
          <button
            key={n}
            type="button"
            className={`btn ${teamCount === n ? "btn-primary" : "btn-ghost"}`}
            style={toggle}
            onClick={() => reset(count, n)}
          >
            {n} teams
          </button>
        ))}

        <span style={{ width: "1px", background: "var(--border)", margin: "0 0.3rem" }} />

        <button type="button" className={`btn ${isHost ? "btn-primary" : "btn-ghost"}`} style={toggle} onClick={() => setIsHost((v) => !v)}>Host</button>
        <button type="button" className={`btn ${inGame ? "btn-primary" : "btn-ghost"}`} style={toggle} onClick={() => setInGame((v) => !v)}>Joined</button>
        <button type="button" className={`btn ${isSpectator ? "btn-primary" : "btn-ghost"}`} style={toggle} onClick={() => setIsSpectator((v) => !v)}>Spectating</button>
        <button type="button" className={`btn ${locked ? "btn-primary" : "btn-ghost"}`} style={toggle} onClick={() => setLocked((v) => !v)}>Locked</button>
        <button
          type="button"
          className="btn btn-ghost"
          style={toggle}
          onClick={() => { setStarting(true); setTimeout(() => setStarting(false), 1600); }}
        >
          <FiPlay size={12} /> Starting
        </button>
        <button type="button" className="btn btn-ghost" style={toggle} onClick={() => reset(count, teamCount)}>
          <FiRefreshCw size={12} /> Redeal
        </button>
      </div>

      <GameShellHeader
        collapsible
        game="password"
        title="Password"
        phases={PASSWORD_PHASES}
        phase="lobby"
        code="K2WD7"
        isHost={isHost}
        isSpectator={isSpectator}
        pills={<ShellPill icon={<FiBookOpen />} tooltip="Which word bank this game is drawing from">Animals</ShellPill>}
      />

      <PasswordLobby
        {...LOBBY}
        teams={teams}
        sessionId={me}
        settings={{ ...SETTINGS, teamsLocked: locked }}
        isHost={isHost}
        inGame={inGame}
        isSpectator={isSpectator}
        starting={starting}
        onJoinTeam={(teamName) => move(me, teamName)}
        onMovePlayer={move}
        onToggleLock={() => setLocked((v) => !v)}
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

export function PasswordKitPage() {
  return (
    <main
      className="game-page"
      data-game-theme="password"
      style={{ display: "flex", flexDirection: "column", gap: "1.5rem", padding: "2rem 1rem", margin: "0 auto", maxWidth: "56rem" }}
    >
      <header>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, letterSpacing: "0.04em" }}>Password</h1>
        <p className="game-section-subtle">Every part of the game, in every state, out of the shared kit.</p>
      </header>

      <Section title="Live" note="drive the lobby the way a player would meet it. join a team, or drag somebody onto one">
        <Live />
      </Section>

      <Section title="Waiting on people" note="the two ways a lobby is not a game yet, each said in its own words rather than a dead button">
        <PasswordLobby {...LOBBY} teams={empty(2)} sessionId={HOST} isHost inGame onJoinTeam={NOOP} />
        <PasswordLobby {...LOBBY} teams={deal(3, 2)} sessionId={HOST} isHost inGame onJoinTeam={NOOP} onMovePlayer={NOOP} />
      </Section>

      <Section title="One team, everybody on it" note="the state the old lobby let you press start in, and then apologised for">
        <PasswordLobby
          {...LOBBY}
          teams={[{ name: "Team A", members: CAST.slice(0, 4).map((p) => p.sessionId) }, { name: "Team B", members: [] }]}
          sessionId={HOST}
          isHost
          inGame
          onJoinTeam={NOOP}
        />
      </Section>

      <Section title="Ready" note="two a side, and three teams that all made the cut">
        <PasswordLobby {...LOBBY} teams={deal(4, 2)} sessionId={HOST} isHost inGame onJoinTeam={NOOP} onMovePlayer={NOOP} />
        <PasswordLobby {...LOBBY} teams={deal(6, 3)} sessionId={HOST} isHost inGame onJoinTeam={NOOP} onMovePlayer={NOOP} />
      </Section>

      <Section title="Locked" note="the host has shut the teams. the padlocks are the only thing that changes, and every join goes away">
        <PasswordLobby
          {...LOBBY}
          teams={deal(4, 2)}
          sessionId={HOST}
          settings={{ ...SETTINGS, teamsLocked: true }}
          isHost
          inGame
          onJoinTeam={NOOP}
          onMovePlayer={NOOP}
          onToggleLock={NOOP}
        />
      </Section>

      <Section title="Not the host" note="no start button, and no disabled one either. one line and the way out">
        <PasswordLobby {...LOBBY} teams={deal(4, 2)} sessionId="seed-cleo" isHost={false} inGame onJoinTeam={NOOP} />
      </Section>

      <Section title="Not on a team yet" note="someone who followed a link, someone already watching, and someone who turned up after the doors shut">
        <PasswordLobby {...LOBBY} teams={deal(4, 2)} sessionId="seed-zed" isHost={false} inGame={false} />
        <PasswordLobby {...LOBBY} teams={deal(4, 2)} sessionId="seed-zed" isHost={false} inGame={false} isSpectator />
        <PasswordLobby
          {...LOBBY}
          teams={deal(4, 2)}
          sessionId="seed-zed"
          settings={{ ...SETTINGS, teamsLocked: true }}
          isHost={false}
          inGame={false}
        />
      </Section>

      <Section title="What the hint says" note="the start rules in the server's own order, so the lobby never promises a start that bounces">
        <ul className="game-section-subtle" style={{ display: "grid", gap: "0.3rem", paddingLeft: "1rem" }}>
          {[empty(2), deal(1, 2), deal(3, 2), deal(4, 2)].map((teams, i) => (
            <li key={i}>{passwordStartBlock(teams) ?? "Nothing in the way, the button is live."}</li>
          ))}
        </ul>
      </Section>

      <Section title="Setup" note="the settings on their own. same facts the home card summarised before anyone joined">
        <GameFacts
          label="Setup"
          facts={[
            { value: "Animals", icon: <FiBookOpen />, tone: "var(--game-accent)", tooltip: "Where the words get picked from" },
            { value: 10, label: "to win", icon: <FiFlag /> },
            { value: formatRoundLength(300), label: "a round", icon: <FiClock /> },
            { value: PASSWORD_SKIPS, label: "skips", icon: <FiSkipForward /> },
          ]}
        />
      </Section>
    </main>
  );
}
