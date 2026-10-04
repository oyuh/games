import { useEffect, useState } from "react";
import { FiAward, FiClock, FiFlag, FiShield } from "react-icons/fi";
import { DemoModal, DemoScoring, type DemoStep } from "../demos/DemoModal";
import { GameIcon } from "../shared/GameIcon";
import { ZipBoard } from "./ZipBoard";
import { DIFFICULTY_CONFIG, RUN_LENGTH, validatePath, type Difficulty, type ZipPuzzle } from "../../lib/zip-engine";
import "../../styles/game-shared.css";

const steps: DemoStep[] = [
  {
    label: "Start on 1",
    description: "Press on the 1 and drag. The line moves up, down, left, or right into the next square, never diagonally.",
    hint: "Try it on the board. Arrow keys work too once it has focus.",
  },
  {
    label: "Numbers in order",
    description: "The line has to pass through 2, then 3, and so on. You can't step onto a number before every lower one is done.",
    hint: "Each stretch between two numbers gets its own color, and a ball's ring shows the two stretches it joins.",
  },
  {
    label: "Fill every square",
    description: "The puzzle is solved when the line covers every square exactly once and ends on the highest number.",
    hint: "Finish this one off. Drag back over the line to back it up.",
  },
  {
    label: "Walls",
    description: "A thick bar between two squares is a wall. The line can't cross it, so it has to go around.",
    hint: "Hard boards lean on walls instead of numbers.",
  },
  {
    label: "Ranked runs",
    description: `A ranked run is ${RUN_LENGTH} puzzles at one difficulty, and your total time is what ranks.`,
    hint: "Each difficulty plays one grid size and has its own leaderboard.",
  },
];

/* A hand-made 4x4: the snake through it is the only answer, and the two walls
   sit on edges the snake never uses, so step 4 is still solvable. */
export const ZIP_DEMO_PUZZLE: ZipPuzzle = {
  size: 4,
  checkpoints: [0, 3, 5, 10, 12],
  walls: [],
  solution: [0, 1, 2, 3, 7, 6, 5, 4, 8, 9, 10, 11, 15, 14, 13, 12],
};
const DEMO = ZIP_DEMO_PUZZLE;
const WALLED: ZipPuzzle = { ...DEMO, walls: [[1, 5], [9, 13]] };

/** Where each step's line starts. The board is live, so you can keep going from there. */
const STARTS = [
  DEMO.solution.slice(0, 2),
  DEMO.solution.slice(0, 9),
  DEMO.solution.slice(0, 13),
  WALLED.solution.slice(0, 5),
];

function DemoBoard({ step }: { step: number }) {
  const puzzle = step === 3 ? WALLED : DEMO;
  const [path, setPath] = useState<number[]>(STARTS[step] ?? []);
  // A new step resets the board to that step's starting line.
  useEffect(() => setPath(STARTS[step] ?? []), [step]);
  const solved = validatePath(puzzle, path);

  return (
    <div className="zip-demo">
      <ZipBoard puzzle={puzzle} path={path} onPathChange={setPath} hint solved={solved} size="sm" />
      <p className="game-section-subtle" style={{ margin: 0 }}>
        {solved ? "Solved. That's the whole game." : "Your turn, the board is live."}
      </p>
    </div>
  );
}

export function ZipDemo({ onClose, initialStep = 0 }: { onClose: () => void; initialStep?: number }) {
  const [step, setStep] = useState(initialStep);

  return (
    <DemoModal
      title="Zip"
      icon={<GameIcon game="zip" size={22} />}
      color="#facc15"
      steps={steps}
      currentStep={step}
      onStepChange={setStep}
      onClose={onClose}
    >
      <div className="game-page" data-game-theme="zip">
        {step === steps.length - 1 ? (
          <DemoScoring
            columns={["Difficulty", "Board"]}
            rows={(Object.keys(DIFFICULTY_CONFIG) as Difficulty[]).map((difficulty) => {
              const { label, size } = DIFFICULTY_CONFIG[difficulty];
              return { label, value: difficulty === "expert" ? `${size}×${size}, random dots` : `${size}×${size}` };
            })}
            rules={[
              { icon: <FiClock size={13} />, title: "Time ranks", text: "Fastest total time wins. The clock only runs while a board is up." },
              { icon: <FiAward size={13} />, title: `${RUN_LENGTH} a run`, text: `A ranked run is ${RUN_LENGTH} puzzles, and each difficulty keeps its own leaderboard.` },
              { icon: <FiFlag size={13} />, title: "Fresh seeds", text: "The server picks a ranked seed when the run starts, so nobody's practiced it." },
              { icon: <FiShield size={13} />, title: "Checked runs", text: "Every line you draw is replayed on the server before your time counts." },
            ]}
          />
        ) : (
          <DemoBoard step={step} />
        )}
      </div>
    </DemoModal>
  );
}
