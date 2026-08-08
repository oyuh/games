import type { CSSProperties } from "react";
import { FiSkipForward, FiZap } from "react-icons/fi";
import { GameButton } from "../shared/GameKit";
import { PlayerAvatar } from "../shared/PlayerAvatar";
import { getDisplayName } from "../../lib/session";
import type { ImposterPlayer } from "./ImposterLobby";
import "../../styles/imposter.css";

/**
 * What the vote did, between rounds. Not the end of the game, just the beat
 * after a vote lands.
 *
 * It gets about eight seconds before the next round takes the screen, so it is
 * built as one beat rather than a page: a face, then the answer, then the
 * numbers underneath for anyone still reading. The old version put four panels
 * up and expected them read in the time it takes to say "wait, what?".
 *
 * The reveal is a hold, not a page load. The face lands first and the verdict
 * arrives a second later, because being told who went and what they were at
 * the same instant is not a reveal, it is a receipt.
 */

export interface ImposterVote {
  voterId: string;
  targetId: string;
}

export interface ImposterRoundResultProps {
  /** Everyone still in when the vote happened, roles included. */
  players: ImposterPlayer[];
  votes: ImposterVote[];
  sessionById?: Record<string, string>;
  /** This round's word. The next round draws a new one, so it is safe to say. */
  secretWord?: string | null;
  /** How many have asked to move on, out of how many could. */
  skipVotes?: number;
  /** Off for a spectator or anyone already out: they cannot hurry the room. */
  canSkip?: boolean;
  hasVotedSkip?: boolean;
  onSkip: () => void;
}

export function ImposterRoundResult({
  players,
  votes,
  sessionById = {},
  secretWord,
  skipVotes = 0,
  canSkip = true,
  hasVotedSkip,
  onSkip,
}: ImposterRoundResultProps) {
  const nameOf = (player: ImposterPlayer) =>
    sessionById[player.sessionId] ?? getDisplayName(player.name, player.sessionId);

  /* A vote is two ids, so the name has to be looked up. The player list is a
     better source than the session table's fallback, which invents a name
     from the id for anyone it has not heard of. */
  const nameById = (id: string) => {
    const player = players.find((p) => p.sessionId === id);
    return player ? nameOf(player) : (sessionById[id] ?? getDisplayName(null, id));
  };

  const tally = votes.reduce<Record<string, number>>((acc, vote) => {
    acc[vote.targetId] = (acc[vote.targetId] ?? 0) + 1;
    return acc;
  }, {});

  const top = Math.max(...Object.values(tally), 0);
  /* The server takes the first of a tie, so read it the same way here rather
     than picking a different winner than the one about to be eliminated. */
  const topIds = Object.entries(tally).filter(([, n]) => n === top && top > 0).map(([id]) => id);
  const outId = topIds[0] ?? null;
  const out = outId ? players.find((p) => p.sessionId === outId) : null;
  const wasImposter = out?.role === "imposter";
  const tied = topIds.length > 1;

  const ranked = [...players].sort((a, b) => (tally[b.sessionId] ?? 0) - (tally[a.sessionId] ?? 0));

  return (
    <div className="imp-result-block">
      <section className={`imp-result${out ? (wasImposter ? " imp-result--imposter" : " imp-result--innocent") : " imp-result--nobody"}`}>
        {out ? (
          <>
            <span className="imp-result-face">
              <PlayerAvatar seed={out.sessionId} />
            </span>

            <p className="imp-result-name">{nameOf(out)}</p>
            <p className="imp-result-kicker">
              voted out{tied && <> on a tie at {top}</>}
            </p>

            <p className="imp-result-verdict">
              {wasImposter && <span className="imp-result-verdict-icon" aria-hidden="true"><FiZap /></span>}
              {wasImposter ? "was the imposter" : "was innocent"}
            </p>
          </>
        ) : (
          <>
            <p className="imp-result-name">Nobody went</p>
            <p className="imp-result-kicker">not a single vote landed</p>
            <p className="imp-result-verdict">the imposter is still in</p>
          </>
        )}

        {secretWord && (
          <p className="imp-result-word">
            the word was <strong>{secretWord}</strong>
          </p>
        )}
      </section>

      <div className="imp-tally">
        {ranked.map((player, i) => {
          const count = tally[player.sessionId] ?? 0;
          const voters = votes
            .filter((v) => v.targetId === player.sessionId)
            .map((v) => nameById(v.voterId));
          /* Who they went for. The bar only ever showed votes coming in, so
             reading a row told you nothing about what that player did. */
          const theirVote = votes.find((v) => v.voterId === player.sessionId);

          return (
            <div
              key={player.sessionId}
              className={`imp-tally-row${player.sessionId === outId ? " imp-tally-row--out" : ""}`}
              style={{
                "--imp-bar": `${top > 0 ? (count / top) * 100 : 0}%`,
                "--imp-delay": `${1.05 + i * 0.06}s`,
              } as CSSProperties}
            >
              <span className="imp-tally-face">
                <PlayerAvatar seed={player.sessionId} />
              </span>

              <span className="imp-tally-name">{nameOf(player)}</span>

              <span className="imp-tally-track">
                <span className="imp-tally-bar" />
              </span>

              <span className="imp-tally-count">{count}</span>

              <span className="imp-tally-meta">
                {theirVote
                  ? <>voted <strong>{nameById(theirVote.targetId)}</strong></>
                  : <span className="imp-tally-quiet">did not vote</span>}

                {voters.length > 0 && (
                  <>
                    <span className="imp-tally-sep" aria-hidden="true" />
                    <span>picked by {voters.join(", ")}</span>
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {canSkip && (
        <div className="imp-result-foot">
          <GameButton
            variant={hasVotedSkip ? "ghost" : "primary"}
            icon={<FiSkipForward />}
            disabled={hasVotedSkip}
            onClick={onSkip}
            full
          >
            {hasVotedSkip ? `Waiting on the rest (${skipVotes} of ${players.length})` : `Skip ahead (${skipVotes} of ${players.length})`}
          </GameButton>

          <p className="imp-result-foot-note">
            The next round starts on its own. This only hurries it, and it takes everyone.
          </p>
        </div>
      )}
    </div>
  );
}
