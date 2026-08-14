import { FiAward, FiChevronRight, FiHome, FiPower, FiRotateCcw } from "react-icons/fi";
import { GameActions, GameButton } from "../shared/GameKit";
import { GameTeamRoster } from "../shared/GameRoster";
import { getPasswordPlayerName } from "../../lib/password-names";
import { PASSWORD_TEAM_COLORS, passwordTeamCards, type PasswordTeam } from "./PasswordLobby";
import { PasswordStream, type PasswordClue, type PasswordGuess } from "./PasswordRound";
import "../../styles/password-kit.css";

/**
 * The end of the game: who took it, and every word on the way there.
 *
 * The history is the point of this screen. Nobody argues about the score, they
 * argue about the word they were one guess away from, so every word is here in
 * full. It is also far too much to put on one page at once, so each one folds
 * down to its headline and opens to the whole exchange.
 *
 * Folded, a word still answers everything you would ask of it: which team took
 * it, what it was, who got it, in how many and for how much. Opening it adds
 * what was actually said. The fold hides the detail, never the answer.
 */

/** One word somebody took, as the game recorded it. */
export interface PasswordWordHistory {
  roundId: string;
  round: number;
  teamIndex: number;
  guesserId: string;
  /** Readable. The stored one may be encrypted, so decrypt before passing. */
  word: string | null;
  clues: PasswordClue[];
  guesses: PasswordGuess[];
  guessCount: number;
  points: number;
}

export interface PasswordGameOverProps {
  teams: PasswordTeam[];
  scores: Record<string, number>;
  targetScore: number;
  /** Every word taken, in the order they were taken. */
  rounds: PasswordWordHistory[];
  names?: Record<string, string>;
  sessionId: string;
  hostId?: string;
  isHost?: boolean;
  onPlayAgain: () => void;
  onEnd: () => void;
  onHome: () => void;
}

export function PasswordGameOver({
  teams,
  scores,
  targetScore,
  rounds,
  names = {},
  sessionId,
  hostId,
  isHost,
  onPlayAgain,
  onEnd,
  onHome,
}: PasswordGameOverProps) {
  const ranked = [...teams].sort((a, b) => (scores[b.name] ?? 0) - (scores[a.name] ?? 0));
  const top = scores[ranked[0]?.name ?? ""] ?? 0;
  /* Nobody wins on nothing. A game that ended before anyone scored has no
     winner rather than a six way tie. */
  const winners = top > 0 ? ranked.filter((team) => (scores[team.name] ?? 0) === top) : [];
  const tie = winners.length > 1;
  const mine = teams.find((team) => team.members.includes(sessionId))?.name;
  const won = !!mine && winners.some((team) => team.name === mine);

  const colorOf = (index: number) => PASSWORD_TEAM_COLORS[index % PASSWORD_TEAM_COLORS.length]!;

  return (
    <div className="pw-over">
      <section className={`pw-verdict${winners.length === 0 ? " pw-verdict--none" : won ? " pw-verdict--yours" : ""}`}>
        <span className="pw-verdict-swatches" aria-hidden="true">
          {winners.map((team) => (
            <span
              key={team.name}
              className="pw-verdict-swatch"
              style={{ background: colorOf(teams.indexOf(team)) }}
            />
          ))}
        </span>

        <p className="pw-verdict-kicker">{tie ? "it ended level" : winners.length === 0 ? "nobody got going" : "the game goes to"}</p>

        <p className="pw-verdict-name">
          {winners.length === 0 ? "no one" : winners.map((team) => team.name).join(" and ")}
        </p>

        <p className="pw-verdict-line">
          <span className="pw-verdict-icon" aria-hidden="true"><FiAward /></span>
          {winners.length === 0
            ? <>not a word between them</>
            : <><strong>{top}</strong> of {targetScore}, off <strong>{rounds.length}</strong> {rounds.length === 1 ? "word" : "words"}</>}
        </p>
      </section>

      <GameTeamRoster
        label="Final"
        teams={passwordTeamCards({
          teams: ranked,
          sessionId,
          scores,
          targetScore,
          ...(hostId ? { hostId } : {}),
          names,
          /* The winner is the one card worth marking. Everyone else stays
             plain: a losing team is not an error state. */
          solved: winners.map((team) => team.name),
        })}
      />

      <section className="pw-history">
        <div className="gk-roster-head">
          <span className="gk-roster-label">Every word</span>
          <span className="gk-roster-count">{rounds.length}</span>
        </div>

        {rounds.length === 0 ? (
          <p className="gk-roster-empty">It ended before anybody took one.</p>
        ) : (
          [...rounds].reverse().map((entry, i) => {
            const team = teams[entry.teamIndex];

            return (
              /* Native details, so the fold is keyboard and screen reader
                 friendly without a line of state. The last word taken opens
                 itself, since it is the one that just ended the game. */
              <details
                key={entry.roundId}
                className="pw-past"
                style={{ ["--pw-team" as string]: colorOf(entry.teamIndex) }}
                {...(i === 0 ? { open: true } : {})}
              >
                <summary className="pw-past-head">
                  <span className="pw-past-chevron" aria-hidden="true"><FiChevronRight /></span>
                  <span className="pw-past-swatch" aria-hidden="true" />
                  <span className="pw-past-word">{entry.word ?? "••••"}</span>

                  <span className="pw-past-who">
                    <strong>{getPasswordPlayerName(names, entry.guesserId)}</strong>
                    {team ? ` · ${team.name}` : ""}
                  </span>

                  <span className="pw-past-count">in {entry.guessCount}</span>
                  <span className="pw-past-points">+{entry.points}</span>
                </summary>

                <div className="pw-past-body">
                  <PasswordStream clues={entry.clues} guesses={entry.guesses} names={names} />
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
