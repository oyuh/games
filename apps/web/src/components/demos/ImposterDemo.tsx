import { useRef, useState, FormEvent } from "react";
import { FiEdit3, FiEye, FiEyeOff, FiRefreshCw, FiUsers } from "react-icons/fi";
import { DemoModal, DemoPoint, DemoScoring, type DemoStep } from "./DemoModal";
import { ImposterHeader } from "../imposter/ImposterHeader";
import { ImposterPlayersCard } from "../imposter/ImposterPlayersCard";
import { ImposterLobbyActions } from "../imposter/ImposterLobbyActions";
import { ImposterClueSection } from "../imposter/ImposterClueSection";
import { ImposterVoteSection } from "../imposter/ImposterVoteSection";
import { ImposterResultsSection } from "../imposter/ImposterResultsSection";
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

const TALLY: Record<string, number> = { [P.charlie]: 3, [P.diana]: 1, [P.alice]: 1 };

/* ── Steps ──────────────────────────────────────────────── */

const steps: DemoStep[] = [
  {
    label: "Lobby",
    description: "Players join the lobby and wait for the host to start. You need at least 3 players.",
    hint: "Share the room code with friends so they can join!",
  },
  {
    label: "Clues (as Player)",
    description: "You see the secret word and give a one-word clue that proves you know it - without being too obvious.",
    hint: "Be subtle! If your clue is too direct, the imposter can piggyback off it.",
  },
  {
    label: "Clues (as Imposter)",
    description: "The imposter doesn't know the word! They see redacted hints from other clues and must bluff a convincing clue.",
    hint: "Watch the patterns in others' redacted clues and try to blend in.",
  },
  {
    label: "Voting",
    description: "Everyone reviews all the clues side by side and votes on who they think the imposter is.",
    hint: "Look for the vaguest or most off-topic clue - that's usually the imposter!",
  },
  {
    label: "Results",
    description: "Votes are tallied and the imposter is revealed. Did the group catch them, or did they escape?",
    hint: "The imposter wins if no one catches them! Then a new round starts with a different word.",
  },
  {
    label: "Overview",
    description: "Imposter keeps no running score. Each round is settled on its own by the vote, and whoever got the most votes is the one revealed.",
    hint: "That makes every round a fresh start, so a blown round costs you nothing later.",
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
            <ImposterHeader code="DEMO" phase="lobby" currentRound={1} totalRounds={3} phaseEndsAt={null} isHost category="animals" />
            <DemoPoint label="Players waiting in lobby">
              <ImposterPlayersCard players={PLAYERS} sessionId={P.you} sessionById={NAMES} revealRoles={false} />
            </DemoPoint>
            <DemoPoint label="Host starts the game when ready">
              <ImposterLobbyActions canStart isHost playerCount={5} onStart={() => setStep(1)} onLeave={noop} />
            </DemoPoint>
          </div>
        );

      case 1: // Clues - player perspective
        return (
          <div className="game-page" data-game-theme="imposter">
            <ImposterHeader code="DEMO" phase="playing" currentRound={1} totalRounds={3} phaseEndsAt={null} category="animals" />
            <ImposterPlayersCard players={PLAYERS} sessionId={P.you} sessionById={NAMES} revealRoles={false} />
            <DemoPoint label="You see the secret word and submit a clue">
              <ImposterClueSection
                role="player"
                secretWord={SECRET_WORD}
                category="animals"
                clue={clue}
                clueCount={0}
                playerCount={5}
                submitted={false}
                clues={[]}
                sessionId={P.you}
                sessionById={NAMES}
                onClueChange={setClue}
                onSubmit={noop}
              />
            </DemoPoint>
          </div>
        );

      case 2: // Clues - imposter perspective
        return (
          <div className="game-page" data-game-theme="imposter">
            <ImposterHeader code="DEMO" phase="playing" currentRound={1} totalRounds={3} phaseEndsAt={null} category="animals" />
            <ImposterPlayersCard players={PLAYERS} sessionId={P.charlie} sessionById={NAMES} revealRoles={false} />
            <DemoPoint label="The imposter doesn't see the word - only redacted hints!">
              <ImposterClueSection
                role="imposter"
                secretWord={null}
                category="animals"
                clue={clue}
                clueCount={3}
                playerCount={5}
                submitted={false}
                clues={CLUES.filter((c) => c.sessionId !== P.charlie).slice(0, 3)}
                sessionId={P.charlie}
                sessionById={NAMES}
                onClueChange={setClue}
                onSubmit={noop}
              />
            </DemoPoint>
          </div>
        );

      case 3: // Voting
        return (
          <div className="game-page" data-game-theme="imposter">
            <ImposterHeader code="DEMO" phase="voting" currentRound={1} totalRounds={3} phaseEndsAt={null} category="animals" />
            <DemoPoint label="Review all clues and vote for the imposter">
              <ImposterVoteSection
                players={PLAYERS}
                sessionId={P.you}
                sessionById={NAMES}
                voteTarget={voteTarget}
                voteCount={0}
                playerCount={5}
                clues={CLUES}
                submitted={false}
                onVoteTargetChange={setVoteTarget}
                onSubmit={noop}
              />
            </DemoPoint>
          </div>
        );

      case 4: // Results
        return (
          <div className="game-page" data-game-theme="imposter">
            <ImposterHeader code="DEMO" phase="results" currentRound={1} totalRounds={3} phaseEndsAt={null} category="animals" />
            <DemoPoint label="Roles are revealed">
              <ImposterPlayersCard players={PLAYERS} sessionId={P.you} sessionById={NAMES} revealRoles />
            </DemoPoint>
            <DemoPoint label="Vote tally shows who got caught">
              <ImposterResultsSection
                tally={TALLY}
                votes={VOTES}
                players={PLAYERS}
                sessionById={NAMES}
                secretWord={SECRET_WORD}
                phaseEndsAt={null}
                skipVotes={0}
                activePlayerCount={PLAYERS.length}
                hasVotedSkip={false}
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
