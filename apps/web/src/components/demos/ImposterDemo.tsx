import { useRef, useState, FormEvent } from "react";
import { FiBookOpen, FiEdit3, FiEye, FiEyeOff, FiRefreshCw, FiUsers } from "react-icons/fi";
import { DemoModal, DemoPoint, DemoScoring, type DemoStep } from "./DemoModal";
import { GameShellHeader, ShellPill } from "../shared/GameShellHeader";
import { IMPOSTER_PHASES, ImposterLobby } from "../imposter/ImposterLobby";
import { ImposterCluePhase } from "../imposter/ImposterClues";
import { ImposterVotePhase } from "../imposter/ImposterVote";
import { ImposterRoundResult } from "../imposter/ImposterRoundResult";
import "../../styles/game-shared.css";

/* ── Fake data ──────────────────────────────────────────── */

const P = {
  you: "demo-you",
  alice: "demo-alice",
  bob: "demo-bob",
  charlie: "demo-charlie",
  diana: "demo-diana",
};

const NAMES: Record<string, string> = {
  [P.you]: "You",
  [P.alice]: "Alice",
  [P.bob]: "Bob",
  [P.charlie]: "Charlie",
  [P.diana]: "Diana",
};

const PLAYERS = Object.values(P).map((id) => ({
  sessionId: id,
  name: NAMES[id]!,
  connected: true,
  role: (id === P.charlie ? "imposter" : "player") as "imposter" | "player",
}));

const SECRET_WORD = "Ocean";

const CLUES = [
  { sessionId: P.you, text: "Waves" },
  { sessionId: P.alice, text: "Beach" },
  { sessionId: P.bob, text: "Tide" },
  { sessionId: P.charlie, text: "Calm" },
  { sessionId: P.diana, text: "Saltwater" },
];

const VOTES = [
  { voterId: P.you, targetId: P.charlie },
  { voterId: P.alice, targetId: P.charlie },
  { voterId: P.bob, targetId: P.diana },
  { voterId: P.charlie, targetId: P.alice },
  { voterId: P.diana, targetId: P.charlie },
];

const SETTINGS = { rounds: 3, imposters: 1, roundDurationSec: 90, clueVisibility: 0.65 };

const HEADER = { game: "imposter", title: "Imposter", phases: IMPOSTER_PHASES, code: "DEMO" } as const;

const BANK = <ShellPill icon={<FiBookOpen />} tooltip="Which word bank this game is drawing from">Animals</ShellPill>;

/* ── Steps ──────────────────────────────────────────────── */

const steps: DemoStep[] = [
  {
    label: "The lobby",
    description: "Everyone joins and waits on the host. Three players minimum, and one of them will not get the word.",
    hint: "Share the code. The room is the whole game.",
  },
  {
    label: "Your clue",
    description: "You get the word. One clue, and it has to prove you know it without handing it over.",
    hint: "Too direct and the imposter just repeats it back at you.",
  },
  {
    label: "Their clue",
    description: "The imposter never sees the word. They get a peek at the clues already in, redacted, and have to write one that fits.",
    hint: "Whatever is showing through is all they have to aim at.",
  },
  {
    label: "Voting",
    description: "Every clue sits on the card you press. Pick whoever you think never saw the word.",
    hint: "The vaguest clue in the room is usually the one written by somebody guessing.",
  },
  {
    label: "Results",
    description: "The votes are counted and the imposter is named. Either the room caught them or they walked it.",
    hint: "Next round is a new word and a new imposter, so nothing carries over.",
  },
  {
    label: "Scoring",
    description: "Imposter keeps no running score. Each round is settled on its own by the vote, and whoever took the most votes is the one revealed.",
    hint: "Every round is a fresh start, so a blown one costs you nothing later.",
  },
];

/* ── Component ──────────────────────────────────────────── */

