import { useEffect, useRef, useState } from "react";
import { FiBookOpen, FiClock, FiEye, FiFlag, FiGlobe, FiLock, FiPlay, FiRefreshCw, FiZap } from "react-icons/fi";
import { GameShellHeader, ShellPill } from "../components/shared/GameShellHeader";
import { GameActions, GameButton, GameFacts } from "../components/shared/GameKit";
import { IMPOSTER_PHASES, ImposterLobby, MIN_IMPOSTER_PLAYERS, type ImposterPlayer } from "../components/imposter/ImposterLobby";
import { ImposterCluePhase, ImposterClueWall, ImposterComposer, ImposterWordCard } from "../components/imposter/ImposterClues";
import { ImposterVotePhase } from "../components/imposter/ImposterVote";
import { ImposterRoundResult } from "../components/imposter/ImposterRoundResult";
import { ImposterGameOver, type ImposterRoundHistory } from "../components/imposter/ImposterGameOver";
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
            /* Stands in for LobbyVisibilityToggle, which needs zero. Same
               words as the real one: it is a switch, so it says what pressing
               it does rather than naming the state you are already in. */
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

const ROUND_CLUES = [
  { sessionId: "seed-ada", text: "cold ending" },
  { sessionId: "seed-bram", text: "the boat one" },
  { sessionId: "seed-cleo", text: "three hours long" },
  { sessionId: "seed-dov", text: "big and blue" },
];

/** The ballot with a hand on it, so picking, sending and changing your mind
 *  are three things you can actually feel the difference between. */
function LiveVote() {
  const [voteTarget, setVoteTarget] = useState("");
  const [submittedTarget, setSubmittedTarget] = useState<string | null>(null);
  const [voted, setVoted] = useState<string[]>(["seed-bram"]);

  const reset = () => { setVoteTarget(""); setSubmittedTarget(null); setVoted(["seed-bram"]); };

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.75rem" }}>
        <button
          type="button"
          className="btn btn-ghost"
          style={toggle}
          onClick={() => setVoted((v) => (v.length < CLUE_CAST.length ? [...v, CLUE_CAST[v.length]!.sessionId] : v))}
        >
          One more vote lands
        </button>
        <button type="button" className="btn btn-ghost" style={toggle} onClick={reset}>
          <FiRefreshCw size={12} /> Start over
        </button>
      </div>

      <GameShellHeader
        collapsible
        game="imposter"
        title="Imposter"
        phases={IMPOSTER_PHASES}
        phase="voting"
        round={{ current: 2, total: 5 }}
        endsAt={Date.now() + 45_000}
        duration={60}
        code="H4TQ9"
      />

      <ImposterVotePhase
        players={CLUE_CAST}
        clues={ROUND_CLUES}
        sessionId="seed-ada"
        voted={voted}
        voteTarget={voteTarget}
        submittedTarget={submittedTarget}
        onVoteTargetChange={setVoteTarget}
        onSubmit={() => {
          setSubmittedTarget(voteTarget);
          setVoted((v) => (v.includes("seed-ada") ? v : [...v, "seed-ada"]));
        }}
      />
    </>
  );
}

/* Roles only exist once the round has been played, so the result cast carries
   them where the lobby one does not. */
const ROUND_CAST: ImposterPlayer[] = [
  { sessionId: "seed-ada", name: "Ada", connected: true, role: "player" },
  { sessionId: "seed-bram", name: "Bram", connected: true, role: "player" },
  { sessionId: "seed-cleo", name: "Cleo", connected: true, role: "imposter" },
  { sessionId: "seed-dov", name: "Dov", connected: true, role: "player" },
];

const CAUGHT = [
  { voterId: "seed-ada", targetId: "seed-cleo" },
  { voterId: "seed-bram", targetId: "seed-cleo" },
  { voterId: "seed-dov", targetId: "seed-cleo" },
  { voterId: "seed-cleo", targetId: "seed-dov" },
];

const WRONG = [
  { voterId: "seed-ada", targetId: "seed-dov" },
  { voterId: "seed-bram", targetId: "seed-dov" },
  { voterId: "seed-cleo", targetId: "seed-dov" },
  { voterId: "seed-dov", targetId: "seed-ada" },
];

