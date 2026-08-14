import { useEffect, useRef, useState } from "react";
import { scoreForLetters } from "@games/shared";
import { FiBookOpen, FiGlobe, FiLock, FiPlay, FiRefreshCw } from "react-icons/fi";
import { GameShellHeader, ShellPill } from "../components/shared/GameShellHeader";
import { GameButton } from "../components/shared/GameKit";
import {
  ChainLobby,
  chainPhases,
  chainStartBlock,
  type ChainPlayer,
} from "../components/chain/ChainLobby";
import {
  ChainBoard,
  ChainRound,
  ChainScoreboard,
  ChainWrite,
  type ChainLink,
} from "../components/chain/ChainRound";
import "../styles/game-shared.css";

/**
 * Every part of Chain Reaction, on one page, driven by fake data. Same idea as
 * /dev/password: get a state right here before it goes onto the real page,
 * where half of them need two browser tabs and somebody willing to lose.
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

/* One chain that actually holds together, which matters more than it sounds:
   a board full of unrelated words tells you nothing about whether the thing
   reads as a chain. OCEAN, WAVE, SURF, BOARD, WALK. */
const WORDS = ["OCEAN", "WAVE", "SURF", "BOARD", "WALK"];

/** What a chain looks like the moment it is dealt: both ends given, the
 *  middle hidden, nothing spent. */
function dealChain(words = WORDS): ChainLink[] {
  return words.map((word, index) => ({
    word,
    revealed: index === 0 || index === words.length - 1,
    lettersShown: 0,
    solvedBy: null,
  }));
}

/* Their board, part way through, so switching to it shows something worth
   looking at rather than five blanks. */
const THEIR_WORDS = ["CANDLE", "WAX", "SEAL", "LETTER", "BOX"];

function theirChain(): ChainLink[] {
  return dealChain(THEIR_WORDS).map((link, i) =>
    i === 1 ? { ...link, revealed: true, solvedBy: "seed-bram" } : i === 2 ? { ...link, lettersShown: 2 } : link,
  );
}

const prefixOf = (link: ChainLink) => link.word.slice(0, link.lettersShown).toUpperCase();

/** The next word still hidden, so a solved word hands you straight on to the
 *  one after it rather than dumping you back at the board. */
function nextOpen(links: ChainLink[], from: number) {
  for (let i = from + 1; i < links.length; i += 1) if (!links[i]!.revealed) return i;
  for (let i = 0; i < links.length; i += 1) if (!links[i]!.revealed) return i;
  return null;
}

/**
 * The round with a hand on it. Guessing, hinting and giving up all write to
 * the same local state the mutators write to, including the rule that makes
 * the game what it is: a wrong guess hands you a letter, and the letter walks
 * the word down the points ladder.
 */
