import { GameRoster } from "../shared/GameRoster";
import { playerBadges, type PlayerCardProps } from "../shared/PlayerCard";
import { ShadeBands, ShadeGrid, ShadeStage, shadeBandInk, shadeDist, shadeDistLabel, shadeScore, type ShadeCell, type ShadeMarker } from "./ShadeGrid";
import { ShadeClueTag } from "./ShadeClue";
import "../../styles/shade-kit.css";

/**
 * The eight seconds between rounds. Not the end of the game, which is a
 * different screen and a longer story: this one answers the one question
 * everybody is holding, which is where the color actually was and how close
 * they got to it.
 *
 * So it is the same board again, with the answer on it and everyone standing
 * where they finished, and a column of what that was worth. Nothing here is a
 * control. The phase moves itself on, which the clock in the shell header is
 * already counting down, so the only thing this has to say about that is what
 * happens when it does.
 */

/**
 * The guess that actually counted, per player: the second one if they moved
 * after the second clue, otherwise the first.
 *
 * This has to agree with the reveal mutator, which scores `g2 ?? g1`. A
 * results screen that adds up a different guess from the one the server paid
 * for is a results screen that argues with the scoreboard next to it.
 */
export function shadeFinalGuesses(
  guesses: ReadonlyArray<{ sessionId: string; round: 1 | 2; row: number; col: number }>,
): Array<{ sessionId: string; row: number; col: number }> {
  const final = new Map<string, { sessionId: string; row: number; col: number }>();

  for (const guess of guesses) {
    /* Round 2 always wins, and round 1 only lands if nothing is there yet, so
       the order they arrive in does not change the answer. */
    if (guess.round === 2 || !final.has(guess.sessionId)) {
      final.set(guess.sessionId, { sessionId: guess.sessionId, row: guess.row, col: guess.col });
    }
  }

  return [...final.values()];
}

export interface ShadeResultPlayer {
  sessionId: string;
  name: string;
  /** Where they finished. Left off if they never locked one in. */
  guess?: ShadeCell | null;
  points: number;
  you?: boolean;
}

export interface ShadeResultProps {
  grid: { rows: number; cols: number; seed: number };
  /** The color, which by now is everybody's business. */
  target: ShadeCell;
  clue1?: string | null;
  clue2?: string | null;
  /** The guessers. Sorted here, so callers can hand them over in any order. */
  players: ShadeResultPlayer[];
  /** Who set it, and what the room's average paid them. */
  leader: { sessionId: string; name: string; points: number; you?: boolean };
  /** No next round after this one. */
  last?: boolean;
}

export function ShadeResult({ grid, target, clue1, clue2, players, leader, last }: ShadeResultProps) {
  /* Best first. The order a round finished in is the only order this list has
     any reason to be in, and it is the first thing anybody looks for. */
  const ranked = [...players].sort((a, b) => b.points - a.points);

  const markers: ShadeMarker[] = ranked.flatMap((player) => {
    if (!player.guess) return [];
    const dist = shadeDist(player.guess, target);
    const points = shadeScore(dist);

    return [{
      sessionId: player.sessionId,
      name: player.name,
      row: player.guess.row,
      col: player.guess.col,
      note: points > 0 ? `${shadeDistLabel(dist)}, +${points}` : `${shadeDistLabel(dist)}, nothing`,
      ...(player.you ? { you: true } : {}),
    }];
  });

  const cards: PlayerCardProps[] = [
    {
      sessionId: leader.sessionId,
      name: leader.name,
      badges: [playerBadges.leader()],
      points: leader.points,
      pointsSuffix: "pts",
      /* Worth saying, because it is the only score in the game somebody else
         earned for you, and a leader who does not know that reads their own
         number as a mystery. Short, because a caption that runs past the
         card's width explains nothing. */
      caption: "The room's average",
      ...(leader.you ? { you: true } : {}),
    },
    ...ranked.map((player): PlayerCardProps => {
      const dist = player.guess ? shadeDist(player.guess, target) : null;
      const ink = dist === null ? null : shadeBandInk(dist);

      return {
        sessionId: player.sessionId,
        name: player.name,
        points: player.points,
        pointsSuffix: "pts",
        caption: dist === null ? "Never locked one in" : shadeDistLabel(dist),
        /* The same closeness the rings on the board are drawn with, so the
           card and the face it belongs to say the same thing in the same
           color. Out past the last band there is nothing to say. */
        ...(ink ? { accent: `color-mix(in srgb, var(--game-accent) ${Math.round(ink * 100)}%, var(--secondary))` } : {}),
        ...(player.you ? { you: true } : {}),
      };
    }),
  ];

  return (
    <ShadeStage
      rail
      foot={
        <>
          {(clue1 || clue2) && (
            <span className="sk-clues">
              {clue1 && <ShadeClueTag round={1} text={clue1} />}
              {clue2 && <ShadeClueTag round={2} text={clue2} />}
            </span>
          )}

          <GameRoster label="How it went" players={cards} expandable={false} />

          <ShadeBands />

          <p className="sk-stage-hint">
            {last
              ? "That was the last one. Nobody else has to lead, so the scores are final."
              : "The next round starts on its own, with somebody else picking."}
          </p>
        </>
      }
    >
      <ShadeGrid {...grid} target={target} zones markers={markers} />
    </ShadeStage>
  );
}
