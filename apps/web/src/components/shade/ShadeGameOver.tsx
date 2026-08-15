import { FiChevronRight, FiHome, FiPower, FiRotateCcw } from "react-icons/fi";
import { GameActions, GameButton } from "../shared/GameKit";
import { GameRoster } from "../shared/GameRoster";
import { PlayerCard, playerBadges, type PlayerCardProps } from "../shared/PlayerCard";
import { generateGridColor } from "./ColorGrid";
import { ShadeClueTag } from "./ShadeClue";
import {
  ShadeGrid, shadeBandInk, shadeDist, shadeDistLabel, shadeScore,
  type ShadeCell, type ShadeMarker,
} from "./ShadeGrid";
import "../../styles/shade-kit.css";

/**
 * The end of the game: who took it, and every round on the way there.
 *
 * The history is the point of this screen. Nobody argues about the total, they
 * argue about the round where somebody said "ocean" and meant the purples, so
 * each round is here with its board, its clues and where everybody went. It is
 * far too much at once, so a round folds down to its headline and opens to the
 * whole thing. Folded it still answers what you would ask of it.
 *
 * A board only turns up for rounds that recorded the seed they were dealt
 * from. Games finished before that was stored still get their clues and their
 * scores, which is the argument, just not the picture of it.
 */

export interface ShadeStanding {
  sessionId: string;
  name: string;
  score: number;
  you?: boolean;
}

export interface ShadeGameRound {
  round: number;
  /** Who set the color. */
  leaderId: string;
  target: ShadeCell;
  /** What the board looked like. Missing on games from before it was kept. */
  seed?: number | undefined;
  clue1?: string | null;
  clue2?: string | null;
  /** Everyone's final guess, already reduced to the one that scored. */
  guesses: Array<{ sessionId: string; row: number; col: number }>;
  scores: Record<string, number>;
  leaderScore: number;
}

export interface ShadeGameOverProps {
  /** Everyone who played, with their totals. Sorted here. */
  players: ShadeStanding[];
  rounds: ShadeGameRound[];
  /** The board's shape, which never changes across a game. */
  grid: { rows: number; cols: number };
  isHost?: boolean;
  onPlayAgain: () => void;
  onEnd: () => void;
  onHome: () => void;
}

