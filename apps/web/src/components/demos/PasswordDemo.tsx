import { useState, FormEvent } from "react";
import { FiShield } from "react-icons/fi";
import { DemoModal, DemoGlow, type DemoStep } from "./DemoModal";
import { PasswordHeader } from "../password/PasswordHeader";
import { PasswordTeamGrid } from "../password/PasswordTeamGrid";
import { PasswordActiveRound } from "../password/PasswordActiveRound";
import { PasswordRoundsTable } from "../password/PasswordRoundsTable";

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

const TEAMS = [
  { name: "Red", members: [P.you, P.alice] },
  { name: "Blue", members: [P.bob, P.charlie] },
];

const SCORES_ZERO: Record<string, number> = { Red: 0, Blue: 0 };
const SCORES_MID: Record<string, number> = { Red: 2, Blue: 1 };

const ROUND_CLUE_PHASE = {
  teamIndex: 0,
  guesserId: P.alice,
  word: "Piano",
  clues: [] as Array<{ sessionId: string; text: string }>,
  guess: null as string | null,
};

const ROUND_GUESS_PHASE = {
  ...ROUND_CLUE_PHASE,
  clues: [{ sessionId: P.you, text: "Keys" }],
};

const ROUNDS_HISTORY = [
  { round: 1, teamIndex: 0, guesserId: P.alice, word: "Piano", clues: [{ sessionId: P.you, text: "Keys" }], guess: "Piano", correct: true },
  { round: 2, teamIndex: 1, guesserId: P.charlie, word: "Sunset", clues: [{ sessionId: P.bob, text: "Evening" }], guess: "Sunrise", correct: false },
  { round: 3, teamIndex: 1, guesserId: P.charlie, word: "Sunset", clues: [{ sessionId: P.bob, text: "Horizon" }], guess: "Sunset", correct: true },
];

/* ── Steps ──────────────────────────────────────────────── */

const steps: DemoStep[] = [
  {
    label: "Team Lobby",
    description: "Pick a team before the host starts. Each team needs at least 2 players — one to give clues and one to guess.",
    hint: "The host can lock teams and move players between them.",
  },
  {
    label: "Give Clues",
    description: "Clue givers see the secret word and each submit a one-word clue. The guesser waits and can't see the word.",
    hint: "Make your clue descriptive but not too obvious — only one word allowed!",
  },
  {
    label: "Guess the Word",
    description: "Once all clues are in, the guesser sees them and tries to guess the secret word.",
    hint: "If the guess is wrong, the team goes again with new clues for the same word.",
  },
  {
    label: "Scoring & Results",
    description: "Correct guesses earn a point. All teams play simultaneously — first team to the target score wins!",
    hint: "Check the round history at the bottom to see every word, clue, and guess.",
  },
];

/* ── Component ──────────────────────────────────────────── */

export function PasswordDemo({ onClose, initialStep = 0 }: { onClose: () => void; initialStep?: number }) {
  const [step, setStep] = useState(initialStep);
  const [clue, setClue] = useState("");
  const [guess, setGuess] = useState("");

  const noop = (e?: FormEvent) => e?.preventDefault();

  const renderStep = () => {
    switch (step) {
      case 0: // Lobby
        return (
          <div className="game-page" data-game-theme="password">
            <PasswordHeader title="Password" code="DEMO" phase="lobby" isHost category="food" />
            <DemoGlow label="Join a team before the game starts">
              <PasswordTeamGrid
                teams={TEAMS}
                scores={SCORES_ZERO}
                names={NAMES}
                activeTeamIndex={undefined}
                sessionId={P.you}
                isLobby
                isHost
              />
            </DemoGlow>
          </div>
        );

      case 1: // Clue giver phase
        return (
          <div className="game-page" data-game-theme="password">
            <PasswordHeader title="Password" code="DEMO" phase="playing" currentRound={1} category="food" />
            <PasswordTeamGrid
              teams={TEAMS}
              scores={SCORES_MID}
              names={NAMES}
              activeTeamIndex={0}
              sessionId={P.you}
              showScores
              targetScore={5}
            />
            <DemoGlow label="You see the secret word — type a one-word clue">
              <PasswordActiveRound
                activeRound={ROUND_CLUE_PHASE}
                names={NAMES}
                sessionId={P.you}
                teamMembers={TEAMS[0]!.members}
                clue={clue}
                guess=""
                skipsRemaining={2}
                onClueChange={setClue}
                onGuessChange={() => {}}
                onSubmitClue={noop}
                onSubmitGuess={noop}
                onSkip={noop}
              />
            </DemoGlow>
          </div>
        );

      case 2: // Guesser phase
        return (
          <div className="game-page" data-game-theme="password">
            <PasswordHeader title="Password" code="DEMO" phase="playing" currentRound={1} category="food" />
            <PasswordTeamGrid
              teams={TEAMS}
              scores={SCORES_MID}
              names={NAMES}
              activeTeamIndex={0}
              sessionId={P.alice}
              showScores
              targetScore={5}
            />
            <DemoGlow label="The guesser sees the clues and types a guess">
              <PasswordActiveRound
                activeRound={ROUND_GUESS_PHASE}
                names={NAMES}
                sessionId={P.alice}
                teamMembers={TEAMS[0]!.members}
                clue=""
                guess={guess}
                skipsRemaining={2}
                onClueChange={() => {}}
                onGuessChange={setGuess}
                onSubmitClue={noop}
                onSubmitGuess={noop}
                onSkip={noop}
              />
            </DemoGlow>
          </div>
        );

      case 3: // Results
        return (
          <div className="game-page" data-game-theme="password">
            <PasswordHeader title="Password" code="DEMO" phase="results" currentRound={3} category="food" />
            <DemoGlow label="Final scores — first to the target wins">
              <PasswordTeamGrid
                teams={TEAMS}
                scores={SCORES_MID}
                names={NAMES}
                activeTeamIndex={undefined}
                sessionId={P.you}
                showScores
                targetScore={5}
              />
            </DemoGlow>
            <DemoGlow label="Full round history with all words, clues, and guesses">
              <PasswordRoundsTable rounds={ROUNDS_HISTORY} teams={TEAMS} names={NAMES} defaultOpen />
            </DemoGlow>
          </div>
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
