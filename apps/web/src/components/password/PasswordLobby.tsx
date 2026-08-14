import type { ReactNode } from "react";
import { FiAward, FiBookOpen, FiCheck, FiClock, FiFlag, FiLock, FiLogIn, FiLogOut, FiMessageSquare, FiPlay, FiSkipForward, FiUnlock, FiUserPlus, FiUsers } from "react-icons/fi";
import { passwordCategoryLabels } from "@games/shared";
import { GameActions, GameButton, GameEmpty, GameFacts, GamePanel } from "../shared/GameKit";
import { GameTeamRoster } from "../shared/GameRoster";
import { playerBadges } from "../shared/PlayerCard";
import type { TeamCardProps } from "../shared/TeamCard";
import type { GamePhase } from "../shared/GameShellHeader";
import { getPasswordPlayerName } from "../../lib/password-names";
import "../../styles/password-kit.css";

/**
 * Password's lobby, out of the same kit Imposter's is built from. Everything is
 * props and callbacks, so /dev/password can drive it with made up teams and the
 * real page can hand it zero's.
 *
 * Nothing new is drawn here. A team is a TeamCard, which already knows how to
 * fold, hold a score, wear a padlock and take a dropped player, so the only
 * password shaped thing in this file is which teams get which of those.
 */

/** Team swatches, in seat order. Same six everywhere a team is coloured. */
export const PASSWORD_TEAM_COLORS = ["#7ecbff", "#a78bfa", "#4ade80", "#f59e0b", "#f87171", "#ec4899"];

/** Both are the server's rules, repeated here so the hint can say what the
 *  start button would have said. */
export const MIN_PASSWORD_TEAMS = 2;
export const MIN_TEAM_PLAYERS = 2;

/** What every team with two players gets handed at the start. Not a setting the
 *  host picks, but it is still something you want to know before you press go. */
export const PASSWORD_SKIPS = 3;

export const PASSWORD_PHASES: GamePhase[] = [
  { id: "lobby", label: "Lobby", icon: <FiUsers />, hint: "Pick a side. Every team needs two, one to clue and one to guess." },
  { id: "playing", label: "Playing", icon: <FiMessageSquare />, hint: "One word clues only. Every team is racing at the same time." },
  { id: "results", label: "Results", icon: <FiAward />, hint: "Somebody hit the target. See how the rounds went." },
];

export type PasswordTeam = { name: string; members: string[] };

export interface PasswordLobbySettings {
  targetScore: number;
  roundDurationSec: number;
  category?: string | undefined;
  teamsLocked?: boolean | undefined;
}

