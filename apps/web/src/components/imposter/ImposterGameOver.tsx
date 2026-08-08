import { FiChevronRight, FiHome, FiPower, FiRotateCcw, FiZap } from "react-icons/fi";
import { GameActions, GameButton } from "../shared/GameKit";
import { GameRoster } from "../shared/GameRoster";
import { PlayerAvatar } from "../shared/PlayerAvatar";
import { playerBadges } from "../shared/PlayerCard";
import { getDisplayName } from "../../lib/session";
import { ImposterTally, type ImposterVote } from "./ImposterRoundResult";
import type { ImposterPlayer } from "./ImposterLobby";
import "../../styles/imposter.css";

/**
 * The end of the game: who won, who was who, and everything that happened on
 * the way there.
 *
 * The history is the point of this screen. Nobody argues about the score, they
 * argue about round three, so every round is here in full. It is also far too
 * much to put on one page at once, so each round is folded down to its
 * headline and opens to the whole thing.
 *
 * Folded, a round still says everything you would ask of it: which round, what
 * the word was, who went and what they turned out to be. Opening it adds what
 * everyone said and which way they voted. The fold hides the detail, never the
 * answer.
 */

export interface ImposterRoundHistory {
  round: number;
  /** Readable. The stored one may be encrypted, so decrypt before passing. */
  secretWord: string | null;
  votedOutId: string | null;
  wasImposter: boolean;
  clues: Array<{ sessionId: string; text: string }>;
  votes: ImposterVote[];
}

export interface ImposterGameOverProps {
  /** Everyone who played, roles revealed, eliminated flags intact. */
  players: ImposterPlayer[];
  rounds: ImposterRoundHistory[];
  sessionId: string;
  sessionById?: Record<string, string>;
  isHost?: boolean;
  onPlayAgain: () => void;
  onEnd: () => void;
  onHome: () => void;
}

export function ImposterGameOver({
  players,
  rounds,
  sessionId,
  sessionById = {},
  isHost,
  onPlayAgain,
  onEnd,
  onHome,
}: ImposterGameOverProps) {
  const nameOf = (player: ImposterPlayer) =>
    sessionById[player.sessionId] ?? getDisplayName(player.name, player.sessionId);

  const imposters = players.filter((p) => p.role === "imposter");
  const survived = imposters.filter((p) => !p.eliminated);
  const playersWin = survived.length === 0;

  /* Who was still in for a given round. A player is in until the round they
     were voted out of, which the history already records, so nothing extra
     has to be carried through the game to work this out. */
  const outAt = new Map<string, number>();
  for (const round of rounds) {
    if (round.votedOutId) outAt.set(round.votedOutId, round.round);
  }
  const activeIn = (round: number) => players.filter((p) => (outAt.get(p.sessionId) ?? Infinity) >= round);

  const caughtIn = rounds.find((r) => r.wasImposter)?.round ?? null;

  return (
    <div className="imp-over">
      <section className={`imp-result imp-result--final${playersWin ? " imp-result--innocent" : " imp-result--imposter"}`}>
        <span className="imp-over-faces">
          {imposters.map((p) => (
            <span key={p.sessionId} className="imp-result-face">
              <PlayerAvatar seed={p.sessionId} />
            </span>
          ))}
        </span>

        <p className="imp-result-kicker">
          {imposters.length > 1 ? "the imposters were" : "the imposter was"}
        </p>
        <p className="imp-result-name">{imposters.map(nameOf).join(" and ") || "nobody"}</p>

        <p className="imp-result-verdict">
          <span className="imp-result-verdict-icon" aria-hidden="true"><FiZap /></span>
          {playersWin ? "and the room got them" : "and they got away with it"}
        </p>

        <p className="imp-result-word">
          {playersWin
            ? caughtIn
              ? <>caught in round <strong>{caughtIn}</strong> of {rounds.length}</>
              : <>after <strong>{rounds.length}</strong> {rounds.length === 1 ? "round" : "rounds"}</>
            : <>after <strong>{rounds.length}</strong> {rounds.length === 1 ? "round" : "rounds"}</>}
        </p>
      </section>

      <GameRoster
        label="Who was who"
        size="sm"
        /* Nobody is greyed out here. Being eliminated stops mattering the
           moment the game ends, and the imposter is usually the one who went,
           so the fade was hiding the one player everybody wants to look at.
           The round they left is said instead. */
        players={players.map((player, index) => ({
          sessionId: player.sessionId,
          name: nameOf(player),
          index,
          ...(player.sessionId === sessionId ? { you: true } : {}),
          ...(player.role === "imposter" ? { badges: [playerBadges.imposter()] } : {}),
          ...(outAt.has(player.sessionId) ? { caption: `out in round ${outAt.get(player.sessionId)}` } : {}),
        }))}
      />

      <section className="imp-history">
        <div className="gk-roster-head">
          <span className="gk-roster-label">How it went</span>
          <span className="gk-roster-count">{rounds.length}</span>
        </div>

        {rounds.length === 0 ? (
          <p className="gk-roster-empty">It ended before a round finished.</p>
        ) : (
          rounds.map((round, i) => {
            const out = round.votedOutId ? players.find((p) => p.sessionId === round.votedOutId) : null;
            const tone = !out ? "nobody" : round.wasImposter ? "imposter" : "innocent";

            return (
              /* Native details, so the fold is keyboard and screen reader
                 friendly without a line of state. The last round opens itself,
                 since it is the one that just decided the game. */
              <details
                key={round.round}
                className={`imp-round imp-round--${tone}`}
                {...(i === rounds.length - 1 ? { open: true } : {})}
              >
                <summary className="imp-round-head">
                  <span className="imp-round-chevron" aria-hidden="true"><FiChevronRight /></span>

                  <span className="imp-round-n">Round {round.round}</span>

                  <span className="imp-round-word">{round.secretWord ?? "••••"}</span>

                  <span className="imp-round-outcome">
                    {out
                      ? <><strong>{nameOf(out)}</strong> went, {round.wasImposter ? "the imposter" : "innocent"}</>
                      : "nobody went"}
                  </span>
                </summary>

                <div className="imp-round-body">
                  <ImposterTally
                    players={activeIn(round.round)}
                    votes={round.votes}
                    clues={round.clues}
                    sessionById={sessionById}
                    outId={round.votedOutId ?? null}
                  />
                </div>
              </details>
            );
          })
        )}
      </section>

      <GameActions>
        {isHost ? (
          <>
            <GameButton variant="primary" icon={<FiRotateCcw />} onClick={onPlayAgain}>Run it back</GameButton>
            <GameButton variant="danger" icon={<FiPower />} onClick={onEnd}>End the game</GameButton>
          </>
        ) : (
          <GameButton variant="secondary" icon={<FiHome />} onClick={onHome}>Back home</GameButton>
        )}
      </GameActions>
    </div>
  );
}
