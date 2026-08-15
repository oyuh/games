import { useRef, useState, type FormEvent } from "react";
import { FiBookOpen, FiEdit3, FiFlag, FiShield, FiUsers, FiZap } from "react-icons/fi";
import { DemoModal, DemoPoint, DemoScoring, type DemoStep } from "./DemoModal";
import { GameShellHeader, ShellPill } from "../shared/GameShellHeader";
import { PASSWORD_PHASES, PasswordLobby, type PasswordTeam } from "../password/PasswordLobby";
import { PasswordRound, type PasswordClue, type PasswordGuess } from "../password/PasswordRound";
import { PasswordGameOver, type PasswordWordHistory } from "../password/PasswordGameOver";
import "../../styles/game-shared.css";

/**
 * How to play Password, drawn with the game's own components.
 *
 * This used to be a hand copy of the real screens, which is exactly why it
 * went stale the moment the real screens changed. Every panel below is the
 * component the game actually renders, handed made up data and no callbacks,
 * so the tutorial cannot show you something the game no longer does.
 */

/* ── Fake data ──────────────────────────────────────────── */

const P = {
  you: "demo-you",
  alice: "demo-alice",
  bob: "demo-bob",
  charlie: "demo-charlie",
};

const NAMES: Record<string, string> = {
  [P.you]: "You",
  [P.alice]: "Alice",
  [P.bob]: "Bob",
  [P.charlie]: "Charlie",
};

const NOOP = () => {};

const TEAMS: PasswordTeam[] = [
  { name: "Team A", members: [P.you, P.alice] },
  { name: "Team B", members: [P.bob, P.charlie] },
];

const SETTINGS = { targetScore: 5, roundDurationSec: 300, category: "food" };

const SCORES: Record<string, number> = { "Team A": 2, "Team B": 1 };

const T0 = Date.now() - 30_000;

/* One word being worked out, the way it actually goes: a clue, a guess off the
   back of it, and then the word. */
const CLUES: PasswordClue[] = [
  { id: "c1", sessionId: P.you, text: "keys", ts: T0, clueNumber: 1 },
];

const GUESSES: PasswordGuess[] = [
  { id: "g1", sessionId: P.alice, text: "Organ", ts: T0 + 4_000, correct: false, guessNumber: 1 },
];

const HISTORY: PasswordWordHistory[] = [
  {
    roundId: "h1", round: 1, teamIndex: 0, guesserId: P.alice, word: "Piano",
    guessCount: 1, points: 3,
    clues: [{ id: "h1c1", sessionId: P.you, text: "keys", ts: T0, clueNumber: 1 }],
    guesses: [{ id: "h1g1", sessionId: P.alice, text: "Piano", ts: T0 + 2_000, correct: true, guessNumber: 1 }],
  },
  {
    roundId: "h2", round: 2, teamIndex: 1, guesserId: P.charlie, word: "Sunset",
    guessCount: 2, points: 2,
    clues: [
      { id: "h2c1", sessionId: P.bob, text: "evening", ts: T0 + 8_000, clueNumber: 1 },
      { id: "h2c2", sessionId: P.bob, text: "orange", ts: T0 + 14_000, clueNumber: 2 },
    ],
    guesses: [
      { id: "h2g1", sessionId: P.charlie, text: "Sunrise", ts: T0 + 11_000, correct: false, guessNumber: 1 },
      { id: "h2g2", sessionId: P.charlie, text: "Sunset", ts: T0 + 16_000, correct: true, guessNumber: 2 },
    ],
  },
];

/* ── Steps ──────────────────────────────────────────────── */

const steps: DemoStep[] = [
  {
    label: "The lobby",
    description: "Pick a side before the host starts. Every team needs two: one to give clues and one to guess.",
    hint: "The host can lock the teams, and drag anybody onto a different one.",
  },
  {
    label: "Giving clues",
    description: "You can see the word. Send one-word clues and watch the answers land in the box beside yours.",
    hint: "The number of guesses your team has used is what the word is still worth.",
  },
  {
    label: "Guessing",
    description: "You cannot see the word, only the clues arriving. Type what you think it is.",
    hint: "Both boxes are on screen the whole time, because your team is not taking turns.",
  },
  {
    label: "The end",
    description: "First team to the target takes it. Every word opens up to the clues and guesses that got there.",
    hint: "The word that ended it opens itself.",
  },
  {
    label: "Scoring",
    description: "A team banks points the moment its guesser lands the word, and how many depends only on how many guesses it took.",
    hint: "Nailing it first try is worth triple a slow solve, so a sharp clue pays for itself.",
  },
];

