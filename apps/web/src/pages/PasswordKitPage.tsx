import { useEffect, useRef, useState } from "react";
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
import { PasswordGameOver, type PasswordWordHistory } from "../components/password/PasswordGameOver";
import {
  PasswordLane,
  PasswordRound,
  PasswordScoreboard,
  PasswordStream,
  PasswordTakenList,
  PasswordWordCard,
  type PasswordClue,
  type PasswordGuess,
  type PasswordTaken,
} from "../components/password/PasswordRound";
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

/* One word being worked out, the way it actually goes: a clue, a wrong guess
   off the back of it, another clue, and then the room gets there. */
const T0 = 1_700_000_000_000;

const ROUND_CLUES: PasswordClue[] = [
  { id: "c1", sessionId: "seed-ada", text: "tuxedo", ts: T0 + 1_000, clueNumber: 1 },
  { id: "c2", sessionId: "seed-cleo", text: "waddles", ts: T0 + 9_000, clueNumber: 2 },
  { id: "c3", sessionId: "seed-ada", text: "waddles", ts: T0 + 17_000, clueNumber: 3, repeatedText: true },
];

const ROUND_GUESSES: PasswordGuess[] = [
  { id: "g1", sessionId: "seed-bram", text: "Waiter", ts: T0 + 5_000, correct: false, guessNumber: 1 },
  { id: "g2", sessionId: "seed-bram", text: "Duck", ts: T0 + 13_000, correct: false, guessNumber: 2 },
  { id: "g3", sessionId: "seed-bram", text: "Penguin", ts: T0 + 21_000, correct: true, guessNumber: 3 },
];

/* A word that took a while, for checking the record scrolls instead of
   shoving the boxes down the page. */
const LONG_CLUES: PasswordClue[] = ["tuxedo", "waddles", "cold", "swims", "ice", "bird"].map((text, i) => ({
  id: `lc${i}`, sessionId: i % 2 ? "seed-cleo" : "seed-ada", text, ts: T0 + i * 4_000, clueNumber: i + 1,
}));

const LONG_GUESSES: PasswordGuess[] = ["Waiter", "Duck", "Seal", "Walrus", "Penguin"].map((text, i) => ({
  id: `lg${i}`, sessionId: "seed-dov", text, ts: T0 + 2_000 + i * 4_000,
  correct: text === "Penguin", guessNumber: i + 1,
}));

/* Words this team already took. The only place the points you earned are
   written down while the clock is still running. */
const TAKEN: PasswordTaken[] = [
  { roundId: "r1", word: "Otter", guesserId: "seed-dov", guessCount: 1, points: 3 },
  { roundId: "r2", word: "Badger", guesserId: "seed-cleo", guessCount: 4, points: 1 },
];

/* What the other side does while you sit there. Whichever end you are on, the
   script plays the opposite one, because a round with nobody answering is not
   a round. */
const CLUE_SCRIPT = ["tuxedo", "waddles", "cold"];
const GUESS_SCRIPT = ["Waiter", "Duck", "Penguin"];

/* Five words that hang together: one taken cold, one that cost the room four
   goes, and the pair at the end that decided it. */
