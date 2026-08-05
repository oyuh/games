import { useState } from "react";
import { FiArrowRight, FiCheck, FiLock, FiUnlock, FiX } from "react-icons/fi";
import { PlayerCard, playerBadges, type PlayerCardSize } from "../components/shared/PlayerCard";
import { PlayerHoverCard } from "../components/shared/PlayerHoverCard";
import { TeamCard } from "../components/shared/TeamCard";
import "../styles/game-shared.css";

/**
 * Every player card state on one page. This is the place to eyeball a change
 * to PlayerCard before it lands in five games at once.
 */

const CAST = [
  { sessionId: "seed-ada", name: "Ada" },
  { sessionId: "seed-bram", name: "Bram" },
  { sessionId: "seed-cleo", name: "Cleo" },
  { sessionId: "seed-dov", name: "Dov" },
  { sessionId: "seed-esme", name: "Esme with a very long name" },
  { sessionId: "seed-finn", name: "Finn" },
];

const BLUE = "#7ecbff";
const RED = "#f87171";
const GREEN = "#34d399";

const TEAMS = [
  { name: "Blue Team", color: BLUE },
  { name: "Red Team", color: RED },
  { name: "Green Team", color: GREEN },
];

/**
 * The host's view of the teams: drag a player onto another team to move them,
 * flip a padlock to close one, or close the lot. Locked teams refuse drops,
 * so the only way to fill one is to open it again.
 */
function HostTeams() {
  const [roster, setRoster] = useState<Record<string, string[]>>({
    "Blue Team": ["seed-ada", "seed-bram"],
    "Red Team": ["seed-cleo", "seed-dov"],
    "Green Team": ["seed-esme"],
  });
  const [locks, setLocks] = useState<Record<string, boolean>>({ "Red Team": true });

  const allLocked = TEAMS.every((t) => locks[t.name]);

  function move(to: string, sessionId: string) {
    setRoster((prev) => {
      if (prev[to]?.includes(sessionId)) return prev;
      const next: Record<string, string[]> = {};
      for (const [team, ids] of Object.entries(prev)) next[team] = ids.filter((id) => id !== sessionId);
      next[to] = [...(next[to] ?? []), sessionId];
      return next;
    });
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.5rem" }}>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ fontSize: "0.72rem", padding: "0.3rem 0.6rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
          onClick={() => setLocks(allLocked ? {} : Object.fromEntries(TEAMS.map((t) => [t.name, true])))}
        >
          {allLocked ? <FiUnlock size={12} /> : <FiLock size={12} />}
          {allLocked ? "Unlock all teams" : "Lock all teams"}
        </button>
      </div>

      <div className="tc-grid">
        {TEAMS.map((team) => (
          <TeamCard
            key={team.name}
            name={team.name}
            color={team.color}
            collapsible
            locked={!!locks[team.name]}
            onToggleLock={() => setLocks((prev) => ({ ...prev, [team.name]: !prev[team.name] }))}
            onDropPlayer={(sessionId) => move(team.name, sessionId)}
            score={roster[team.name]?.length ?? 0}
            scoreSuffix="here"
            caption={locks[team.name] ? "Locked" : "Drop a player here"}
            emptyLabel={locks[team.name] ? "Locked" : "Drag someone over"}
            players={(roster[team.name] ?? []).map((id) => {
              const player = CAST.find((p) => p.sessionId === id)!;
              return { ...player, index: CAST.indexOf(player), movable: true };
            })}
          />
        ))}
      </div>
    </>
  );
}

function Row({ title, note, grid = "pc-grid", children }: { title: string; note?: string; grid?: string; children: React.ReactNode }) {
  return (
    <section className="game-section">
      <h3 className="game-section-label">{title}</h3>
      {note && <p className="game-section-subtle">{note}</p>}
      <div className={grid}>{children}</div>
    </section>
  );
}