/** 300 seconds is a number you have to do arithmetic on. Five minutes is not. */
export function formatRoundLength(seconds: number) {
  return seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60}m` : `${seconds}s`;
}

/**
 * Why the start button is off, in the words the server would have used. Both
 * checks are the mutator's, in the mutator's order, so the hint never promises
 * a start that would come straight back as an error.
 */
export function passwordStartBlock(teams: PasswordTeam[]): string | undefined {
  const populated = teams.filter((team) => team.members.length > 0);

  if (populated.length < MIN_PASSWORD_TEAMS) {
    return populated.length === 1
      ? "One team has nobody to race. Somebody has to take another side."
      : "Two teams with players, and then it is a game.";
  }

  const short = populated.find((team) => team.members.length < MIN_TEAM_PLAYERS);
  return short ? `${short.name} needs one more. A team of one has nobody to give clues to.` : undefined;
}

/**
 * Teams as cards, for the lobby and for the middle of the game. One builder
 * for both, because a team is the same object either way and the only thing
 * that changes is which of the card's parts are worth switching on.
 *
 * Scores are left off in a lobby on purpose: every team is on zero, and six
 * zeros say nothing the target score in the facts row does not.
 */
export function passwordTeamCards({
  teams,
  sessionId,
  hostId,
  names = {},
  scores,
  targetScore,
  guessers,
  solved = [],
  locked,
  foldOthers,
  onJoinTeam,
  onMovePlayer,
}: {
  teams: PasswordTeam[];
  sessionId: string;
  hostId?: string;
  names?: Record<string, string>;
  /** Given, each card carries its score. Mid game wants this, a lobby does not. */
  scores?: Record<string, number>;
  targetScore?: number;
  /** Team name to whoever is guessing for them this round. */
  guessers?: Record<string, string>;
  /** Teams that just took a word. Marks the card until the next one. */
  solved?: string[];
  locked?: boolean;
  /** Your team opens, the rest sit folded down to their faces and their
   *  score. Mid game that is all you want from somebody else's team. */
  foldOthers?: boolean;
  /** Puts a join button on every team that is not already yours. */
  onJoinTeam?: (teamName: string) => void;
  /** Host only. Lets a player card be dragged onto another team. */
  onMovePlayer?: (playerId: string, teamName: string) => void;
}): TeamCardProps[] {
  const myTeam = teams.find((team) => team.members.includes(sessionId))?.name;

  return teams.map((team, index) => {
    const mine = team.name === myTeam;
    const guesser = guessers?.[team.name];
    /* A team of one cannot play: somebody has to say the clues to somebody.
       Amber is the card's own way of saying not ready yet. */
    const short = team.members.length === 1;

    return {
      name: team.name,
      color: PASSWORD_TEAM_COLORS[index % PASSWORD_TEAM_COLORS.length]!,
      players: team.members.map((id, seat) => ({
        sessionId: id,
        name: getPasswordPlayerName(names, id),
        index: seat,
        ...(id === sessionId ? { you: true } : {}),
        ...(id === hostId ? { host: true } : {}),
        /* The guesser is the one who has to produce the word, so they are the
           one seat on the team worth naming. */
        ...(id === guesser ? { badges: [playerBadges.leader("Guessing")], collapseBadges: true } : {}),
        /* ponytail: drag is the host's only way to move somebody, so it is
           mouse only. Everyone can still move themselves with Join. */
        ...(onMovePlayer ? { movable: true } : {}),
      })),
      ...(mine ? { you: true } : {}),
      ...(locked ? { locked: true } : {}),
      ...(solved.includes(team.name) ? { state: "success" as const } : short ? { state: "waiting" as const } : {}),
      /* The one team fact worth a line. Nobody counts heads, and this is the
         difference between the game starting and not. */
      ...(short ? { caption: "Needs one more" } : {}),
      ...(scores ? { score: scores[team.name] ?? 0 } : {}),
      ...(scores && targetScore ? { scoreSuffix: `/ ${targetScore}` } : {}),
      ...(foldOthers && !mine ? { defaultCollapsed: true } : {}),
      ...(onMovePlayer ? { onDropPlayer: (playerId: string) => onMovePlayer(playerId, team.name) } : {}),
      ...(onJoinTeam && !mine && !locked
        ? {
            action: (
              <GameButton size="sm" variant="ghost" icon={<FiUserPlus />} onClick={() => onJoinTeam(team.name)}>
                {myTeam ? "Move here" : "Join"}
              </GameButton>
            ),
          }
        : {}),
      /* Your own team says so on the card rather than only in a ring, which
         is the difference between noticing and having to work it out. */
      ...(mine && onJoinTeam
        ? {
            footer: (
              <span className="pw-team-note">
                <FiCheck aria-hidden="true" /> You are on this team
              </span>
            ),
          }
        : {}),
      emptyLabel: "Nobody yet",
    };
  });
}

export interface PasswordLobbyProps {
  teams: PasswordTeam[];
  sessionId: string;
  hostId: string;
  /** Names as password already keeps them, from buildPasswordPlayerNames. */
  names?: Record<string, string>;
  settings: PasswordLobbySettings;
  isHost: boolean;
  /** On a team. Someone spectating or following a link is not. */
  inGame: boolean;
  isSpectator?: boolean;
  /** Holds the start button while the mutator is in the air. */
  starting?: boolean;
  onStart: () => void;
  onLeave: () => void;
  onJoin: () => void;
  onJoinTeam?: (teamName: string) => void;
  onMovePlayer?: (playerId: string, teamName: string) => void;
  onToggleLock?: () => void;
  /** Goes in first on the action row, where the visibility toggle lives, so
   *  this component never has to know what zero is. */
  actions?: ReactNode;
}

export function PasswordLobby({
  teams,
  sessionId,
  hostId,
  names,
  settings,
  isHost,
  inGame,
  isSpectator,
  starting,
  onStart,
  onLeave,
  onJoin,
  onJoinTeam,
  onMovePlayer,
  onToggleLock,
  actions,
}: PasswordLobbyProps) {
  const blocked = passwordStartBlock(teams);
  const locked = !!settings.teamsLocked;

  return (
    <>
      <GameTeamRoster
        teams={passwordTeamCards({
          teams,
          sessionId,
          hostId,
          ...(names ? { names } : {}),
          locked,
          /* Locked, the only person who can move anybody is the host, and they
             do it by dragging. */
          ...(inGame && onJoinTeam ? { onJoinTeam } : {}),
          ...(isHost && onMovePlayer ? { onMovePlayer } : {}),
        })}
      />

      <GameFacts
        label="Setup"
        facts={[
          {
            /* The only setting that changes what you will be looking at. */
            value: settings.category ? (passwordCategoryLabels[settings.category] ?? settings.category) : "Anything",
            icon: <FiBookOpen />,
            tone: "var(--game-accent)",
            tooltip: "Where the words get picked from",
          },
          { value: settings.targetScore, label: "to win", icon: <FiFlag />, tooltip: "First team to this many words takes the game" },
          {
            value: formatRoundLength(settings.roundDurationSec),
            label: "a round",
            icon: <FiClock />,
            tooltip: "How long every team gets before the round ends",
          },
          {
            value: PASSWORD_SKIPS,
            label: "skips",
            icon: <FiSkipForward />,
            tooltip: "Words each team can throw away when they are stuck",
          },
        ]}
      />

      {inGame ? (
        <GameActions hint={blocked}>
          {actions}

          {isHost && onToggleLock && (
            <GameButton
              variant="secondary"
              icon={locked ? <FiUnlock /> : <FiLock />}
              onClick={onToggleLock}
            >
              {locked ? "Unlock the teams" : "Lock the teams"}
            </GameButton>
          )}

          {isHost ? (
            <GameButton
              variant="primary"
              icon={<FiPlay />}
              disabled={!!blocked}
              {...(starting ? { loading: true } : {})}
              onClick={onStart}
            >
              Start the game
            </GameButton>
          ) : (
            <span className="gk-actions-note">Waiting for the host to start…</span>
          )}

          <GameButton variant="ghost" icon={<FiLogOut />} onClick={onLeave}>Leave</GameButton>
        </GameActions>
      ) : (
        <GamePanel>
          <GameEmpty
            icon={<FiLogIn />}
            title={isSpectator ? "You are watching this one" : "You are not on a team yet"}
            hint={
              locked
                ? "The host has locked the teams. They can still put you on one."
                : isSpectator
                  ? "Spectators see every team but never get a word. Join to play."
                  : "Join and you land on the emptiest team. You can move before it starts."
            }
            action={<GameButton variant="primary" icon={<FiLogIn />} onClick={onJoin}>Join the game</GameButton>}
          />
        </GamePanel>
      )}
    </>
  );
}