/** Replayable, because a reveal you cannot watch twice is hard to tune. */
function LiveResult() {
  const [run, setRun] = useState(0);
  const [caught, setCaught] = useState(true);
  const [skips, setSkips] = useState(1);
  const [skipped, setSkipped] = useState(false);

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.75rem" }}>
        <button type="button" className={`btn ${caught ? "btn-primary" : "btn-ghost"}`} style={toggle} onClick={() => { setCaught((v) => !v); setRun((n) => n + 1); }}>
          They got the imposter
        </button>
        <button type="button" className="btn btn-ghost" style={toggle} onClick={() => { setRun((n) => n + 1); setSkips(1); setSkipped(false); }}>
          <FiRefreshCw size={12} /> Watch it again
        </button>
      </div>

      <GameShellHeader
        game="imposter"
        title="Imposter"
        phases={IMPOSTER_PHASES}
        phase="results"
        round={{ current: 2, total: 5 }}
        endsAt={Date.now() + 8_000}
        duration={8}
        code="H4TQ9"
      />

      {/* The key restarts the animations, which is the whole point of a
          replay button. */}
      <ImposterRoundResult
        key={run}
        players={ROUND_CAST}
        votes={caught ? CAUGHT : WRONG}
        clues={ROUND_CLUES}
        secretWord="Titanic"
        skipVotes={skips}
        hasVotedSkip={skipped}
        onSkip={() => { setSkipped(true); setSkips((n) => n + 1); }}
      />
    </>
  );
}

/* Three rounds that actually hang together: a wrong call, a quiet one, and
   the round the room finally got there. */
const HISTORY: ImposterRoundHistory[] = [
  {
    round: 1,
    secretWord: "Jaws",
    votedOutId: "seed-dov",
    wasImposter: false,
    clues: [
      { sessionId: "seed-ada", text: "bigger boat" },
      { sessionId: "seed-bram", text: "summer of 75" },
      { sessionId: "seed-cleo", text: "sea creature" },
      { sessionId: "seed-dov", text: "scary water" },
    ],
    votes: [
      { voterId: "seed-ada", targetId: "seed-dov" },
      { voterId: "seed-bram", targetId: "seed-dov" },
      { voterId: "seed-cleo", targetId: "seed-dov" },
      { voterId: "seed-dov", targetId: "seed-cleo" },
    ],
  },
  {
    round: 2,
    secretWord: "Alien",
    votedOutId: null,
    wasImposter: false,
    clues: [
      { sessionId: "seed-ada", text: "in space nobody hears you" },
      { sessionId: "seed-bram", text: "chestburster" },
      { sessionId: "seed-cleo", text: "quite tense" },
    ],
    /* Nobody went, so nobody voted. A round with votes in it always ends with
       somebody leaving, since the server takes the first of any tie. */
    votes: [],
  },
  {
    round: 3,
    secretWord: "Titanic",
    votedOutId: "seed-cleo",
    wasImposter: true,
    clues: [
      { sessionId: "seed-ada", text: "cold ending" },
      { sessionId: "seed-bram", text: "the boat one" },
      { sessionId: "seed-cleo", text: "three hours long" },
    ],
    votes: [
      { voterId: "seed-ada", targetId: "seed-cleo" },
      { voterId: "seed-bram", targetId: "seed-cleo" },
      { voterId: "seed-cleo", targetId: "seed-bram" },
    ],
  },
];

/** How the cast ends up after those three rounds. */
const ENDED_CAST: ImposterPlayer[] = [
  { sessionId: "seed-ada", name: "Ada", connected: true, role: "player" },
  { sessionId: "seed-bram", name: "Bram", connected: true, role: "player" },
  { sessionId: "seed-cleo", name: "Cleo", connected: true, role: "imposter", eliminated: true },
  { sessionId: "seed-dov", name: "Dov", connected: true, role: "player", eliminated: true },
];

