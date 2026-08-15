import { useState, type FormEvent, type ReactNode } from "react";
import { FiGlobe, FiLock, FiMapPin, FiPlay } from "react-icons/fi";
import { LocationClueTag, LocationGuess, LocationPickClue, LocationResult, type Coords } from "../components/location/LocationRound";
import { GameShellHeader } from "../components/shared/GameShellHeader";
import { GameButton } from "../components/shared/GameKit";
import {
  LocationBands,
  LocationExplorer,
  LocationLobby,
  locationPhases,
  locationStartBlock,
  MIN_LOCATION_PLAYERS,
  type LocationPlayer,
} from "../components/location/LocationLobby";
import "../styles/game-shared.css";

/**
 * Every part of Location Signal, on one page, driven by fake data. Same idea as
 * /dev/imposter, /dev/chain and /dev/shade: get a state right before it goes
 * onto the real page, where reaching the lobby with a full room means three
 * browser tabs.
 *
 * Only the lobby so far. The map phases move onto the kit next and land here
 * as they go.
 */

const CAST: LocationPlayer[] = [
  { sessionId: "seed-ada", name: "Ada", connected: true, totalScore: 0 },
  { sessionId: "seed-bram", name: "Bram", connected: true, totalScore: 0 },
  { sessionId: "seed-cleo", name: "Cleo", connected: true, totalScore: 0 },
  { sessionId: "seed-dov", name: "Dov", connected: true, totalScore: 0 },
];

const HOST = "seed-ada";

/* The defaults the create mutator hands out, so what this page shows is what a
   fresh room actually looks like. */
const SETTINGS = { clueDurationSec: 45, guessDurationSec: 45, roundsPerPlayer: 1, cluePairs: 2 };

const NAMES: Record<string, string> = { "seed-ada": "Ada", "seed-bram": "Bram", "seed-cleo": "Cleo", "seed-dov": "Dov" };

/* Every callback is a no-op. Nothing on this page talks to zero on purpose:
   the point is the look, and a dev page that can start a game is a dev page
   that needs a game. */
const NOOP = () => {};

const LOBBY = {
  hostId: HOST,
  settings: SETTINGS,
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
  const [cluePairs, setCluePairs] = useState(2);
  const [isPublic, setIsPublic] = useState(false);
  const [starting, setStarting] = useState(false);

  /* Whoever you are, you are somebody else when you are not hosting, so the
     "you" ring and the host crown land on different cards. */
  const me = isHost ? HOST : "seed-cleo";
  const players = CAST.slice(0, count);
  const inGame = players.some((p) => p.sessionId === me);
  const settings = { ...SETTINGS, cluePairs };

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

        {[1, 2, 3, 4].map((n) => (
          <button
            key={n}
            type="button"
            className={`btn ${cluePairs === n ? "btn-primary" : "btn-ghost"}`}
            style={toggle}
            onClick={() => setCluePairs(n)}
          >
            {n} {n === 1 ? "clue" : "clues"}
          </button>
        ))}

        <span style={{ width: "1px", background: "var(--border)", margin: "0 0.3rem" }} />

        <button type="button" className={`btn ${isHost ? "btn-primary" : "btn-ghost"}`} style={toggle} onClick={() => setIsHost((v) => !v)}>Host</button>
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
        game="location"
        title="Location Signal"
        phases={locationPhases(cluePairs)}
        phase="lobby"
        code="M4RC0"
        isHost={isHost}
        isSpectator={isSpectator}
      />

      <LocationLobby
        {...LOBBY}
        players={players}
        sessionId={me}
        settings={settings}
        isHost={isHost}
        inGame={inGame}
        isSpectator={isSpectator}
        starting={starting}
        onJoin={() => setCount((n) => Math.max(n, 2))}
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

const LEADER = { sessionId: "seed-ada", name: "Ada" };

/**
 * The merged phase with a hand on it. Drop a pin, the box wakes up, write the
 * line, send. What used to be two screens with a page turn between them.
 */
function LivePickClue() {
  const [isLeader, setIsLeader] = useState(true);
  const [target, setTarget] = useState<Coords | null>(null);
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const send = (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    /* Stands in for the two mutators the real one fires back to back, so the
       button gets held the way it would be while they are in the air. */
    setTimeout(() => { setSubmitting(false); setTarget(null); setValue(""); }, 1100);
  };

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.75rem" }}>
        <button type="button" className={`btn ${isLeader ? "btn-primary" : "btn-ghost"}`} style={toggle} onClick={() => setIsLeader((v) => !v)}>Leading</button>
        <button type="button" className="btn btn-ghost" style={toggle} onClick={() => { setTarget(null); setValue(""); }}>Clear the pin</button>
      </div>

      <GameShellHeader
        collapsible
        game="location"
        title="Location Signal"
        phases={locationPhases(2)}
        phase="picking"
        round={{ current: 1, total: 4 }}
        code="M4RC0"
        isHost
      />

      <LocationPickClue
        isLeader={isLeader}
        leader={LEADER}
        target={target}
        value={value}
        submitting={submitting}
        endsAt={Date.now() + 45_000}
        duration={45}
        onPick={setTarget}
        onChange={setValue}
        onSubmit={send}
      />
    </>
  );
}