function LiveRound() {
  const [links, setLinks] = useState(dealChain);
  const [theirs, setTheirs] = useState(theirChain);
  const [editing, setEditing] = useState<number | null>(null);
  const [guess, setGuess] = useState("");
  const [score, setScore] = useState(4);
  const [viewing, setViewing] = useState("seed-ada");
  const [draft, setDraft] = useState<{ wordIndex: number; text: string } | null>(null);
  const timer = useRef<number>(0);

  /* They keep working while you do. The point of watching their board is
     watching letters land in it, so the draft sits there a beat and then
     becomes a solved word. */
  useEffect(() => {
    const open = theirs.findIndex((link) => !link.revealed);
    if (open < 0) return;
    const word = theirs[open]!.word;

    timer.current = window.setTimeout(() => {
      setDraft({ wordIndex: open, text: word.slice(0, Math.ceil(word.length / 2)) });
      timer.current = window.setTimeout(() => {
        setDraft(null);
        setTheirs((all) => all.map((link, i) => (i === open ? { ...link, revealed: true, solvedBy: "seed-bram" } : link)));
      }, 1600);
    }, 2600);

    return () => window.clearTimeout(timer.current);
  }, [theirs]);

  const select = (index: number) => {
    setEditing(index);
    setGuess(prefixOf(links[index]!));
  };

  const submit = () => {
    if (editing === null) return;
    const link = links[editing]!;

    if (guess.trim().toLowerCase() === link.word.toLowerCase()) {
      const last = links.filter((l) => !l.revealed).length === 1;
      setScore((n) => n + scoreForLetters(link.lettersShown) + (last ? 1 : 0));
      const solved = links.map((l, i) => (i === editing ? { ...l, revealed: true, solvedBy: "seed-ada" } : l));
      setLinks(solved);
      const next = nextOpen(solved, editing);
      if (next === null) { setEditing(null); setGuess(""); return; }
      setEditing(next);
      setGuess(prefixOf(solved[next]!));
      return;
    }

    /* Wrong. The mutator hands you a letter for it, which is the same cost as
       asking for one, so the ladder moves either way. */
    const punished = links.map((l, i) =>
      i === editing && l.lettersShown < l.word.length - 1 ? { ...l, lettersShown: l.lettersShown + 1 } : l,
    );
    setLinks(punished);
    setGuess(prefixOf(punished[editing]!));
  };

  const hint = (index: number) => {
    setLinks((all) =>
      all.map((l, i) => (i === index && l.lettersShown < l.word.length - 1 ? { ...l, lettersShown: l.lettersShown + 1 } : l)),
    );
    if (editing !== index) select(index);
    else setGuess(prefixOf({ ...links[index]!, lettersShown: links[index]!.lettersShown + 1 }));
  };

  const skip = (index: number) => {
    const gone = links.map((l, i) => (i === index ? { ...l, revealed: true, solvedBy: null } : l));
    setLinks(gone);
    const next = nextOpen(gone, index);
    if (next === null) { setEditing(null); setGuess(""); return; }
    setEditing(next);
    setGuess(prefixOf(gone[next]!));
  };

  const reset = () => {
    setLinks(dealChain());
    setTheirs(theirChain());
    setEditing(null);
    setGuess("");
    setScore(4);
    setDraft(null);
  };

  const cracked = (chain: ChainLink[]) => chain.filter((l) => l.revealed && l.solvedBy).length;
  const done = (chain: ChainLink[]) => chain.every((l) => l.revealed);

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.75rem" }}>
        <button type="button" className="btn btn-ghost" style={toggle} onClick={reset}>
          <FiRefreshCw size={12} /> Deal again
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          style={toggle}
          onClick={() => setLinks((all) => all.map((l) => ({ ...l, revealed: true, solvedBy: l.solvedBy ?? "seed-ada" })))}
        >
          Finish mine
        </button>
      </div>

      <GameShellHeader
        collapsible
        game="chain"
        title="Chain Reaction"
        phases={chainPhases("premade")}
        phase="playing"
        round={{ current: 2, total: 3 }}
        endsAt={Date.now() + 180_000}
        duration={180}
        code="Q4LM8"
        pills={<ShellPill icon={<FiBookOpen />} tooltip="Which word bank the chains come from">Animals</ShellPill>}
      />

      <ChainRound
        you={{
          sessionId: "seed-ada", name: "Ada", score,
          progress: cracked(links), total: links.length - 2, ...(done(links) ? { done: true } : {}),
        }}
        them={{
          sessionId: "seed-bram", name: "Bram", score: 6,
          progress: cracked(theirs), total: theirs.length - 2, ...(done(theirs) ? { done: true } : {}),
        }}
        yourLinks={links}
        theirLinks={theirs}
        viewing={viewing}
        editing={editing}
        guess={guess}
        draft={draft}
        names={{ "seed-ada": "Ada", "seed-bram": "Bram" }}
        onView={setViewing}
        onSelect={select}
        onChange={setGuess}
        onGuess={submit}
        onCancel={() => { setEditing(null); setGuess(""); }}
        onHint={hint}
        onSkip={skip}
      />
    </>
  );
}

/** Writing your own, with the boxes working. */
function LiveWrite() {
  const [words, setWords] = useState(["", "", "", "", ""]);
  const [locked, setLocked] = useState(false);

  return (
    <>
      <ChainWrite
        words={words}
        category="animals"
        {...(locked ? { locked: true, waitingOn: "Bram" } : {})}
        onChange={(index, value) => setWords((all) => all.map((word, i) => (i === index ? value : word)))}
        onSubmit={(event) => { event.preventDefault(); setLocked(true); }}
      />

      {locked && (
        <button type="button" className="btn btn-ghost" style={{ ...toggle, alignSelf: "start" }} onClick={() => setLocked(false)}>
          <FiRefreshCw size={12} /> Write it again
        </button>
      )}
    </>
  );
}

/* Every state a link can be in, in one chain: given, cracked, thrown away,
   part spent, and the one being typed into. */
const EVERY_STATE: ChainLink[] = [
  { word: "OCEAN", revealed: true, lettersShown: 0, solvedBy: null },
  { word: "WAVE", revealed: true, lettersShown: 0, solvedBy: "seed-ada" },
  { word: "SURF", revealed: true, lettersShown: 2, solvedBy: null },
  { word: "BOARD", revealed: false, lettersShown: 3, solvedBy: null },
  { word: "WALK", revealed: true, lettersShown: 0, solvedBy: null },
];

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

      <Section title="The round, live" note="the phase the game actually is. press a word, type it, get it wrong on purpose and watch what it costs you">
        <LiveRound />
      </Section>

      <Section title="Every state a link has" note="given, cracked, thrown away, part spent. one accent, and it means the one you got">
        <ChainBoard links={EVERY_STATE} mine editing={3} guess="BOA" names={{ "seed-ada": "Ada" }} />
      </Section>

      <Section title="Their board" note="the same chain read only, with them typing into it. this is what you get once yours is done">
        <ChainBoard
          links={theirChain()}
          title="Bram's chain"
          draft={{ wordIndex: 2, text: "SEA" }}
          names={{ "seed-bram": "Bram" }}
        />
      </Section>

      <Section title="The scoreboard" note="the lobby's two cards again, carrying the score and how far along each of you is. press one to read that board">
        <ChainScoreboard
          you={{ sessionId: "seed-ada", name: "Ada", score: 7, progress: 2, total: 3 }}
          them={{ sessionId: "seed-bram", name: "Bram", score: 9, progress: 3, total: 3, done: true }}
          viewing="seed-ada"
          onView={NOOP}
        />
      </Section>

      <Section title="Writing your own" note="custom mode. the same links they will be cracking, so what you are building looks like what they will get">
        <LiveWrite />
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
