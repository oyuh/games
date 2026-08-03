/**
 * Dev-only floating panel. Off a game it creates bot-hosted games to join; in a
 * game it fills the lobby, makes the bots play, and skips phase timers.
 *
 * Everything routes through the `dev.*` mutators, which call the real game
 * mutators, so nothing here can drift from actual game behaviour. Never
 * rendered outside `import.meta.env.DEV`, and the API refuses `dev.*` in prod.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiChevronDown, FiChevronUp, FiTool } from "react-icons/fi";
import { nanoid } from "nanoid";
import { mutators, queries } from "@games/shared";
import { useQuery, useZero } from "../../lib/zero";
import { useChatContext } from "../../lib/chat-context";
import { getOrCreateSessionId } from "../../lib/session";
import { showToast } from "../../lib/toast";
import "../../styles/dev-tools.css";

type DevGameType = "imposter" | "password" | "chain_reaction" | "shade_signal" | "location_signal";

/** Route slug and the player count each game needs before it can start. */
const GAMES: Array<{ value: DevGameType; label: string; route: string; min: number }> = [
  { value: "imposter", label: "Imposter", route: "imposter", min: 3 },
  { value: "password", label: "Password", route: "password", min: 4 },
  { value: "chain_reaction", label: "Chain", route: "chain", min: 2 },
  { value: "shade_signal", label: "Shade", route: "shade", min: 3 },
  { value: "location_signal", label: "Location", route: "location", min: 2 },
];

const joinFor = {
  imposter: mutators.imposter.join,
  password: mutators.password.join,
  chain_reaction: mutators.chainReaction.join,
  shade_signal: mutators.shadeSignal.join,
  location_signal: mutators.locationSignal.join,
} as const;

/** Chain reaction is turn-based and has no timer to expire. */
const advanceTimerFor = {
  imposter: mutators.imposter.advanceTimer,
  password: mutators.password.advanceTimer,
  shade_signal: mutators.shadeSignal.advanceTimer,
  location_signal: mutators.locationSignal.advanceTimer,
} as const;

const isBot = (sessionId: string) => sessionId.startsWith("bot-");

const POS_KEY = "dev-panel-pos";

/** Keeps enough of the panel on screen to grab, whatever the window is doing. */
function clampPos(next: { x: number; y: number }) {
  return {
    x: Math.min(Math.max(0, next.x), Math.max(0, window.innerWidth - 60)),
    y: Math.min(Math.max(0, next.y), Math.max(0, window.innerHeight - 40)),
  };
}

/**
 * Remembers where you dragged it, clamped so it can never land off-screen.
 * Null means "never dragged": the stylesheet pins it to the bottom-left corner,
 * which stays exact whatever height the panel happens to be.
 */