const HISTORY: PasswordWordHistory[] = [
  {
    roundId: "h1", round: 1, teamIndex: 0, guesserId: "seed-dov", word: "Otter",
    guessCount: 1, points: 3,
    clues: [{ id: "h1c1", sessionId: "seed-ada", text: "river", ts: T0, clueNumber: 1 }],
    guesses: [{ id: "h1g1", sessionId: "seed-dov", text: "Otter", ts: T0 + 2_000, correct: true, guessNumber: 1 }],
  },
  {
    roundId: "h2", round: 1, teamIndex: 1, guesserId: "seed-bram", word: "Moth",
    guessCount: 2, points: 2,
    clues: [
      { id: "h2c1", sessionId: "seed-esme", text: "lamp", ts: T0 + 1_000, clueNumber: 1 },
      { id: "h2c2", sessionId: "seed-finn", text: "wings", ts: T0 + 5_000, clueNumber: 2 },
    ],
    guesses: [
      { id: "h2g1", sessionId: "seed-bram", text: "Bat", ts: T0 + 3_000, correct: false, guessNumber: 1 },
      { id: "h2g2", sessionId: "seed-bram", text: "Moth", ts: T0 + 7_000, correct: true, guessNumber: 2 },
    ],
  },
  {
    roundId: "h3", round: 2, teamIndex: 0, guesserId: "seed-cleo", word: "Badger",
    guessCount: 4, points: 1,
    clues: [
      { id: "h3c1", sessionId: "seed-ada", text: "stripes", ts: T0 + 10_000, clueNumber: 1 },
      { id: "h3c2", sessionId: "seed-dov", text: "digs", ts: T0 + 14_000, clueNumber: 2 },
      { id: "h3c3", sessionId: "seed-ada", text: "stripes", ts: T0 + 18_000, clueNumber: 3, repeatedText: true },
      { id: "h3c4", sessionId: "seed-dov", text: "sett", ts: T0 + 22_000, clueNumber: 4 },
    ],
    guesses: [
      { id: "h3g1", sessionId: "seed-cleo", text: "Zebra", ts: T0 + 12_000, correct: false, guessNumber: 1 },
      { id: "h3g2", sessionId: "seed-cleo", text: "Skunk", ts: T0 + 16_000, correct: false, guessNumber: 2 },
      { id: "h3g3", sessionId: "seed-cleo", text: "Mole", ts: T0 + 20_000, correct: false, guessNumber: 3 },
      { id: "h3g4", sessionId: "seed-cleo", text: "Badger", ts: T0 + 24_000, correct: true, guessNumber: 4 },
    ],
  },
  {
    roundId: "h4", round: 3, teamIndex: 1, guesserId: "seed-esme", word: "Crab",
    guessCount: 3, points: 1,
    clues: [
      { id: "h4c1", sessionId: "seed-bram", text: "sideways", ts: T0 + 30_000, clueNumber: 1 },
      { id: "h4c2", sessionId: "seed-finn", text: "claws", ts: T0 + 34_000, clueNumber: 2 },
    ],
    guesses: [
      { id: "h4g1", sessionId: "seed-esme", text: "Lobster", ts: T0 + 32_000, correct: false, guessNumber: 1 },
      { id: "h4g2", sessionId: "seed-esme", text: "Scorpion", ts: T0 + 35_000, correct: false, guessNumber: 2 },
      { id: "h4g3", sessionId: "seed-esme", text: "Crab", ts: T0 + 38_000, correct: true, guessNumber: 3 },
    ],
  },
  {
    roundId: "h5", round: 4, teamIndex: 0, guesserId: "seed-ada", word: "Penguin",
    guessCount: 1, points: 3,
    clues: [{ id: "h5c1", sessionId: "seed-cleo", text: "tuxedo", ts: T0 + 40_000, clueNumber: 1 }],
    guesses: [{ id: "h5g1", sessionId: "seed-ada", text: "Penguin", ts: T0 + 41_000, correct: true, guessNumber: 1 }],
  },
];

/* Two teams of three, so the clue side has more than one person on it. Two
   people cluing at the same guesser is the shape this game actually takes. */
const ROUND_TEAMS: PasswordTeam[] = [
  { name: "Team A", members: ["seed-ada", "seed-cleo", "seed-dov"] },
  { name: "Team B", members: ["seed-bram", "seed-esme", "seed-finn"] },
];

