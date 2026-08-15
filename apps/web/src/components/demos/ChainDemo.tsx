import { useRef, useState } from "react";
import { FiAward, FiBookOpen, FiLink, FiHelpCircle, FiXCircle, FiZap } from "react-icons/fi";
import { DemoModal, DemoPoint, DemoScoring, type DemoStep } from "./DemoModal";
import { GameShellHeader, ShellPill } from "../shared/GameShellHeader";
import { ChainLobby, chainPhases } from "../chain/ChainLobby";
import { ChainBoard, ChainScoreboard, ChainWrite, type ChainLink } from "../chain/ChainRound";
import { ChainGameOver, type ChainRoundHistory } from "../chain/ChainGameOver";
import "../../styles/game-shared.css";

/**
 * How to play Chain Reaction, drawn with the game's own components.
 *
 * This used to be a hand copy of the real screens, which is exactly why it
 * went stale the moment the real screens changed. Every panel below is the
 * component the game actually renders, handed made up data and no callbacks,
 * so the tutorial cannot show you something the game no longer does.
 */

/* ── Fake data ──────────────────────────────────────────── */

const P = { you: "demo-you", alice: "demo-alice" };
const NAMES: Record<string, string> = { [P.you]: "You", [P.alice]: "Alice" };

const NOOP = () => {};

const SETTINGS = {
  chainLength: 5,
  rounds: 3,
  turnTimeSec: null,
  chainMode: "custom" as const,
  category: "moviesAndShows",
};

const PLAYERS = [
  { sessionId: P.you, name: "You", connected: true },
  { sessionId: P.alice, name: "Alice", connected: true },
];

/* Cat, whiskers, broom, witch, spell. One word leads to the next, which is the
   only thing that makes the middle three guessable at all. */
const CHAIN_YOURS: ChainLink[] = [
  { word: "CAT", revealed: true, lettersShown: 0, solvedBy: null },
  { word: "WHISKERS", revealed: false, lettersShown: 0, solvedBy: null },
  { word: "BROOM", revealed: false, lettersShown: 2, solvedBy: null },
  { word: "WITCH", revealed: false, lettersShown: 0, solvedBy: null },
  { word: "SPELL", revealed: true, lettersShown: 0, solvedBy: null },
];

const CHAIN_SOLVED: ChainLink[] = [
  { word: "CAT", revealed: true, lettersShown: 0, solvedBy: null },
  { word: "WHISKERS", revealed: true, lettersShown: 0, solvedBy: P.you },
  { word: "BROOM", revealed: true, lettersShown: 2, solvedBy: P.you },
  { word: "WITCH", revealed: true, lettersShown: 1, solvedBy: P.you },
  { word: "SPELL", revealed: true, lettersShown: 0, solvedBy: null },
];

const SUBMIT_WORDS = ["MOON", "NIGHT", "OWL", "WISDOM", "BOOK"];

/* One round each way. Yours went clean for eight, Alice gave up on a word and
   came out two short. */
const HISTORY: ChainRoundHistory[] = [
  {
    round: 1,
    scores: { [P.you]: 8, [P.alice]: 6 },
    chains: {
      [P.you]: CHAIN_SOLVED.map((link) => ({ word: link.word, solvedBy: link.solvedBy ?? null, lettersShown: link.lettersShown })),
      [P.alice]: [
        { word: "PAPER", solvedBy: null, lettersShown: 0 },
        { word: "PLANE", solvedBy: P.alice, lettersShown: 0 },
        { word: "SKY", solvedBy: P.alice, lettersShown: 1 },
        { word: "LINE", solvedBy: null, lettersShown: 3 },
        { word: "DANCE", solvedBy: null, lettersShown: 0 },
      ],
    },
  },
];

const YOU = { sessionId: P.you, name: "You", score: 8 };
const ALICE = { sessionId: P.alice, name: "Alice", score: 6 };

/* ── Steps ──────────────────────────────────────────────── */

const steps: DemoStep[] = [
  {
    label: "Lobby",
    description: "Two players and no more. Take the open seat and wait for the host to start.",
    hint: "Premade chains come out of the word bank. Custom chains you write for each other.",
  },
  {
    label: "Write their chain",
    description: "In custom mode you write the chain your opponent has to crack. The first and last words are handed to them.",
    hint: "Each word should lead to the next one. The middle is where the game happens.",
  },
  {
    label: "Crack it",
    description: "Press any hidden word and type your guess. Both ends are already showing, so you always have somewhere to start.",
    hint: "The number on the right is what the word is worth if you get it now.",
  },
  {
    label: "Hints and giving up",
    description: "The question mark reveals a letter and walks the word down the points ladder. The cross throws it away for nothing.",
    hint: "A wrong guess reveals a letter too, so guessing wildly costs exactly what asking does.",
  },
  {
    label: "The end",
    description: "Most points takes the duel. Every round opens up to both chains, so you can see what the other one was handed.",
    hint: "Run it back and you swap: you solve what they wrote.",
  },
  {
    label: "Scoring",
    description: "A word is worth three points, then two, then one, depending on how much of it was showing when you got it.",
    hint: "A clean word is worth three times one you brute forced open.",
  },
];

