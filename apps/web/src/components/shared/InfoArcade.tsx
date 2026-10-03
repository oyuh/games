import { GAME_META, type GameSlug } from "@games/shared";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { GameIcon } from "./GameIcon";
import { PlayerAvatar } from "./PlayerAvatar";
import { paletteAt, useAvatarLook } from "../../lib/avatar";
import "../../styles/arcade.css";

/**
 * The info modal's easter egg: Space turns it into Snake or Invaders. Both are
 * drawn with the site's own pieces, the game icons as the things you eat or
 * shoot and the player's avatar as the player, in plain DOM so they look the
 * same as everywhere else. State lives in a ref and a frame loop re-renders.
 */

export type ArcadeGame = "snake" | "invaders";

const GAMES: GameSlug[] = ["imposter", "password", "chain", "shade", "location", "shikaku", "pips", "zip"];

type Phase = "ready" | "playing" | "over" | "won";

/** Runs `step(dtMs)` every animation frame while `running`, re-rendering after each. */
function useFrameLoop(running: boolean, step: (dt: number) => void) {
  const [, setFrame] = useState(0);
  const stepRef = useRef(step);
  stepRef.current = step;

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      // Clamped so a frame that arrives late (a hidden tab, a GC pause)
      // can't teleport anything through a wall.
      const dt = Math.min(now - last, 50);
      last = now;
      stepRef.current(dt);
      setFrame((n) => n + 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);
}

/** Window keys while mounted. Keys the game uses don't scroll the modal. */
function useKeys(onDown: (key: string) => boolean, onUp?: (key: string) => void) {
  const downRef = useRef(onDown);
  const upRef = useRef(onUp);
  downRef.current = onDown;
  upRef.current = onUp;

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (downRef.current(event.key.toLowerCase())) event.preventDefault();
    };
    const up = (event: KeyboardEvent) => upRef.current?.(event.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);
}

function randomInt(max: number) {
  return Math.floor(Math.random() * max);
}

function Overlay({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="arcade-overlay">
      <p className="arcade-overlay-title">{title}</p>
      <p className="arcade-overlay-text">{children}</p>
      <p className="arcade-overlay-keys">
        <kbd>Space</kbd> to play <span aria-hidden="true">·</span> <kbd>Esc</kbd> to go back
      </p>
    </div>
  );
}

export function InfoArcade({ game, seed }: { game: ArcadeGame; seed: string }) {
  // The board takes focus so Space never lands on whatever button opened the modal.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), [game]);

  return (
    <div ref={ref} className="arcade" tabIndex={-1} role="application" aria-label={game === "snake" ? "Snake" : "Invaders"}>
      {game === "snake" ? <Snake seed={seed} /> : <Invaders seed={seed} />}
    </div>
  );
}

/* ── Snake ────────────────────────────────────────────────── */

const COLS = 20;
const ROWS = 14;
const SERVINGS = 2;
const SNAKE_TARGET = GAMES.length * SERVINGS;

type Cell = { x: number; y: number };

type SnakeState = {
  body: Cell[];
  dir: Cell;
  /** Turns pressed faster than the snake steps, played one per step. */
  turns: Cell[];
  food: Cell;
  /** Every game SERVINGS times, shuffled. The next one up is menu[eaten.length]. */
  menu: GameSlug[];
  eaten: GameSlug[];
  elapsed: number;
};

const sameCell = (a: Cell) => (b: Cell) => a.x === b.x && a.y === b.y;

function freeCell(body: Cell[]): Cell {
  // The snake tops out at 19 of 280 cells, so a retry loop ends fast.
  for (;;) {
    const cell = { x: randomInt(COLS), y: randomInt(ROWS) };
    if (!body.some(sameCell(cell))) return cell;
  }
}

function newSnake(): SnakeState {
  const body = [{ x: 6, y: 7 }, { x: 5, y: 7 }, { x: 4, y: 7 }];
  const menu = GAMES.flatMap((game) => Array<GameSlug>(SERVINGS).fill(game));
  for (let i = menu.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [menu[i], menu[j]] = [menu[j]!, menu[i]!];
  }
  return { body, dir: { x: 1, y: 0 }, turns: [], food: freeCell(body), menu, eaten: [], elapsed: 0 };
}

