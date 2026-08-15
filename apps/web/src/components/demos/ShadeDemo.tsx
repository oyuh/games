import { useRef, useState } from "react";
import { FiAward, FiEdit3, FiGrid, FiUser } from "react-icons/fi";
import { DemoModal, DemoPoint, DemoScoring, type DemoStep } from "./DemoModal";
import { GameShellHeader } from "../shared/GameShellHeader";
import { GameIcon } from "../shared/GameIcon";
import { ShadeLobby, shadePhases } from "../shade/ShadeLobby";
import { ShadeClue } from "../shade/ShadeClue";
import { ShadeGuess } from "../shade/ShadeGuess";
import { ShadeResult } from "../shade/ShadeResult";
import { ShadeGameOver } from "../shade/ShadeGameOver";
import "../../styles/game-shared.css";

/**
 * How to play Shade Signal, drawn with the game's own components.
 *
 * This used to be a hand copy of the real screens, which is exactly why it
 * went stale the moment those screens were rebuilt: it was still teaching a
 * page with a badge row, an emoji leader mark and a scoring legend the game no
 * longer draws. Every panel below is the component the game actually renders,
 * handed made up data and no callbacks, so the tutorial cannot show you
 * something the game does not do.
 */

/* ── Fake data ──────────────────────────────────────────── */

const P = { you: "demo-you", alice: "demo-alice", bob: "demo-bob", diana: "demo-diana" };
const NAMES: Record<string, string> = { [P.you]: "You", [P.alice]: "Alice", [P.bob]: "Bob", [P.diana]: "Diana" };

const NOOP = () => {};

/* The board a real game deals: ten rows by twelve, off a seed. */
const GRID = { rows: 10, cols: 12, seed: 42 };
const TARGET = { row: 3, col: 5 };

const SETTINGS = {
  hardMode: false,
  clueDurationSec: 45,
  guessDurationSec: 30,
  roundsPerPlayer: 1,
  leaderPick: false,
};

const PLAYERS = [
  { sessionId: P.you, name: "You", connected: true },
  { sessionId: P.alice, name: "Alice", connected: true },
  { sessionId: P.bob, name: "Bob", connected: true },
  { sessionId: P.diana, name: "Diana", connected: true },
];

const LEADER = { sessionId: P.you, name: "You" };

/* Where the room went on one word. Spread out on purpose: this is the picture
   that makes the second clue worth having. */
const AFTER_CLUE_1 = [
  { sessionId: P.alice, name: "Alice", row: 6, col: 2, note: "Guess 1" },
  { sessionId: P.bob, name: "Bob", row: 1, col: 9, note: "Guess 1" },
  { sessionId: P.diana, name: "Diana", row: 5, col: 7, note: "Guess 1" },
];

/* The round the reveal step shows. Bob lands it, Diana and You end up a ring
   out, so the leader banks the average of 5, 3 and 3, which rounds to 4. */
const ROUND_1 = {
  round: 1,
  leaderId: P.alice,
  target: TARGET,
  seed: GRID.seed,
  clue1: "teal",
  clue2: "deep ocean",
  guesses: [
    { sessionId: P.bob, row: 3, col: 5 },
    { sessionId: P.diana, row: 3, col: 6 },
    { sessionId: P.you, row: 4, col: 4 },
  ],
  scores: { [P.bob]: 5, [P.diana]: 3, [P.you]: 3 },
  leaderScore: 4,
};

/* A second round on its own board, so the history has something to open. You
   led it: Alice nails it, Bob is a ring out, Diana never finds it, and the
   average of 5, 3 and 0 rounds to 3. */
const ROUND_2 = {
  round: 2,
  leaderId: P.you,
  target: { row: 6, col: 9 },
  seed: 777,
  clue1: "moss",
  clue2: "forest floor",
  guesses: [
    { sessionId: P.alice, row: 6, col: 9 },
    { sessionId: P.bob, row: 5, col: 8 },
    { sessionId: P.diana, row: 1, col: 2 },
  ],
  scores: { [P.alice]: 5, [P.bob]: 3, [P.diana]: 0 },
  leaderScore: 3,
};