/** The round with a hand on it: your box works, and the other end answers. */
function LiveRound() {
  const [guessing, setGuessing] = useState(false);
  const [value, setValue] = useState("");
  const [clues, setClues] = useState<PasswordClue[]>([]);
  const [guesses, setGuesses] = useState<PasswordGuess[]>([]);
  const [draft, setDraft] = useState("");
  const [skips, setSkips] = useState(PASSWORD_SKIPS);
  const [step, setStep] = useState(0);
  const timer = useRef<number>(0);

  /* Your team is Team A. You are Ada; Cleo clues alongside you and Dov
     guesses, or the other way round when you take the guessing seat. */
  const me = "seed-ada";
  const mate = "seed-cleo";
  const other = "seed-dov";
  const guesserId = guessing ? me : other;

  /* A new word: everything about the one you were on goes, the skips you have
     spent stay spent. Which is what the real game does when a team either
     takes a word or throws it away. */
  const newWord = () => {
    setValue(""); setClues([]); setGuesses([]); setDraft(""); setStep(0);
  };

  const reset = () => { newWord(); setSkips(PASSWORD_SKIPS); };

  /* The other end types for a moment, then says it. Watching somebody else's
     keystrokes land in the box beside yours is the thing this page exists to
     check, so the draft sits there a beat before it becomes a line. */
  useEffect(() => {
    const script = guessing ? CLUE_SCRIPT : GUESS_SCRIPT;
    const next = script[step];
    if (!next) return;

    timer.current = window.setTimeout(() => {
      setDraft(next);
      timer.current = window.setTimeout(() => {
        setDraft("");
        const ts = Date.now();
        if (guessing) {
          /* Both your teammates clue, so they take it in turns to be the one
             who actually sends. */
          const from = step % 2 === 0 ? mate : other;
          setClues((all) => [...all, { id: `s${ts}`, sessionId: from, text: next, ts, clueNumber: all.length + 1 }]);
        } else {
          setGuesses((all) => [...all, {
            id: `s${ts}`, sessionId: other, text: next, ts,
            correct: next === "Penguin", guessNumber: all.length + 1,
          }]);
        }
        setStep((n) => n + 1);
      }, 1400);
    }, 2200);

    return () => window.clearTimeout(timer.current);
  }, [step, guessing]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const text = value.trim();
    if (!text) return;
    const ts = Date.now();
    if (guessing) {
      setGuesses((all) => [...all, {
        id: `m${ts}`, sessionId: me, text, ts,
        correct: text.toLowerCase() === "penguin", guessNumber: all.length + 1,
      }]);
    } else {
      setClues((all) => [...all, { id: `m${ts}`, sessionId: me, text, ts, clueNumber: all.length + 1 }]);
    }
    setValue("");
  };

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.75rem" }}>
        <button type="button" className={`btn ${guessing ? "btn-primary" : "btn-ghost"}`} style={toggle} onClick={() => { setGuessing((v) => !v); reset(); }}>
          You are guessing
        </button>
        <button type="button" className="btn btn-ghost" style={toggle} onClick={reset}>
          <FiRefreshCw size={12} /> Run it again
        </button>
      </div>

      <GameShellHeader
        collapsible
        game="password"
        title="Password"
        phases={PASSWORD_PHASES}
        phase="playing"
        endsAt={Date.now() + 300_000}
        duration={300}
        code="K2WD7"
        pills={<ShellPill icon={<FiBookOpen />} tooltip="Which word bank this game is drawing from">Animals</ShellPill>}
      />

      <PasswordRound
        role={guessing ? "guess" : "clue"}
        word={guessing ? null : "Penguin"}
        category="animals"
        teamMembers={ROUND_TEAMS[0]!.members}
        guesserId={guesserId}
        clues={clues}
        guesses={guesses}
        drafts={draft ? [{ sessionId: guessing ? mate : other, role: guessing ? "clue" : "guess", text: draft }] : []}
        taken={TAKEN}
        names={NAMES}
        sessionId={me}
        value={value}
        skipsRemaining={skips}
        teams={ROUND_TEAMS}
        scores={{ "Team A": 4, "Team B": 7 }}
        targetScore={10}
        guessers={{ "Team A": guesserId, "Team B": "seed-bram" }}
        onChange={setValue}
        onSubmit={submit}
        onSkip={() => { setSkips((n) => Math.max(0, n - 1)); newWord(); }}
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

      <Section title="The round, live" note="the phase the game actually is. type a clue, watch the other side answer it">
        <LiveRound />
      </Section>

      <Section title="What you know" note="one of you can see it and one of you cannot. that is the whole game, so the two cards do not look alike">
        <PasswordWordCard role="clue" word="Penguin" category="animals" worth={3} />
        <PasswordWordCard role="guess" word={null} category="animals" worth={3} />
        <PasswordWordCard role="guess" word={null} category="animals" worth={1} />
        <PasswordWordCard role="clue" word="Penguin" />
        {/* Decryption can take a beat, and a clue giver with no word cannot
            do the only thing they are here for. */}
        <PasswordWordCard role="clue" word={null} category="animals" onRetry={NOOP} />
      </Section>

      <Section title="The two boxes" note="yours takes typing, theirs shows it arriving. both are on screen the whole time, because you are both going at once">
        <div className="pw-exchange">
          <div className="pw-lanes">
            <PasswordLane
              side="clue"
              mine
              people={["seed-ada", "seed-cleo"]}
              names={NAMES}
              value="tuxedo"
              latest={{ sessionId: "seed-cleo", text: "waddles" }}
              onChange={NOOP}
              onSubmit={NOOP}
            />
            <PasswordLane
              side="guess"
              people={["seed-dov"]}
              names={NAMES}
              drafts={[{ sessionId: "seed-dov", role: "guess", text: "pengu" }]}
              latest={{ sessionId: "seed-dov", text: "Duck" }}
            />
          </div>
          <div className="pw-record">
            <div className="pw-record-inner">
              <PasswordStream clues={LONG_CLUES} guesses={LONG_GUESSES} names={NAMES} />
              <PasswordTakenList taken={TAKEN} names={NAMES} />
            </div>
          </div>
        </div>
      </Section>

      <Section title="Every state a box has" note="waiting on them, blocked by a rule, and no word to talk about yet">
        <div className="pw-lanes">
          <PasswordLane side="clue" people={["seed-cleo"]} names={NAMES} />
          <PasswordLane side="guess" mine people={["seed-ada"]} names={NAMES} value="Seal Otter" problem="One word only." onChange={NOOP} onSubmit={NOOP} />
          <PasswordLane side="clue" mine people={["seed-ada"]} names={NAMES} value="" disabled onChange={NOOP} onSubmit={NOOP} />
        </div>
      </Section>

      <Section title="The record" note="this word so far, beside the boxes rather than in with them. it scrolls rather than pushing them down the page">
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "start" }}>
          <div style={{ width: "15rem", height: "13rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            <PasswordStream clues={LONG_CLUES} guesses={LONG_GUESSES} names={NAMES} />
            <PasswordTakenList taken={TAKEN} names={NAMES} />
          </div>
          <div style={{ width: "15rem" }}>
            <PasswordStream clues={[]} guesses={[]} names={NAMES} />
          </div>
        </div>
      </Section>

      <Section title="Racing" note="every team plays at once, so yours is open and the rest are a face and a number">
        <PasswordScoreboard
          teams={deal(6, 3)}
          scores={{ "Team A": 4, "Team B": 7, "Team C": 2 }}
          targetScore={10}
          guessers={{ "Team A": "seed-dov", "Team B": "seed-esme", "Team C": "seed-finn" }}
          solved={["Team B"]}
          names={NAMES}
          sessionId="seed-ada"
        />
      </Section>

      <Section title="The end" note="who took it, and every word on the way there. the last one opens itself">
        <PasswordGameOver
          isHost
          teams={ROUND_TEAMS}
          scores={{ "Team A": 10, "Team B": 7 }}
          targetScore={10}
          rounds={HISTORY}
          names={NAMES}
          sessionId="seed-ada"
          hostId={HOST}
          onPlayAgain={NOOP}
          onEnd={NOOP}
          onHome={NOOP}
        />
      </Section>

      <Section title="The end, the other way" note="a level finish, and whoever is not hosting only gets the way out">
        <PasswordGameOver
          teams={ROUND_TEAMS}
          scores={{ "Team A": 8, "Team B": 8 }}
          targetScore={10}
          rounds={HISTORY.slice(0, 2)}
          names={NAMES}
          sessionId="seed-bram"
          onPlayAgain={NOOP}
          onEnd={NOOP}
          onHome={NOOP}
        />
      </Section>

      <Section title="The end, nothing happened" note="the host pulled it before anybody scored, so there is no winner rather than a tie for nothing">
        <PasswordGameOver
          isHost
          teams={ROUND_TEAMS}
          scores={{ "Team A": 0, "Team B": 0 }}
          targetScore={10}
          rounds={[]}
          names={NAMES}
          sessionId="seed-ada"
          onPlayAgain={NOOP}
          onEnd={NOOP}
          onHome={NOOP}
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