const SNAKE_DIRS: Record<string, Cell> = {
  arrowup: { x: 0, y: -1 }, w: { x: 0, y: -1 },
  arrowdown: { x: 0, y: 1 }, s: { x: 0, y: 1 },
  arrowleft: { x: -1, y: 0 }, a: { x: -1, y: 0 },
  arrowright: { x: 1, y: 0 }, d: { x: 1, y: 0 },
};

function cellStyle({ x, y }: Cell): CSSProperties {
  return {
    left: `${(x / COLS) * 100}%`,
    top: `${(y / ROWS) * 100}%`,
    width: `${100 / COLS}%`,
    height: `${100 / ROWS}%`,
  };
}

function Snake({ seed }: { seed: string }) {
  const [phase, setPhase] = useState<Phase>("ready");
  const state = useRef<SnakeState>(newSnake());
  const avatar = useMemo(() => <PlayerAvatar seed={seed} />, [seed]);
  // The body wears the avatar's own color pair, so the snake matches its head.
  const { fg, bg } = paletteAt(useAvatarLook(seed).color);

  useKeys((key) => {
    if (key === " ") {
      if (phase !== "playing") {
        state.current = newSnake();
        setPhase("playing");
      }
      return true;
    }
    const dir = SNAKE_DIRS[key];
    if (!dir) return false;
    const s = state.current;
    const last = s.turns.at(-1) ?? s.dir;
    // No reversing into your own neck, and no stacking the same turn twice.
    if (s.turns.length < 2 && dir.x !== -last.x && dir.y !== -last.y) s.turns.push(dir);
    return true;
  });

  useFrameLoop(phase === "playing", (dt) => {
    const s = state.current;
    s.elapsed += dt;
    const interval = Math.max(80, 150 - s.eaten.length * 4);
    while (s.elapsed >= interval) {
      s.elapsed -= interval;
      s.dir = s.turns.shift() ?? s.dir;
      const head = { x: s.body[0]!.x + s.dir.x, y: s.body[0]!.y + s.dir.y };
      const eating = head.x === s.food.x && head.y === s.food.y;
      // The tail moves out of the way this step unless the snake is growing.
      const rest = eating ? s.body : s.body.slice(0, -1);
      if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS || rest.some(sameCell(head))) {
        setPhase("over");
        return;
      }
      s.body = [head, ...rest];
      if (eating) {
        s.eaten.push(s.menu[s.eaten.length]!);
        if (s.eaten.length === SNAKE_TARGET) {
          setPhase("won");
          return;
        }
        s.food = freeCell(s.body);
      }
    }
  });

  const s = state.current;
  const next = s.menu[s.eaten.length];
  const [head, ...tail] = s.body;

  return (
    <>
      <div className="arcade-hud">
        <div className="arcade-tray">
          {GAMES.map((game) => {
            const count = s.eaten.filter((eaten) => eaten === game).length;
            return (
              <span key={game} className="arcade-tray-item" data-count={count} title={GAME_META[game].title}>
                <GameIcon game={game} size={14} color={GAME_META[game].accent} />
              </span>
            );
          })}
        </div>
        <span className="arcade-score">{s.eaten.length}/{SNAKE_TARGET}</span>
      </div>

      <div className="arcade-board arcade-board--snake" style={{ "--snake-fg": fg, "--snake-bg": bg } as CSSProperties}>
        {tail.map((cell, index) => (
          <span
            key={index}
            className="snake-seg"
            style={{ ...cellStyle(cell), "--seg-mix": `${100 - (index / tail.length) * 45}%` } as CSSProperties}
          />
        ))}
        {next && phase !== "won" && (
          <span className="snake-food" style={cellStyle(s.food)}>
            <GameIcon game={next} size="72%" color={GAME_META[next].accent} />
          </span>
        )}
        {head && <span className="snake-head" style={cellStyle(head)}>{avatar}</span>}

        {phase === "ready" && <Overlay title="Snake">Eat every game twice. Arrows or WASD to steer.</Overlay>}
        {phase === "over" && <Overlay title="Game over">You ate {s.eaten.length} of {SNAKE_TARGET}.</Overlay>}
        {phase === "won" && <Overlay title="Full plate">You ate every game. Twice.</Overlay>}
      </div>
    </>
  );
}

/* ── Invaders ─────────────────────────────────────────────── */