export function PlayerCardsPage() {
  const sizes: PlayerCardSize[] = ["sm", "md", "lg"];

  return (
    <main className="game-page" data-game-theme="imposter" style={{ display: "flex", flexDirection: "column", gap: "1.5rem", padding: "2rem 1rem", margin: "0 auto" }}>
      <header>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, letterSpacing: "0.04em" }}>Player cards</h1>
        <p className="game-section-subtle">Shared across every multiplayer game. Sizes, states, badges, points.</p>
      </header>

      <Row title="States" note="default, waiting on an answer, got it right, got it wrong">
        <PlayerCard {...CAST[0]!} index={0} />
        <PlayerCard {...CAST[1]!} index={1} state="waiting" caption="Still typing" />
        <PlayerCard {...CAST[2]!} index={2} state="success" caption="Locked in" points={3} />
        <PlayerCard {...CAST[3]!} index={3} state="error" caption="Wrong guess" points={0} />
      </Row>

      <Row title="Sizes" note="sm for dense lists, md for lobbies, lg for duels">
        {sizes.map((size, index) => (
          <PlayerCard
            key={size}
            {...CAST[index]!}
            index={index}
            size={size}
            you={size === "md"}
            caption="Ready"
            points={12}
            pointsSuffix="pts"
            badges={[playerBadges.host()]}
          />
        ))}
      </Row>

      <Row title="Badges">
        <PlayerCard {...CAST[0]!} index={0} badges={[playerBadges.imposter()]} state="error" />
        <PlayerCard {...CAST[1]!} index={1} badges={[playerBadges.leader()]} />
        <PlayerCard {...CAST[2]!} index={2} badges={[playerBadges.team("Blue Team", "#7ecbff")]} points={4} pointsSuffix="/ 7" />
        <PlayerCard {...CAST[3]!} index={3} badges={[playerBadges.team("Red Team", "#f87171")]} points={6} pointsSuffix="/ 7" />
        <PlayerCard {...CAST[4]!} index={4} badges={[playerBadges.host(), playerBadges.leader()]} />
        <PlayerCard {...CAST[5]!} index={5} badges={[playerBadges.spectator()]} />
      </Row>

      <Row title="Edge states">
        <PlayerCard {...CAST[0]!} index={0} disconnected caption="Dropped out" />
        <PlayerCard {...CAST[1]!} index={1} eliminated badges={[playerBadges.out()]} />
        <PlayerCard {...CAST[2]!} index={2} selected caption="Your vote" onClick={() => {}} />
        <PlayerCard
          {...CAST[3]!}
          index={3}
          action={<button type="button" aria-label="Kick"><FiX size={13} /></button>}
        />
      </Row>

      <Row title="Condensed lobby">
        {CAST.map((player, index) => (
          <PlayerCard
            key={player.sessionId}
            {...player}
            index={index}
            size="sm"
            you={index === 0}
            state={index % 3 === 1 ? "waiting" : index % 3 === 2 ? "success" : "default"}
            points={index * 2}
          />
        ))}
      </Row>

      <Row title="Duel">
        <PlayerCard {...CAST[0]!} index={0} size="lg" you points={7} pointsSuffix="pts" state="success" caption="3 of 5 solved" />
        <PlayerCard {...CAST[1]!} index={1} size="lg" points={5} pointsSuffix="pts" state="waiting" caption="1 of 5 solved" />
      </Row>

      <Row title="Teams" note="the roster is player cards at sm, so a team is just a card of cards" grid="tc-grid">
        <TeamCard
          name="Blue Team"
          color={BLUE}
          score={4}
          scoreSuffix="/ 7"
          you
          selected
          state="waiting"
          caption="Guessing now"
          badges={[playerBadges.team("Their turn", BLUE)]}
          players={[
            { ...CAST[0]!, index: 0, you: true, badges: [playerBadges.leader()] },
            { ...CAST[1]!, index: 1, state: "waiting", caption: "Typing" },
            { ...CAST[2]!, index: 2 },
          ]}
          footer={<span className="game-hint" style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.7rem" }}><FiCheck size={12} /> You're on this team</span>}
        />
        <TeamCard
          name="Red Team"
          color={RED}
          score={6}
          scoreSuffix="/ 7"
          players={[
            { ...CAST[3]!, index: 3 },
            { ...CAST[4]!, index: 4 },
          ]}
          action={<button type="button" aria-label="Teams locked"><FiLock size={12} /></button>}
          footer={<button className="btn btn-ghost" type="button" style={{ fontSize: "0.72rem", padding: "0.3rem 0.6rem" }}><FiArrowRight size={12} /> Join Red Team</button>}
        />
        <TeamCard name="Green Team" color="#34d399" score={0} scoreSuffix="/ 7" players={[]} />
      </Row>

      <Row title="Teams, collapsible" note="the chevron folds a roster down to its faces, so a long lobby stays scannable" grid="tc-grid">
        <TeamCard
          collapsible
          name="Blue Team"
          color={BLUE}
          score={4}
          scoreSuffix="/ 7"
          you
          caption="Guessing now"
          players={CAST.slice(0, 3).map((p, i) => ({ ...p, index: i }))}
        />
        <TeamCard
          collapsible
          defaultCollapsed
          name="Red Team"
          color={RED}
          score={6}
          scoreSuffix="/ 7"
          caption="Starts folded"
          players={CAST.map((p, i) => ({ ...p, index: i }))}
        />
        <TeamCard collapsible name="Green Team" color="#34d399" score={0} scoreSuffix="/ 7" players={[]} />
      </Row>

      <Row title="Hover card, faces" note="one face on the board, the whole card on hover. for the shade grid and the signal map" grid="ph-row">
        <PlayerHoverCard {...CAST[0]!} index={0} you badges={[playerBadges.host()]} points={12} pointsSuffix="pts" caption="Ready" />
        <PlayerHoverCard {...CAST[1]!} index={1} state="waiting" caption="Still picking" />
        <PlayerHoverCard {...CAST[2]!} index={2} state="success" caption="Signalled" points={3} badges={[playerBadges.leader()]} />
        <PlayerHoverCard {...CAST[3]!} index={3} state="error" caption="Wrong colour" points={0} />
        <PlayerHoverCard {...CAST[4]!} index={4} disconnected caption="Dropped out" />
        <PlayerHoverCard {...CAST[5]!} index={5} eliminated badges={[playerBadges.out()]} />
      </Row>

      <Row title="Hover card, names" note="the same card behind a list of names. for end screens and round history" grid="ph-names">
        <PlayerHoverCard trigger="name" {...CAST[0]!} index={0} you points={12} pointsSuffix="pts" badges={[playerBadges.host()]} caption="Won the round" />
        <PlayerHoverCard trigger="name" {...CAST[1]!} index={1} points={9} pointsSuffix="pts" badges={[playerBadges.team("Blue Team", BLUE)]} />
        <PlayerHoverCard trigger="name" {...CAST[2]!} index={2} points={7} pointsSuffix="pts" state="success" caption="Got it in 12s" />
        <PlayerHoverCard trigger="name" {...CAST[3]!} index={3} points={4} pointsSuffix="pts" badges={[playerBadges.team("Red Team", RED)]} />
        <PlayerHoverCard trigger="name" {...CAST[4]!} index={4} points={2} pointsSuffix="pts" badges={[playerBadges.imposter()]} state="error" />
        <PlayerHoverCard trigger="name" {...CAST[5]!} index={5} eliminated points={0} pointsSuffix="pts" badges={[playerBadges.out()]} />
      </Row>

      <section className="game-section">
        <h3 className="game-section-label">Teams, host controls</h3>
        <p className="game-section-subtle">drag a player onto another team to move them, flip a padlock to close one</p>
        <HostTeams />
      </section>

      <Row title="Teams, condensed" note="faces instead of a roster, for headers and sidebars" grid="tc-grid">
        <TeamCard condensed name="Blue Team" color={BLUE} score={4} scoreSuffix="/ 7" you state="success" caption="Got it in 12s" players={CAST.slice(0, 3).map((p, i) => ({ ...p, index: i }))} />
        <TeamCard condensed name="Red Team" color={RED} score={6} scoreSuffix="/ 7" caption="Up next" players={CAST.map((p, i) => ({ ...p, index: i }))} />
        <TeamCard condensed name="Green Team" color="#34d399" score={2} scoreSuffix="/ 7" state="error" players={CAST.slice(2, 4).map((p, i) => ({ ...p, index: i + 2 }))} />
      </Row>
    </main>
  );
}