const GOT_AWAY: ImposterPlayer[] = ENDED_CAST.map((p) =>
  p.sessionId === "seed-cleo" ? { ...p, eliminated: false } : p,
);

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
        {/* The host can set more than one, and then "one of you" is a lie. */}
        <ImposterWordCard role="player" secretWord="Titanic" category="moviesAndShows" imposters={2} />
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

      <Section title="The vote, live" note="pick, send, change your mind. three states people usually have to guess at">
        <LiveVote />
      </Section>

      <Section title="The ballot" note="nothing picked, pointing at someone, and a vote that is already in">
        <ImposterVotePhase
          players={CLUE_CAST}
          clues={ROUND_CLUES}
          sessionId="seed-ada"
          voted={["seed-bram", "seed-cleo"]}
          voteTarget=""
          onVoteTargetChange={NOOP}
          onSubmit={NOOP}
        />
        <ImposterVotePhase
          players={CLUE_CAST}
          clues={ROUND_CLUES}
          sessionId="seed-ada"
          voted={["seed-bram", "seed-cleo"]}
          voteTarget="seed-cleo"
          onVoteTargetChange={NOOP}
          onSubmit={NOOP}
        />
        <ImposterVotePhase
          players={CLUE_CAST}
          clues={ROUND_CLUES}
          sessionId="seed-ada"
          voted={["seed-ada", "seed-bram", "seed-cleo"]}
          voteTarget="seed-cleo"
          submittedTarget="seed-cleo"
          onVoteTargetChange={NOOP}
          onSubmit={NOOP}
        />
        <ImposterVotePhase
          players={CLUE_CAST}
          clues={ROUND_CLUES}
          sessionId="seed-ada"
          voted={["seed-ada", "seed-bram", "seed-cleo"]}
          voteTarget="seed-dov"
          submittedTarget="seed-cleo"
          onVoteTargetChange={NOOP}
          onSubmit={NOOP}
        />
      </Section>

      <Section title="Nothing to go on" note="somebody ran the clock out. the gap is worth seeing, so it gets said rather than left blank">
        <ImposterVotePhase
          players={CLUE_CAST}
          clues={ROUND_CLUES.slice(0, 2)}
          sessionId="seed-ada"
          voted={["seed-bram"]}
          voteTarget=""
          onVoteTargetChange={NOOP}
          onSubmit={NOOP}
        />
      </Section>

      <Section title="Watching the vote" note="a spectator reads the room, and the ballot goes quiet instead of teasing a button">
        <ImposterVotePhase
          canVote={false}
          players={CLUE_CAST}
          clues={ROUND_CLUES}
          sessionId="seed-zed"
          voted={["seed-bram", "seed-cleo"]}
          voteTarget=""
          onVoteTargetChange={NOOP}
          onSubmit={NOOP}
        />
      </Section>

      <Section title="The result, live" note="eight seconds between rounds. the face lands, then the answer">
        <LiveResult />
      </Section>

      <Section title="Every ending" note="caught, wrong, a tie, and a room that could not be bothered">
        <ImposterRoundResult players={ROUND_CAST} votes={CAUGHT} clues={ROUND_CLUES} secretWord="Titanic" skipVotes={0} onSkip={NOOP} />
        <ImposterRoundResult players={ROUND_CAST} votes={WRONG} clues={ROUND_CLUES} secretWord="Titanic" skipVotes={2} onSkip={NOOP} />
        <ImposterRoundResult
          players={ROUND_CAST}
          clues={ROUND_CLUES}
          secretWord="Titanic"
          skipVotes={3}
          hasVotedSkip
          onSkip={NOOP}
          /* A real two all. Nobody can vote for themselves, so a tie in a
             room of four has to be built carefully. */
          votes={[
            { voterId: "seed-bram", targetId: "seed-ada" },
            { voterId: "seed-cleo", targetId: "seed-ada" },
            { voterId: "seed-ada", targetId: "seed-bram" },
            { voterId: "seed-dov", targetId: "seed-bram" },
          ]}
        />
        <ImposterRoundResult players={ROUND_CAST} votes={[]} clues={ROUND_CLUES} secretWord="Titanic" skipVotes={0} onSkip={NOOP} />
      </Section>

      <Section title="Watching the result" note="a spectator cannot hurry the room, so there is no button to press">
        <ImposterRoundResult canSkip={false} players={ROUND_CAST} votes={CAUGHT} clues={ROUND_CLUES} secretWord="Titanic" onSkip={NOOP} />
      </Section>

      <Section title="The end" note="who won, who was who, and every round folded down to its headline. the last one opens itself">
        <ImposterGameOver
          isHost
          players={ENDED_CAST}
          rounds={HISTORY}
          sessionId="seed-ada"
          onPlayAgain={NOOP}
          onEnd={NOOP}
          onHome={NOOP}
        />
      </Section>

      <Section title="The end, the other way" note="the imposter survived, and whoever is not hosting only gets the way out">
        <ImposterGameOver
          players={GOT_AWAY}
          rounds={HISTORY.slice(0, 2)}
          sessionId="seed-bram"
          onPlayAgain={NOOP}
          onEnd={NOOP}
          onHome={NOOP}
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