// The field is 100 x 75 units and everything below is in those units,
// rendered as percentages so the board scales with the modal.
const FIELD_W = 100;
const FIELD_H = 75;
const ALIEN = 6;
const ALIEN_ROWS = 3;
const ALIEN_GAP_X = 10;
const ALIEN_GAP_Y = 8;
const PLAYER = 6;
const PLAYER_Y = FIELD_H - PLAYER - 2;
const SHOT_W = 0.8;
const SHOT_H = 2.6;
const LIVES = 3;

type Alien = { game: GameSlug; col: number; row: number; alive: boolean };
type Shot = { x: number; y: number; vy: number; color: string };
type Pop = { x: number; y: number; game: GameSlug; age: number };

type InvadersState = {
  aliens: Alien[];
  /** Formation's top-left corner. */
  ox: number;
  oy: number;
  dirX: 1 | -1;
  px: number;
  shots: Shot[];
  pops: Pop[];
  lives: number;
  cooldown: number;
  enemyClock: number;
  /** Seconds the player blinks after a hit, untouchable. */
  shield: number;
  held: Set<string>;
};

function newInvaders(held = new Set<string>()): InvadersState {
  const aliens = Array.from({ length: ALIEN_ROWS }, (_, row) =>
    GAMES.map((game, col) => ({ game, col, row, alive: true }))).flat();
  return {
    aliens, ox: 12, oy: 6, dirX: 1, px: FIELD_W / 2 - PLAYER / 2,
    shots: [], pops: [], lives: LIVES, cooldown: 0, enemyClock: 1, shield: 0, held,
  };
}

const alienX = (s: InvadersState, a: Alien) => s.ox + a.col * ALIEN_GAP_X;
const alienY = (s: InvadersState, a: Alien) => s.oy + a.row * ALIEN_GAP_Y;

function boxStyle(x: number, y: number, w: number, h: number): CSSProperties {
  return {
    left: `${(x / FIELD_W) * 100}%`,
    top: `${(y / FIELD_H) * 100}%`,
    width: `${(w / FIELD_W) * 100}%`,
    height: `${(h / FIELD_H) * 100}%`,
  };
}

const overlaps = (ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) =>
  ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

const LEFT = new Set(["arrowleft", "a"]);
const RIGHT = new Set(["arrowright", "d"]);
const FIRE = new Set([" ", "arrowup", "w"]);