const CLUES = [
  { round: 1, text: "where the trains are always on time" },
  { round: 2, text: "and the fish market never sleeps" },
];

/* Where the room went, for the leader watching it happen. */
const OTHERS = [
  { lat: 48.85, lng: 2.35, color: "#7ecbff", label: "Bram", size: 2.5, ring: true },
  { lat: 41.9, lng: 12.5, color: "#ef476f", label: "Cleo", size: 2.5, ring: true },
];

/**
 * Guessing with a hand on it. Drop a pin, lock it, move it after. The second
 * guess keeps the first one on the map in grey with a button to stay there,
 * which is the whole difference between a guess and a re-guess.
 */
function LiveGuess() {
  const [round, setRound] = useState(1);
  const [isGuessing, setIsGuessing] = useState(true);
  const [selected, setSelected] = useState<Coords | null>(null);
  const [locked, setLocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [clockOnMap, setClockOnMap] = useState(true);

  const previous = round > 1 ? { lat: 35.0, lng: 135.7 } : null;

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.75rem" }}>
        <button type="button" className={`btn ${round === 1 ? "btn-primary" : "btn-ghost"}`} style={toggle} onClick={() => { setRound(1); setSelected(null); setLocked(false); }}>Guess 1</button>
        <button type="button" className={`btn ${round === 2 ? "btn-primary" : "btn-ghost"}`} style={toggle} onClick={() => { setRound(2); setSelected(null); setLocked(false); }}>Guess 2</button>

        <span style={{ width: "1px", background: "var(--border)", margin: "0 0.3rem" }} />

        <button type="button" className={`btn ${isGuessing ? "btn-primary" : "btn-ghost"}`} style={toggle} onClick={() => setIsGuessing((v) => !v)}>Guessing</button>
        <button type="button" className={`btn ${clockOnMap ? "btn-primary" : "btn-ghost"}`} style={toggle} onClick={() => setClockOnMap((v) => !v)}>Clock on the map</button>
      </div>

      <GameShellHeader
        collapsible
        game="location"
        title="Location Signal"
        phases={locationPhases(2)}
        phase={`guess${round}`}
        round={{ current: 1, total: 4 }}
        endsAt={clockOnMap ? null : Date.now() + 45_000}
        {...(clockOnMap ? {} : { timerMove: { label: "Put the clock back on the map", icon: <FiMapPin />, onClick: () => setClockOnMap(true) } })}
        code="M4RC0"
        isHost
      />

      <LocationGuess
        round={round}
        isGuessing={isGuessing}
        leader={LEADER}
        clues={CLUES.slice(0, round)}
        {...(isGuessing ? {} : { target: { lat: 35.68, lng: 139.69 }, others: OTHERS })}
        selected={selected}
        locked={locked}
        submitting={submitting}
        {...(previous ? { previous, onKeep: () => setSelected(previous) } : {})}
        lockedCount={isGuessing ? (locked ? 2 : 1) : 2}
        guesserCount={3}
        endsAt={clockOnMap ? Date.now() + 45_000 : null}
        duration={45}
        onHideClock={() => setClockOnMap(false)}
        onSelect={setSelected}
        onLock={() => { setSubmitting(true); setTimeout(() => { setSubmitting(false); setLocked(true); }, 900); }}
      />
    </>
  );
}

/* Four finishes that land in four different places on the ladder, so the result
   below shows the whole slope rather than three people who all did about as
   well. The place is Tokyo. */