/* You 3+3 = 6, Alice 4+5 = 9, Bob 5+3 = 8, Diana 3+0 = 3. */
const STANDINGS = [
  { sessionId: P.you, name: "You", score: 6, you: true },
  { sessionId: P.alice, name: "Alice", score: 9 },
  { sessionId: P.bob, name: "Bob", score: 8 },
  { sessionId: P.diana, name: "Diana", score: 3 },
];

/* ── Steps ──────────────────────────────────────────────── */

const steps: DemoStep[] = [
  {
    label: "Lobby",
    description: "Everybody joins, and the board is already there to poke at. Press any cell and it stands in for the leader's color, so you can see how the scoring falls around it before it costs anything.",
    hint: "Three players to start. Everyone takes a turn leading, so the game gets longer as people arrive.",
  },
  {
    label: "The clue",
    description: "One player is the leader and only they can see the color. They get one word to point everyone at it.",
    hint: "Hard mode blocks plain color names, so red, teal and rust are all out and the clue has to come at it sideways.",
  },
  {
    label: "Guessing",
    description: "Everyone else presses the cell they think the leader means and locks it in. Close still pays, so a rough guess beats no guess.",
    hint: "Locked in, the board stops taking presses. Move it puts your pick back in your hand.",
  },
  {
    label: "The second clue",
    description: "The leader now sees where the room actually went, and gets a second clue of up to two words to pull them in. Everyone gets one more move after it.",
    hint: "This is the whole reason there is a second clue. A word that scattered everybody tells you a lot.",
  },
  {
    label: "The result",
    description: "The color, everybody standing where they finished, and what that paid. Then it moves itself on and somebody else leads.",
    hint: "The rings are the scoring, drawn on the board you were guessing on.",
  },
  {
    label: "The end",
    description: "Highest total takes it. Every round is kept, so you can open the one you want to argue about and see the board it was played on.",
    hint: "The leader's score is the only one somebody else earns for you.",
  },
  {
    label: "Scoring",
    description: "You score on how many grid steps your pick sits from the color. Diagonals count as one step, so the bands come out as squares around it.",
    hint: "The leader banks the average of every guesser, so a clue the whole room reads well pays you too.",
  },
];

/* ── Component ──────────────────────────────────────────── */

const header = (phase: string, round?: number) => (
  <GameShellHeader
    game="shade"
    title="Shade Signal"
    phases={shadePhases(false)}
    phase={phase}
    code="DEMO"
    isHost
    {...(round ? { round: { current: round, total: 4 } } : {})}
  />
);