/* ── Component ──────────────────────────────────────────── */

const header = (phase: string, round?: number) => (
  <GameShellHeader
    game="chain"
    title="Chain Reaction"
    phases={chainPhases("custom")}
    phase={phase}
    code="DEMO"
    isHost
    {...(round ? { round: { current: round, total: 3 } } : {})}
    pills={<ShellPill icon={<FiBookOpen />} tooltip="Which word bank the chains come from">Movies and shows</ShellPill>}
  />
);

const scoreboard = (
  <ChainScoreboard
    you={{ ...YOU, score: 0, progress: 0, total: 3 }}
    them={{ ...ALICE, score: 0, progress: 1, total: 3 }}
    viewing={P.you}
  />
);

export function ChainDemo({ onClose, initialStep = 0 }: { onClose: () => void; initialStep?: number }) {
  const initialStepRef = useRef(initialStep);
  const [step, setStep] = useState(initialStepRef.current);

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="game-page" data-game-theme="chain">
            {header("lobby")}
            <DemoPoint label="Two seats, and the duel starts when both are taken">
              <ChainLobby
                players={PLAYERS}
                sessionId={P.you}
                hostId={P.you}
                sessionById={NAMES}
                settings={SETTINGS}
                isHost
                inGame
                onStart={NOOP}
                onLeave={NOOP}
                onJoin={NOOP}
              />
            </DemoPoint>
          </div>
        );

      case 1:
        return (
          <div className="game-page" data-game-theme="chain">
            {header("submitting")}
            <DemoPoint label="Five words that lead to each other. They get the first and the last">
              <ChainWrite words={SUBMIT_WORDS} category={SETTINGS.category} onChange={NOOP} onSubmit={(e) => e.preventDefault()} />
            </DemoPoint>
          </div>
        );

      case 2:
        return (
          <div className="game-page" data-game-theme="chain">
            {header("playing", 1)}
            {scoreboard}
            <DemoPoint label="Press a word, type it, and the letters fill in as you go">
              <ChainBoard links={CHAIN_YOURS} mine editing={1} guess="WHIS" names={NAMES} onSelect={NOOP} onChange={NOOP} />
            </DemoPoint>
          </div>
        );

      case 3:
        return (
          <div className="game-page" data-game-theme="chain">
            {header("playing", 1)}
            <DemoPoint label="The two buttons beside a word: reveal a letter, or throw it away">
              <ChainBoard links={CHAIN_YOURS} mine names={NAMES} onSelect={NOOP} onHint={NOOP} onSkip={NOOP} />
            </DemoPoint>
          </div>
        );

      case 4:
        return (
          <div className="game-page" data-game-theme="chain">
            {header("finished")}
            <DemoPoint label="Who took it, and every chain either of you was handed">
              <ChainGameOver
                you={YOU}
                them={ALICE}
                rounds={HISTORY}
                names={NAMES}
                isHost
                onPlayAgain={NOOP}
                onEnd={NOOP}
                onHome={NOOP}
              />
            </DemoPoint>
          </div>
        );

      case 5:
        return (
          <DemoScoring
            columns={["Letters showing when you solve it", "Points"]}
            rows={[
              { label: "2 or fewer", value: "3" },
              { label: "3 or 4", value: "2" },
              { label: "5 or more", value: "1" },
              { label: "You gave up on the word", value: "0" },
            ]}
            rules={[
              { icon: <FiHelpCircle size={13} />, title: "Hints", text: "The hint button reveals one more letter. It never reveals the whole word." },
              { icon: <FiXCircle size={13} />, title: "Wrong guesses", text: "A wrong guess reveals a letter as well, so it costs you exactly what a hint does." },
              { icon: <FiZap size={13} />, title: "Last word bonus", text: "Solving the final hidden word in your chain is worth one extra point." },
              { icon: <FiAward size={13} />, title: "Winning", text: "Highest total across the rounds takes it. The first and last words are free." },
            ]}
          />
        );

      default:
        return null;
    }
  };

  return (
    <DemoModal
      title="Chain Reaction"
      icon={<FiLink size={20} />}
      color="#34d399"
      steps={steps}
      currentStep={step}
      onStepChange={setStep}
      onClose={onClose}
    >
      {renderStep()}
    </DemoModal>
  );
}