function Invaders({ seed }: { seed: string }) {
  const [phase, setPhase] = useState<Phase>("ready");
  const state = useRef<InvadersState>(newInvaders());
  const avatar = useMemo(() => <PlayerAvatar seed={seed} />, [seed]);

  useKeys(
    (key) => {
      if (key === " " && phase !== "playing") {
        state.current = newInvaders(state.current.held);
        state.current.cooldown = 0.3; // the Space that starts the round isn't also a shot
        setPhase("playing");
        return true;
      }
      if (!LEFT.has(key) && !RIGHT.has(key) && !FIRE.has(key)) return false;
      state.current.held.add(key);
      return true;
    },
    (key) => state.current.held.delete(key),
  );

  // A key let go while the window was in the background never sends its keyup.
  useEffect(() => {
    const release = () => state.current.held.clear();
    window.addEventListener("blur", release);
    return () => window.removeEventListener("blur", release);
  }, []);

  useFrameLoop(phase === "playing", (dtMs) => {
    const s = state.current;
    const dt = dtMs / 1000;
    const held = (keys: Set<string>) => [...keys].some((key) => s.held.has(key));

    // Player
    const move = (held(RIGHT) ? 1 : 0) - (held(LEFT) ? 1 : 0);
    s.px = Math.min(FIELD_W - PLAYER, Math.max(0, s.px + move * 48 * dt));
    s.cooldown -= dt;
    s.shield = Math.max(0, s.shield - dt);
    if (held(FIRE) && s.cooldown <= 0) {
      s.shots.push({ x: s.px + PLAYER / 2 - SHOT_W / 2, y: PLAYER_Y - SHOT_H, vy: -95, color: "var(--primary)" });
      s.cooldown = 0.38;
    }

    // Formation: speeds up as it thins out, drops a row at each wall.
    const alive = s.aliens.filter((a) => a.alive);
    // A frame can land between the round ending and the loop stopping.
    if (alive.length === 0 || s.lives <= 0) return;
    const speed = 7 + (s.aliens.length - alive.length) * 1.1;
    s.ox += s.dirX * speed * dt;
    const minX = Math.min(...alive.map((a) => alienX(s, a)));
    const maxX = Math.max(...alive.map((a) => alienX(s, a) + ALIEN));
    if ((s.dirX === 1 && maxX >= FIELD_W - 1) || (s.dirX === -1 && minX <= 1)) {
      s.dirX = s.dirX === 1 ? -1 : 1;
      s.oy += 3;
    }

    // Aliens fire from the bottom of a random column, faster as fewer remain.
    s.enemyClock -= dt;
    if (s.enemyClock <= 0 && s.shots.filter((shot) => shot.vy > 0).length < 3) {
      const shooter = alive[randomInt(alive.length)]!;
      const bottom = alive
        .filter((a) => a.col === shooter.col)
        .reduce((low, a) => (a.row > low.row ? a : low));
      s.shots.push({
        x: alienX(s, bottom) + ALIEN / 2 - SHOT_W / 2,
        y: alienY(s, bottom) + ALIEN,
        vy: 38,
        color: GAME_META[bottom.game].accent,
      });
      s.enemyClock = 0.5 + Math.random() * (0.4 + alive.length * 0.03);
    }

    // Shots
    for (const shot of s.shots) shot.y += shot.vy * dt;
    s.shots = s.shots.filter((shot) => {
      if (shot.y < -SHOT_H || shot.y > FIELD_H) return false;
      if (shot.vy < 0) {
        const hit = alive.find((a) => a.alive && overlaps(shot.x, shot.y, SHOT_W, SHOT_H, alienX(s, a), alienY(s, a), ALIEN, ALIEN));
        if (!hit) return true;
        hit.alive = false;
        s.pops.push({ x: alienX(s, hit), y: alienY(s, hit), game: hit.game, age: 0 });
        return false;
      }
      if (s.shield > 0 || !overlaps(shot.x, shot.y, SHOT_W, SHOT_H, s.px, PLAYER_Y, PLAYER, PLAYER)) return true;
      s.lives -= 1;
      s.shield = 1.2;
      return false;
    });

    for (const pop of s.pops) pop.age += dt;
    s.pops = s.pops.filter((pop) => pop.age < 0.3);

    const left = s.aliens.filter((a) => a.alive);
    if (left.length === 0) setPhase("won");
    else if (s.lives <= 0 || Math.max(...left.map((a) => alienY(s, a) + ALIEN)) >= PLAYER_Y) setPhase("over");
  });

  const s = state.current;
  const hits = s.aliens.filter((a) => !a.alive).length;

  return (
    <>
      <div className="arcade-hud">
        <div className="arcade-lives" aria-label={`${s.lives} lives`}>
          {Array.from({ length: LIVES }, (_, i) => (
            <span key={i} className="arcade-life" data-lost={i >= s.lives}>{avatar}</span>
          ))}
        </div>
        <span className="arcade-score">{hits}/{s.aliens.length}</span>
      </div>

      <div className="arcade-board arcade-board--invaders">
        {s.aliens.map((a) => a.alive && (
          <span key={`${a.row}-${a.col}`} className="inv-alien" style={boxStyle(alienX(s, a), alienY(s, a), ALIEN, ALIEN)}>
            <GameIcon game={a.game} size="100%" color={GAME_META[a.game].accent} />
          </span>
        ))}
        {s.pops.map((pop) => (
          <span key={`${pop.x}-${pop.y}`} className="inv-pop" style={boxStyle(pop.x, pop.y, ALIEN, ALIEN)}>
            <GameIcon game={pop.game} size="100%" color={GAME_META[pop.game].accent} />
          </span>
        ))}
        {s.shots.map((shot, index) => (
          <span key={index} className="inv-shot" style={{ ...boxStyle(shot.x, shot.y, SHOT_W, SHOT_H), background: shot.color }} />
        ))}
        <span className="inv-player" data-shield={s.shield > 0} style={boxStyle(s.px, PLAYER_Y, PLAYER, PLAYER)}>{avatar}</span>

        {phase === "ready" && <Overlay title="Invaders">Clear every game off the board. Arrows or A/D to move, Space to shoot.</Overlay>}
        {phase === "over" && <Overlay title={s.lives <= 0 ? "Out of lives" : "Overrun"}>You cleared {hits} of {s.aliens.length}.</Overlay>}
        {phase === "won" && <Overlay title="Board cleared">Every game, gone. Nice shooting.</Overlay>}
      </div>
    </>
  );
}