function usePanelPosition() {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(POS_KEY) ?? "null");
      // Clamp on read too: the window may be smaller now than when this was saved.
      if (saved && typeof saved.x === "number" && typeof saved.y === "number") {
        return clampPos(saved);
      }
    } catch {
      // Corrupt value, fall through to the corner default.
    }
    return null;
  });

  const move = useCallback((next: { x: number; y: number }) => {
    const clamped = clampPos(next);
    setPos(clamped);
    localStorage.setItem(POS_KEY, JSON.stringify(clamped));
  }, []);

  // A window that shrinks below the saved spot would strand the panel.
  useEffect(() => {
    const onResize = () => setPos((current) => (current ? clampPos(current) : null));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return [pos, move] as const;
}

export function DevGamePanel() {
  const { gameType, gameId } = useChatContext();
  const zero = useZero();
  const navigate = useNavigate();
  const sessionId = getOrCreateSessionId();
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newType, setNewType] = useState<DevGameType>("imposter");
  const [newBots, setNewBots] = useState(3);
  const [pos, move] = usePanelPosition();
  const [dragging, setDragging] = useState(false);
  const grab = useRef<{ x: number; y: number } | null>(null);

  // Same one-query-per-game-type shape AppShell uses; hooks can't be conditional.
  const none = { id: "__none__" };
  const [imposter] = useQuery(queries.imposter.byId(gameType === "imposter" ? { id: gameId } : none));
  const [password] = useQuery(queries.password.byId(gameType === "password" ? { id: gameId } : none));
  const [chain] = useQuery(queries.chainReaction.byId(gameType === "chain_reaction" ? { id: gameId } : none));
  const [shade] = useQuery(queries.shadeSignal.byId(gameType === "shade_signal" ? { id: gameId } : none));
  const [location] = useQuery(queries.locationSignal.byId(gameType === "location_signal" ? { id: gameId } : none));

  // The grab offset doubles as the "is dragging" flag. Reading it from a ref
  // rather than state matters: moves that arrive before React re-renders would
  // otherwise see a stale `dragging === false` and be dropped.
  const onPointerDown = (event: React.PointerEvent) => {
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Capture is an optimisation; dragging still works through bubbling.
    }
    const rect = event.currentTarget.parentElement!.getBoundingClientRect();
    grab.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    setDragging(true);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const origin = grab.current;
    if (!origin) return;
    move({ x: event.clientX - origin.x, y: event.clientY - origin.y });
  };

  const endDrag = () => {
    grab.current = null;
    setDragging(false);
  };

  const run = async (label: string, action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      showToast(label, "success");
    } catch (error) {
      showToast(`${label} failed: ${error instanceof Error ? error.message : String(error)}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const game = (gameType === "imposter" ? imposter[0]
    : gameType === "password" ? password[0]
    : gameType === "chain_reaction" ? chain[0]
    : gameType === "shade_signal" ? shade[0]
    : gameType === "location_signal" ? location[0]
    : null) as {
      phase?: string;
      host_id?: string;
      players?: Array<{ sessionId: string }>;
      teams?: Array<{ members: string[] }>;
      spectators?: Array<{ sessionId: string }>;
    } | null;

  const inGame = Boolean(gameType && gameId && game);

  /** Makes a bot-hosted game and joins it, so you are a player and not the host. */
  const createAndJoin = (as: "player" | "spectator") => {
    const meta = GAMES.find((g) => g.value === newType)!;
    // Chain reaction is a strict 1v1, so the bot host is the only other seat.
    const max = newType === "chain_reaction" ? 1 : 8;
    // Spectating means the game must already be running, which needs a full lobby.
    const bots = Math.min(max, Math.max(newBots, as === "spectator" ? meta.min : 1));
    const id = nanoid();

    return run(`Joined as ${as}`, async () => {
      await zero.mutate(mutators.dev.createHosted({ id, gameType: newType, bots })).client;
      // Start before joining: a game past its lobby puts new arrivals in the
      // spectator list, which is exactly the state we want to land in.
      if (as === "spectator") {
        await zero.mutate(mutators.dev.asHost({ gameId: id, gameType: newType, action: "start" })).client;
      }
      await zero.mutate(joinFor[newType]({ gameId: id, sessionId })).client;
      navigate(`/${meta.route}/${id}`);
    });
  };

  const btn = "mshell-action mshell-action--muted";

  return (
    <section
      className="devp"
      data-dragging={dragging ? "" : undefined}
      style={pos ? { left: pos.x, top: pos.y, bottom: "auto" } : undefined}
      aria-label="Dev tools"
    >
      <header
        className="devp-head"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className="devp-grip" aria-hidden="true"><FiTool size={13} /></span>
        <span className="devp-title">Dev</span>
        <button
          type="button"
          className="devp-collapse"
          aria-label={open ? "Collapse dev tools" : "Expand dev tools"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <FiChevronDown size={13} /> : <FiChevronUp size={13} />}
        </button>
      </header>

      {open && (inGame ? (
        <DevInGame
          btn={btn}
          busy={busy}
          run={run}
          zero={zero}
          gameId={gameId}
          gameType={gameType as DevGameType}
          game={game!}
          sessionId={sessionId}
        />
      ) : (
        <div className="devp-body">
          <div className="devp-row">
            <select
              className="devp-select devp-grow"
              aria-label="Game to create"
              value={newType}
              onChange={(e) => setNewType(e.target.value as DevGameType)}
            >
              {GAMES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
            <select
              className="devp-select"
              aria-label="Number of bots"
              value={newBots}
              onChange={(e) => setNewBots(Number(e.target.value))}
            >
              {[1, 2, 3, 5, 8].map((n) => <option key={n} value={n}>{n} bot{n === 1 ? "" : "s"}</option>)}
            </select>
          </div>
          <div className="devp-row">
            <button type="button" className={`${btn} devp-grow`} disabled={busy} onClick={() => void createAndJoin("player")}>
              Join as player
            </button>
            <button type="button" className={`${btn} devp-grow`} disabled={busy} onClick={() => void createAndJoin("spectator")}>
              As spectator
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

/** The in-game half: status chips then one flat set of buttons. */
function DevInGame({
  btn, busy, run, zero, gameId, gameType, game, sessionId,
}: {
  btn: string;
  busy: boolean;
  run: (label: string, action: () => Promise<unknown>) => Promise<void>;
  zero: ReturnType<typeof useZero>;
  gameId: string;
  gameType: DevGameType;
  game: {
    phase?: string;
    host_id?: string;
    players?: Array<{ sessionId: string }>;
    teams?: Array<{ members: string[] }>;
    spectators?: Array<{ sessionId: string }>;
  };
  sessionId: string;
}) {
  const meta = GAMES.find((g) => g.value === gameType)!;
  const memberIds = gameType === "password"
    ? (game.teams ?? []).flatMap((team) => team.members)
    : (game.players ?? []).map((p) => p.sessionId);
  const botCount = memberIds.filter(isBot).length;
  const missing = Math.max(0, meta.min - memberIds.length);
  const hostIsBot = isBot(game.host_id ?? "");
  const amSpectator = (game.spectators ?? []).some((s) => s.sessionId === sessionId);

  const fill = (count: number) =>
    run(`Added ${count} bot${count === 1 ? "" : "s"}`, () =>
      zero.mutate(mutators.dev.fillLobby({ gameId, gameType, count })).client
    );

  const asHost = (label: string, action: "start" | "kick" | "removeSpectator" | "endGame", targetId?: string) =>
    run(label, () => zero.mutate(mutators.dev.asHost({ gameId, gameType, action, targetId })).client);

  return (
    <div className="devp-body">
      <div className="devp-meta">
        <span className="devp-chip">{game.phase ?? "?"}</span>
        <span className="devp-chip"><strong>{memberIds.length}</strong> in, <strong>{botCount}</strong> bot</span>
        <span className="devp-chip">{amSpectator ? "spectating" : game.host_id === sessionId ? "host" : "player"}</span>
      </div>

      <div className="devp-row">
        <button type="button" className={btn} disabled={busy} onClick={() => void fill(1)}>+1</button>
        <button type="button" className={btn} disabled={busy} onClick={() => void fill(3)}>+3</button>
        <button type="button" className={`${btn} devp-grow`} disabled={busy || missing === 0} onClick={() => void fill(missing)}>
          Fill ({missing})
        </button>
      </div>

      <div className="devp-row">
        <button
          type="button"
          className={`${btn} devp-grow`}
          disabled={busy}
          onClick={() => void run("Bots acted", () => zero.mutate(mutators.dev.botAct({ gameId, gameType })).client)}
        >
          Bots act
        </button>
        <button
          type="button"
          className={`${btn} devp-grow`}
          disabled={busy || gameType === "chain_reaction"}
          title={gameType === "chain_reaction" ? "Chain reaction has no phase timer" : undefined}
          onClick={() => void run("Phase skipped", async () => {
            // Expire the timer, then let the game's own advanceTimer do the
            // transition so phase logic lives in exactly one place.
            await zero.mutate(mutators.dev.expirePhase({ gameId, gameType })).client;
            const advance = gameType === "chain_reaction" ? null : advanceTimerFor[gameType];
            if (advance) await zero.mutate(advance({ gameId })).client;
          })}
        >
          Skip phase
        </button>
      </div>

      {/* Only a bot host can be puppeted; when you host, use the real controls. */}
      <div className="devp-row">
        <button type="button" className={btn} disabled={busy || !hostIsBot} onClick={() => void asHost("Host started", "start")}>
          Start
        </button>
        <button
          type="button"
          className={btn}
          disabled={busy || !hostIsBot}
          onClick={() => void asHost(
            amSpectator ? "Removed you" : "Kicked you",
            amSpectator ? "removeSpectator" : "kick",
            sessionId,
          )}
        >
          {amSpectator ? "Remove me" : "Kick me"}
        </button>
        <button type="button" className={btn} disabled={busy || !hostIsBot} onClick={() => void asHost("Host ended it", "endGame")}>
          End
        </button>
        <button
          type="button"
          className={`${btn} devp-grow`}
          disabled={busy || botCount === 0}
          onClick={() => void run("Bots removed", () => zero.mutate(mutators.dev.clearBots({ gameId, gameType })).client)}
        >
          Clear bots
        </button>
      </div>
    </div>
  );
}