const RESULT = {
  target: { lat: 35.68, lng: 139.69 },
  clues: CLUES,
  leader: LEADER,
  players: [
    { sessionId: "seed-bram", name: "Bram", guess: { lat: 35.02, lng: 135.76 } },
    { sessionId: "seed-cleo", name: "Cleo", guess: { lat: 37.57, lng: 126.98 }, you: true },
    { sessionId: "seed-dov", name: "Dov", guess: { lat: 22.32, lng: 114.17 } },
    { sessionId: "seed-eve", name: "Eve", guess: { lat: 51.51, lng: -0.13 } },
  ],
};

export function LocationKitPage() {
  return (
    <main
      className="game-page"
      data-game-theme="location"
      style={{ display: "flex", flexDirection: "column", gap: "1.5rem", padding: "2rem 1rem", margin: "0 auto", maxWidth: "56rem" }}
    >
      <header>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, letterSpacing: "0.04em" }}>Location Signal</h1>
        <p className="game-section-subtle">Every part of the game, in every state, out of the shared kit.</p>
      </header>

      <Section title="Live" note="drive the lobby the way a player would meet it. the room fills, the round count follows it, and the start hint says what the mutator would have said">
        <Live />
      </Section>

      <Section title="The place and the first clue, live" note="one screen where there were two. drop a pin and the box wakes up, because handing somebody a text box for a place they have not chosen yet is asking them to write a clue about nothing">
        <LivePickClue />
      </Section>

      <Section title="The same screen, both sides" note="before the pin, after the pin, and what everybody else is looking at while it happens">
        <LocationPickClue isLeader leader={LEADER} target={null} value="" onPick={NOOP} onChange={NOOP} onSubmit={NOOP} />
        <LocationPickClue isLeader leader={LEADER} target={{ lat: 35.68, lng: 139.69 }} value="where the trains are always on time" onPick={NOOP} onChange={NOOP} onSubmit={NOOP} endsAt={Date.now() + 45_000} duration={45} />
        <LocationPickClue isLeader={false} leader={LEADER} target={null} value="" onPick={NOOP} onChange={NOOP} onSubmit={NOOP} endsAt={Date.now() + 45_000} duration={45} />
      </Section>

      <Section title="Guessing, live" note="drop a pin, lock it, move it after. locking does not take the map away, because the mutator keeps the newest guess for the round and a board that went dead would be inventing a rule the server does not have">
        <LiveGuess />
      </Section>

      <Section title="The three states a guess has" note="nothing yet, held, and handed over. the second guess keeps the first on the map in grey with one press to stay there, so nobody loses a round hunting for where they already were">
        <LocationGuess round={1} isGuessing leader={LEADER} clues={CLUES.slice(0, 1)} selected={null} lockedCount={0} guesserCount={3} onSelect={NOOP} onLock={NOOP} />
        <LocationGuess round={1} isGuessing leader={LEADER} clues={CLUES.slice(0, 1)} selected={{ lat: 35.0, lng: 135.7 }} lockedCount={1} guesserCount={3} onSelect={NOOP} onLock={NOOP} />
        <LocationGuess round={2} isGuessing leader={LEADER} clues={CLUES} selected={null} previous={{ lat: 35.0, lng: 135.7 }} onKeep={NOOP} lockedCount={2} guesserCount={3} onSelect={NOOP} onLock={NOOP} />
      </Section>

      <Section title="Not guessing" note="the leader watches with the place still on their board and everyone's pins coming in. anybody else watches without it, because hiding the answer in the markup is not hiding it">
        <LocationGuess round={2} isGuessing={false} leader={LEADER} clues={CLUES} target={{ lat: 35.68, lng: 139.69 }} others={OTHERS} selected={null} lockedCount={2} guesserCount={3} onSelect={NOOP} onLock={NOOP} />
        <LocationGuess round={2} isGuessing={false} leader={LEADER} clues={CLUES} selected={null} lockedCount={2} guesserCount={3} onSelect={NOOP} onLock={NOOP} />
      </Section>

      <Section title="The round result" note="the ten seconds between rounds, built to answer one question: why did i get that. the distance sits next to the points that came off it, the bar makes two rows comparable before you have read either number, and the ladder they were scored on is right there on the map">
        <>
          <GameShellHeader
            collapsible
            game="location"
            title="Location Signal"
            phases={locationPhases(2)}
            phase="reveal"
            round={{ current: 2, total: 4 }}
            code="M4RC0"
          />
          <LocationResult {...RESULT} />
        </>
      </Section>

      <Section title="The last one, and one nobody got" note="the only thing that changes at the end is the line saying nothing else is coming. a round of misses is a row of empty bars, because the bar runs against a full five thousand rather than against whoever won, so a bad round looks like one">
        <LocationResult {...RESULT} last />
        <LocationResult
          {...RESULT}
          players={[
            { sessionId: "seed-bram", name: "Bram", guess: { lat: -33.9, lng: 151.2 } },
            { sessionId: "seed-cleo", name: "Cleo", guess: { lat: 55.8, lng: -4.3 }, you: true },
            { sessionId: "seed-dov", name: "Dov" },
          ]}
        />
      </Section>

      <Section title="A clue once it has been said" note="drawn over the map, because it is the thing you are reading the map against">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
          <LocationClueTag round={1} text="where the trains are always on time" />
          <LocationClueTag round={2} text="and the fish market never sleeps" />
        </div>
      </Section>

      <Section title="Waiting on somebody" note="one of the two. the map is already there to be poked at, which is the point of putting it in the lobby">
        <LocationLobby {...LOBBY} players={CAST.slice(0, 1)} sessionId={HOST} isHost inGame />
      </Section>

      <Section title="Ready" note="two of them, and the only thing left is the host pressing go">
        <LocationLobby {...LOBBY} players={CAST.slice(0, 2)} sessionId={HOST} isHost inGame onKick={NOOP} />
      </Section>

      <Section title="A longer game" note="four clues instead of two and everybody leading twice. the clue count gets the accent when it is not the ordinary two, because it is the one that changes the round rather than the evening">
        <LocationLobby
          {...LOBBY}
          players={CAST}
          sessionId={HOST}
          settings={{ ...SETTINGS, cluePairs: 4, roundsPerPlayer: 2, clueDurationSec: 60, guessDurationSec: 30 }}
          isHost
          inGame
          onKick={NOOP}
        />
      </Section>

      <Section title="Not the host" note="no start button, and no disabled one either. one line and the way out">
        <LocationLobby {...LOBBY} players={CAST.slice(0, 3)} sessionId="seed-cleo" isHost={false} inGame />
      </Section>

      <Section title="Not in it" note="somebody who followed a link, and somebody already watching">
        <LocationLobby {...LOBBY} players={CAST.slice(0, 3)} sessionId="seed-zed" isHost={false} inGame={false} />
        <LocationLobby {...LOBBY} players={CAST.slice(0, 3)} sessionId="seed-zed" isHost={false} inGame={false} isSpectator />
      </Section>

      <Section title="Somebody dropped" note="they keep their place in the order, so the card says so rather than going missing">
        <LocationLobby
          {...LOBBY}
          players={[CAST[0]!, CAST[1]!, { ...CAST[2]!, connected: false }]}
          sessionId={HOST}
          isHost
          inGame
          onKick={NOOP}
        />
      </Section>

      <Section title="The map on its own" note="drop a place, then guess at it. this is the same component the lobby uses, so what it lets you play with is the thing you will be scored on">
        <LocationExplorer />
      </Section>

      <Section title="The ladder" note="one place says what a distance pays, and the readout, the pills and the tooltips all read it. these are the server's own numbers, not a second copy of them">
        <LocationBands plain />
      </Section>

      <Section title="What the hint says" note="the start rule in the mutator's own words, so the lobby never promises a start that bounces">
        <ul className="game-section-subtle" style={{ display: "grid", gap: "0.3rem", paddingLeft: "1rem" }}>
          {[0, 1, 2, 3].map((n) => (
            <li key={n}>{locationStartBlock(CAST.slice(0, n)) ?? `Nothing in the way, the button is live. (${MIN_LOCATION_PLAYERS} is the floor.)`}</li>
          ))}
        </ul>
      </Section>

      <Section title="The phase track" note="the host picks one to four clue and guess pairs, so the track is built to match rather than assuming two">
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {[1, 2, 4].map((pairs) => (
            <GameShellHeader
              key={pairs}
              game="location"
              title="Location Signal"
              phases={locationPhases(pairs)}
              phase={`guess${pairs}`}
              round={{ current: 2, total: 4 }}
              code="M4RC0"
            />
          ))}
        </div>
      </Section>
    </main>
  );
}