export function ImposterDemo({ onClose, initialStep = 0 }: { onClose: () => void; initialStep?: number }) {
  const initialStepRef = useRef(initialStep);
  const [step, setStep] = useState(initialStepRef.current);
  const [clue, setClue] = useState("");
  const [voteTarget, setVoteTarget] = useState("");

  const noop = (e?: FormEvent) => e?.preventDefault();

  const renderStep = () => {
    switch (step) {
      case 0: // Lobby
        return (
          <div className="game-page" data-game-theme="imposter">
            <GameShellHeader {...HEADER} phase="lobby" isHost pills={BANK} />
            <DemoPoint label="Players wait in the lobby, and the host starts it">
              <ImposterLobby
                isHost
                inGame
                players={PLAYERS}
                sessionId={P.you}
                hostId={P.you}
                sessionById={NAMES}
                settings={SETTINGS}
                category="animals"
                onStart={() => setStep(1)}
                onLeave={noop}
                onJoin={noop}
              />
            </DemoPoint>
          </div>
        );

      case 1: // Clues - player perspective
        return (
          <div className="game-page" data-game-theme="imposter">
            <GameShellHeader {...HEADER} phase="playing" round={{ current: 1, total: 3 }} pills={BANK} />
            <DemoPoint label="You get the word, and one clue to prove it">
              <ImposterCluePhase
                role="player"
                secretWord={SECRET_WORD}
                category="animals"
                players={PLAYERS}
                clues={CLUES.slice(1, 3)}
                typing={[P.diana]}
                sessionId={P.you}
                sessionById={NAMES}
                clue={clue}
                submitted={false}
                onClueChange={setClue}
                onSubmit={noop}
              />
            </DemoPoint>
          </div>
        );

      case 2: // Clues - imposter perspective
        return (
          <div className="game-page" data-game-theme="imposter">
            <GameShellHeader {...HEADER} phase="playing" round={{ current: 1, total: 3 }} pills={BANK} />
            <DemoPoint label="The imposter never gets the word, only a peek at the clues">
              <ImposterCluePhase
                role="imposter"
                secretWord={null}
                category="animals"
                players={PLAYERS}
                clues={CLUES.filter((c) => c.sessionId !== P.charlie).slice(0, 3)}
                sessionId={P.charlie}
                sessionById={NAMES}
                clueVisibility={0.65}
                clue={clue}
                submitted={false}
                onClueChange={setClue}
                onSubmit={noop}
              />
            </DemoPoint>
          </div>
        );

      case 3: // Voting
        return (
          <div className="game-page" data-game-theme="imposter">
            <GameShellHeader {...HEADER} phase="voting" round={{ current: 1, total: 3 }} pills={BANK} />
            <DemoPoint label="Every clue is on the thing you press">
              <ImposterVotePhase
                players={PLAYERS}
                clues={CLUES}
                sessionId={P.you}
                sessionById={NAMES}
                voted={[P.alice, P.bob]}
                voteTarget={voteTarget}
                onVoteTargetChange={setVoteTarget}
                onSubmit={noop}
              />
            </DemoPoint>
          </div>
        );

      case 4: // Results
        return (
          <div className="game-page" data-game-theme="imposter">
            <GameShellHeader {...HEADER} phase="results" round={{ current: 1, total: 3 }} pills={BANK} />
            <DemoPoint label="Who went, what they were, and which way everyone voted">
              <ImposterRoundResult
                players={PLAYERS}
                votes={VOTES}
                clues={CLUES}
                sessionById={NAMES}
                secretWord={SECRET_WORD}
                skipVotes={1}
                onSkip={noop}
              />
            </DemoPoint>
          </div>
        );

      case 5: // Scoring
        return (
          <DemoScoring
            columns={["What happens", "Who wins the round"]}
            rows={[
              { label: "Imposter takes the most votes", value: "The group" },
              { label: "Anyone else takes the most votes", value: "The imposter" },
            ]}
            rules={[
              { icon: <FiEdit3 size={13} />, title: "Clue rules", text: "One word, and it has to prove you know the secret word without handing it over." },
              { icon: <FiEyeOff size={13} />, title: "Imposter view", text: "The imposter never sees the word. They only get redacted versions of the clues already in." },
              { icon: <FiUsers size={13} />, title: "Players", text: "Three players minimum. Exactly one of them is the imposter each round." },
              { icon: <FiRefreshCw size={13} />, title: "Rounds", text: "Every round picks a new secret word and reshuffles who the imposter is." },
            ]}
          />
        );

      default:
        return null;
    }
  };

  return (
    <DemoModal
      title="Imposter"
      icon={<FiEye size={20} />}
      color="#7eb8ff"
      steps={steps}
      currentStep={step}
      onStepChange={setStep}
      onClose={onClose}
    >
      {renderStep()}
    </DemoModal>
  );
}