export function ShadeGameOver({
  players,
  rounds,
  grid,
  isHost,
  onPlayAgain,
  onEnd,
  onHome,
}: ShadeGameOverProps) {
  const ranked = [...players].sort((a, b) => b.score - a.score);
  const top = ranked[0]?.score ?? 0;

  /* Everybody on the top score, because a draw is a real result in this game
     and picking one of them to call the winner would be inventing one. */
  const winners = ranked.filter((p) => p.score === top && top > 0);
  const nameOf = (id: string) => players.find((p) => p.sessionId === id)?.name ?? "Someone";

  return (
    <div className="sk-over">
      <section className="sk-verdict">
        <p className="sk-verdict-kicker">
          {winners.length === 0
            ? "nobody scored"
            : winners.length > 1
              ? "it ended level between"
              : "the game goes to"}
        </p>

        {winners.length > 0 && (
          <div className="sk-verdict-faces">
            {winners.map((player) => (
              <PlayerCard
                key={player.sessionId}
                sessionId={player.sessionId}
                name={player.name}
                size="lg"
                points={player.score}
                pointsSuffix="pts"
                {...(player.you ? { you: true } : {})}
              />
            ))}
          </div>
        )}

        <p className="sk-verdict-line">
          {rounds.length === 0
            /* The history below says the same thing in its own words, so this
               one says the consequence rather than repeating the cause. */
            ? "Nothing finished, so there is nothing to add up."
            : `over ${rounds.length} ${rounds.length === 1 ? "round" : "rounds"}, everybody leading`}
        </p>
      </section>

      <GameRoster
        label="Final scores"
        players={ranked.map((player, index): PlayerCardProps => ({
          sessionId: player.sessionId,
          name: player.name,
          index,
          points: player.score,
          pointsSuffix: "pts",
          caption: ordinal(index + 1),
          ...(player.you ? { you: true } : {}),
        }))}
      />

      <section className="sk-history">
        <div className="gk-roster-head">
          <span className="gk-roster-label">Every round</span>
          <span className="gk-roster-count">{rounds.length}</span>
        </div>

        {rounds.length === 0 ? (
          <p className="gk-roster-empty">It ended before a round finished.</p>
        ) : (
          rounds.map((round, i) => {
            /* The best anybody managed, which is the one fact that tells you
               whether the clue worked without opening the round. */
            const best = round.guesses.reduce<{ name: string; dist: number } | null>((won, guess) => {
              const dist = shadeDist(guess, round.target);
              return !won || dist < won.dist ? { name: nameOf(guess.sessionId), dist } : won;
            }, null);

            const markers: ShadeMarker[] = round.guesses.map((guess) => {
              const dist = shadeDist(guess, round.target);
              const points = shadeScore(dist);
              const player = players.find((p) => p.sessionId === guess.sessionId);

              return {
                sessionId: guess.sessionId,
                name: player?.name ?? "Someone",
                row: guess.row,
                col: guess.col,
                note: points > 0 ? `${shadeDistLabel(dist)}, +${points}` : `${shadeDistLabel(dist)}, nothing`,
                ...(player?.you ? { you: true } : {}),
              };
            });

            return (
              /* Native details, so the fold is keyboard and screen reader
                 friendly without a line of state. The last round opens itself,
                 since it is the one that just finished the game. */
              <details key={round.round} className="sk-round" {...(i === rounds.length - 1 ? { open: true } : {})}>
                <summary className="sk-round-head">
                  <span className="sk-round-chevron" aria-hidden="true"><FiChevronRight /></span>

                  <span className="sk-round-n">Round {round.round}</span>

                  <span className="sk-round-swatch-wrap">
                    {/* The color that round was actually about, off the same
                        function the board draws with rather than a second copy
                        of the maths. */}
                    {round.seed !== undefined && (
                      <span
                        className="sk-round-swatch"
                        style={{ background: generateGridColor(round.target.row, round.target.col, grid.rows, grid.cols, round.seed) }}
                        aria-hidden="true"
                      />
                    )}
                  </span>

                  <span className="sk-round-who">{nameOf(round.leaderId)} led</span>

                  <span className="sk-round-best">
                    {best ? <>best was <strong>{best.name}</strong>, {shadeDistLabel(best.dist).toLowerCase()}</> : "nobody guessed"}
                  </span>
                </summary>

                <div className="sk-round-body">
                  {round.seed !== undefined && (
                    <ShadeGrid
                      rows={grid.rows}
                      cols={grid.cols}
                      seed={round.seed}
                      size="sm"
                      target={round.target}
                      zones
                      markers={markers}
                    />
                  )}

                  <div className="sk-round-side">
                    {(round.clue1 || round.clue2) && (
                      <span className="sk-clues">
                        {round.clue1 && <ShadeClueTag round={1} text={round.clue1} />}
                        {round.clue2 && <ShadeClueTag round={2} text={round.clue2} />}
                      </span>
                    )}

                    <GameRoster
                      label="Scored"
                      size="sm"
                      expandable={false}
                      players={[
                        {
                          sessionId: round.leaderId,
                          name: nameOf(round.leaderId),
                          badges: [playerBadges.leader()],
                          points: round.leaderScore,
                          pointsSuffix: "pts",
                        },
                        ...round.guesses
                          .map((guess): PlayerCardProps => {
                            const dist = shadeDist(guess, round.target);
                            const ink = shadeBandInk(dist);

                            return {
                              sessionId: guess.sessionId,
                              name: nameOf(guess.sessionId),
                              points: round.scores[guess.sessionId] ?? 0,
                              pointsSuffix: "pts",
                              ...(ink ? { accent: `color-mix(in srgb, var(--game-accent) ${Math.round(ink * 100)}%, var(--secondary))` } : {}),
                            };
                          })
                          .sort((a, b) => (b.points ?? 0) - (a.points ?? 0)),
                      ]}
                    />
                  </div>
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

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}