export function ShadeDemo({ onClose, initialStep = 0 }: { onClose: () => void; initialStep?: number }) {
  const initialStepRef = useRef(initialStep);
  const [step, setStep] = useState(initialStepRef.current);

  /* The guessing step is playable, because pressing a cell and watching the
     swatch fill in teaches it faster than a caption can. */
  const [picked, setPicked] = useState<{ row: number; col: number } | null>(null);
  const [locked, setLocked] = useState(false);

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="game-page" data-game-theme="shade">
            {header("lobby")}
            <DemoPoint label="Press a cell to pretend it is the color, and the scoring falls out around it">
              <ShadeLobby
                players={PLAYERS}
                sessionId={P.you}
                hostId={P.you}
                sessionById={NAMES}
                settings={SETTINGS}
                grid={GRID}
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
          <div className="game-page" data-game-theme="shade">
            {header("clue1", 1)}
            <DemoPoint label="The leader's view. The ring is the color, and nobody else can see it">
              <ShadeClue
                round={1}
                grid={GRID}
                isLeader
                leader={LEADER}
                target={TARGET}
                value="teal"
                onChange={NOOP}
                onSubmit={(event) => event.preventDefault()}
              />
            </DemoPoint>
          </div>
        );

      case 2:
        return (
          <div className="game-page" data-game-theme="shade">
            {header("guess1", 1)}
            <DemoPoint label="Everybody else. Press a cell, then lock it in">
              <ShadeGuess
                round={1}
                grid={GRID}
                isGuessing
                clue1="teal"
                selected={picked}
                locked={locked}
                lockedCount={locked ? 2 : 1}
                guesserCount={3}
                onSelect={(cell) => setPicked(cell)}
                onLock={() => setLocked(true)}
                onUnlock={() => setLocked(false)}
              />
            </DemoPoint>
          </div>
        );

      case 3:
        return (
          <div className="game-page" data-game-theme="shade">
            {header("clue2", 1)}
            <DemoPoint label="Back to the leader, who can now see where one word sent everybody">
              <ShadeClue
                round={2}
                grid={GRID}
                isLeader
                leader={LEADER}
                target={TARGET}
                clue1="teal"
                guesses={AFTER_CLUE_1}
                value="deep ocean"
                onChange={NOOP}
                onSubmit={(event) => event.preventDefault()}
              />
            </DemoPoint>
          </div>
        );

      case 4:
        return (
          <div className="game-page" data-game-theme="shade">
            {header("reveal", 1)}
            <DemoPoint label="The color, everybody's guesses, and what each of them paid">
              <ShadeResult
                grid={GRID}
                target={TARGET}
                clue1={ROUND_1.clue1}
                clue2={ROUND_1.clue2}
                leader={{ sessionId: P.alice, name: "Alice", points: ROUND_1.leaderScore }}
                players={ROUND_1.guesses.map((guess) => ({
                  sessionId: guess.sessionId,
                  name: NAMES[guess.sessionId] ?? "Someone",
                  guess: { row: guess.row, col: guess.col },
                  points: ROUND_1.scores[guess.sessionId] ?? 0,
                  ...(guess.sessionId === P.you ? { you: true } : {}),
                }))}
              />
            </DemoPoint>
          </div>
        );

      case 5:
        return (
          <div className="game-page" data-game-theme="shade">
            {header("finished")}
            <DemoPoint label="Who took it, and every round on the way there">
              <ShadeGameOver
                players={STANDINGS}
                rounds={[ROUND_1, ROUND_2]}
                grid={{ rows: GRID.rows, cols: GRID.cols }}
                isHost
                onPlayAgain={NOOP}
                onEnd={NOOP}
                onHome={NOOP}
              />
            </DemoPoint>
          </div>
        );

      case 6:
        return (
          <DemoScoring
            columns={["Steps from the color", "Points"]}
            rows={[
              { label: "The cell itself", value: "5" },
              { label: "1 away", value: "3" },
              { label: "2 away", value: "2" },
              { label: "3 away", value: "1" },
              { label: "4 or more away", value: "0" },
            ]}
            rules={[
              { icon: <FiUser size={13} />, title: "The leader's score", text: "The leader banks the average of every guesser that round, rounded." },
              { icon: <FiEdit3 size={13} />, title: "The clues", text: "The first is one word, the second can be two. Hard mode blocks plain color names." },
              { icon: <FiGrid size={13} />, title: "The board", text: "Every round deals its own colors from a fresh seed, so no two boards match." },
              { icon: <FiAward size={13} />, title: "Winning", text: "Everyone leads the same number of rounds, and the highest total takes it." },
            ]}
          />
        );

      default:
        return null;
    }
  };

  return (
    <DemoModal
      title="Shade Signal"
      icon={<GameIcon game="shade" size={20} />}
      color="#f472b6"
      steps={steps}
      currentStep={step}
      onStepChange={setStep}
      onClose={onClose}
    >
      {renderStep()}
    </DemoModal>
  );
}