/* ── Component ──────────────────────────────────────────── */

const header = (phase: string) => (
  <GameShellHeader
    game="password"
    title="Password"
    phases={PASSWORD_PHASES}
    phase={phase}
    code="DEMO"
    isHost
    pills={<ShellPill icon={<FiBookOpen />} tooltip="Which word bank this game is drawing from">Food</ShellPill>}
  />
);

export function PasswordDemo({ onClose, initialStep = 0 }: { onClose: () => void; initialStep?: number }) {
  const initialStepRef = useRef(initialStep);
  const [step, setStep] = useState(initialStepRef.current);
  const [clue, setClue] = useState("");
  const [guess, setGuess] = useState("");

  const stop = (event: FormEvent) => event.preventDefault();

  const round = {
    category: SETTINGS.category,
    teamMembers: TEAMS[0]!.members,
    guesserId: P.alice,
    clues: CLUES,
    guesses: GUESSES,
    names: NAMES,
    teams: TEAMS,
    scores: SCORES,
    targetScore: SETTINGS.targetScore,
    guessers: { "Team A": P.alice, "Team B": P.charlie },
    onSubmit: stop,
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="game-page" data-game-theme="password">
            {header("lobby")}
            <DemoPoint label="Two a side, and the host presses go">
              <PasswordLobby
                teams={TEAMS}
                sessionId={P.you}
                hostId={P.you}
                names={NAMES}
                settings={SETTINGS}
                isHost
                inGame
                onStart={NOOP}
                onLeave={NOOP}
                onJoin={NOOP}
                onJoinTeam={NOOP}
              />
            </DemoPoint>
          </div>
        );

      case 1:
        return (
          <div className="game-page" data-game-theme="password">
            {header("playing")}
            <DemoPoint label="You have the word. One word back is all you get">
              <PasswordRound
                {...round}
                role="clue"
                word="Piano"
                sessionId={P.you}
                value={clue}
                skipsRemaining={2}
                onChange={setClue}
                onSkip={NOOP}
              />
            </DemoPoint>
          </div>
        );

      case 2:
        return (
          <div className="game-page" data-game-theme="password">
            {header("playing")}
            <DemoPoint label="No word, just the clues coming in">
              <PasswordRound
                {...round}
                role="guess"
                word={null}
                sessionId={P.alice}
                value={guess}
                skipsRemaining={2}
                onChange={setGuess}
                onSkip={NOOP}
              />
            </DemoPoint>
          </div>
        );

      case 3:
        return (
          <div className="game-page" data-game-theme="password">
            {header("results")}
            <DemoPoint label="Who took it, and every word on the way there">
              <PasswordGameOver
                teams={TEAMS}
                scores={{ "Team A": 5, "Team B": 3 }}
                targetScore={SETTINGS.targetScore}
                rounds={HISTORY}
                names={NAMES}
                sessionId={P.you}
                hostId={P.you}
                isHost
                onPlayAgain={NOOP}
                onEnd={NOOP}
                onHome={NOOP}
              />
            </DemoPoint>
          </div>
        );

      case 4:
        return (
          <DemoScoring
            columns={["Guesses your team used", "Points"]}
            rows={[
              { label: "Solved on the first guess", value: "3" },
              { label: "Solved on the second guess", value: "2" },
              { label: "Solved on the third or later", value: "1" },
              { label: "Skipped the word", value: "0" },
            ]}
            rules={[
              { icon: <FiEdit3 size={13} />, title: "Clue rules", text: "One word per clue, and it can't be a near-copy of a clue already given." },
              { icon: <FiUsers size={13} />, title: "Teams", text: "Every team needs at least two players: someone giving clues and someone guessing." },
              { icon: <FiZap size={13} />, title: "All at once", text: "Teams don't wait their turn. Every team works its own word at the same time." },
              { icon: <FiFlag size={13} />, title: "Winning", text: "The first team to reach the target score ends the game." },
            ]}
          />
        );

      default:
        return null;
    }
  };

  return (
    <DemoModal
      title="Password"
      icon={<FiShield size={20} />}
      color="#a78bfa"
      steps={steps}
      currentStep={step}
      onStepChange={setStep}
      onClose={onClose}
    >
      {renderStep()}
    </DemoModal>
  );
}
