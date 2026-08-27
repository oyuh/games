/**
 * Container engine handling: find it, wake it up, and run the two containers
 * the local stack needs.
 *
 * The previous scripts assumed Docker was already running and told you to go
 * start it yourself. Here we try to start it the way the platform expects,
 * because on every machine this repo runs on there is exactly one right
 * command and the script knows which one.
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  IS_LINUX,
  IS_MAC,
  IS_WINDOWS,
  commandExists,
  run,
  runInherit,
  sleep,
  spawnDetached,
  spawnProcess,
} from "./proc.mjs";
import {
  CONTAINER_SERVICES,
  NETWORK_NAME,
  POSTGRES_IMAGE,
  POSTGRES_VOLUME,
  ZERO_IMAGE,
  ZERO_VOLUME,
} from "./config.mjs";
import { progress, note, warn } from "./ui.mjs";

const POSTGRES = CONTAINER_SERVICES.postgres.container;
const ZERO = CONTAINER_SERVICES["zero-cache"].container;

/** Docker if present, else Podman, which speaks a close enough CLI. */
export function detectEngine() {
  if (commandExists("docker")) return { command: "docker", name: "Docker" };
  if (commandExists("podman")) return { command: "podman", name: "Podman" };
  return null;
}

export async function isDaemonRunning(engine) {
  const result = await run(engine.command, ["info", "--format", "{{.ServerVersion}}"], {
    timeout: 20000,
  });
  return result.ok;
}

export async function engineVersion(engine) {
  const result = await run(engine.command, ["info", "--format", "{{.ServerVersion}}"], {
    timeout: 20000,
  });
  return result.ok ? result.stdout.split(/\r?\n/)[0] : null;
}

/**
 * Ask the OS to start the engine. Returns a short description of what was
 * tried so the caller can say something useful while it waits.
 */
async function launchDaemon(engine) {
  if (engine.command === "podman") {
    if (IS_LINUX) return null; // Rootless podman on Linux has no daemon to start.
    const result = await run("podman", ["machine", "start"], { timeout: 180000 });
    return result.ok ? "podman machine start" : null;
  }

  if (IS_MAC) {
    const apps = [
      { path: "/Applications/OrbStack.app", name: "OrbStack" },
      { path: "/Applications/Docker.app", name: "Docker" },
      { path: join(homedir(), "Applications/OrbStack.app"), name: "OrbStack" },
      { path: join(homedir(), "Applications/Docker.app"), name: "Docker" },
      { path: "/Applications/Rancher Desktop.app", name: "Rancher Desktop" },
    ];

    for (const app of apps) {
      if (!existsSync(app.path)) continue;
      if (spawnDetached("open", ["-a", app.path])) return app.name;
    }

    if (commandExists("colima")) {
      const result = await run("colima", ["start"], { timeout: 300000 });
      if (result.ok) return "colima";
    }

    return null;
  }

  if (IS_WINDOWS) {
    const candidates = [
      join(process.env.ProgramFiles ?? "C:\\Program Files", "Docker/Docker/Docker Desktop.exe"),
      join(process.env.LOCALAPPDATA ?? "", "Docker/Docker Desktop.exe"),
      join(process.env.ProgramFiles ?? "C:\\Program Files", "Rancher Desktop/Rancher Desktop.exe"),
    ];

    for (const candidate of candidates) {
      if (!candidate || !existsSync(candidate)) continue;
      // `start ""` returns immediately instead of blocking on the GUI.
      if (spawnDetached(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "start", "", candidate])) {
        return candidate.includes("Rancher") ? "Rancher Desktop" : "Docker Desktop";
      }
    }

    return null;
  }

  if (IS_LINUX) {
    const attempts = [];
    if (commandExists("systemctl")) {
      // Rootless first: it needs no password and is increasingly the default.
      attempts.push(["systemctl", ["--user", "start", "docker"]]);
      if (process.getuid?.() === 0) {
        attempts.push(["systemctl", ["start", "docker"]]);
      } else if (commandExists("sudo")) {
        // -n means "fail instead of prompting": a hung sudo prompt behind a
        // spinner is worse than a clear error.
        attempts.push(["sudo", ["-n", "systemctl", "start", "docker"]]);
      }
    }
    if (commandExists("service") && commandExists("sudo")) {
      attempts.push(["sudo", ["-n", "service", "docker", "start"]]);
    }

    for (const [command, args] of attempts) {
      const result = await run(command, args, { timeout: 60000 });
      if (result.ok) return `${command} ${args.join(" ")}`;
    }

    return null;
  }

  return null;
}

/**
 * Guarantees a usable engine or throws with something actionable.
 */
export async function ensureEngine({ autoStart = true, timeoutSeconds = 150 } = {}) {
  const engine = detectEngine();
  if (!engine) {
    throw new Error(
      "No container engine found. Install Docker Desktop, OrbStack, Colima, Rancher Desktop or Podman, then rerun.",
    );
  }

  if (await isDaemonRunning(engine)) return engine;

  if (!autoStart) {
    throw new Error(`${engine.name} is installed but its daemon is not running.`);
  }

  const spinner = progress(`${engine.name} is not running, starting it...`);
  const started = await launchDaemon(engine);

  if (!started) {
    spinner.stop();
    throw new Error(
      `${engine.name} is installed but not running, and this script could not start it automatically.\n` +
        "  Start it by hand (Docker Desktop / OrbStack / `colima start` / `sudo systemctl start docker`) and rerun.",
    );
  }

  spinner.update(`Starting ${started}, waiting for the daemon...`);
  const deadline = Date.now() + timeoutSeconds * 1000;

  while (Date.now() < deadline) {
    if (await isDaemonRunning(engine)) {
      spinner.done(`${engine.name} is running (started via ${started}).`);
      return engine;
    }
    const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000));
    spinner.update(`Starting ${started}, waiting for the daemon... ${remaining}s left`);
    await sleep(1500);
  }

  spinner.stop();
  throw new Error(
    `${engine.name} was launched but the daemon did not come up within ${timeoutSeconds}s. ` +
      "Check the app window for a login prompt or an update dialog, then rerun.",
  );
}

export async function containerState(engine, name) {
  const result = await run(
    engine.command,
    [
      "inspect",
      "-f",
      // Health is a nil pointer on images without a HEALTHCHECK, and touching
      // it unguarded makes the whole inspect fail, not just that field.
      "{{.State.Status}}|{{.State.Running}}|{{.State.StartedAt}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}",
      name,
    ],
    { timeout: 20000 },
  );

  if (!result.ok) return { exists: false, running: false, status: "absent", startedAt: null, health: null };

  const [status, running, startedAt, health] = result.stdout.split("|");
  return {
    exists: true,
    running: running === "true",
    status: status || "unknown",
    startedAt: startedAt && startedAt !== "0001-01-01T00:00:00Z" ? startedAt : null,
    health: health && health !== "<no value>" ? health : null,
  };
}

export async function ensureNetwork(engine) {
  const exists = await run(engine.command, ["network", "inspect", NETWORK_NAME], { timeout: 20000 });
  if (exists.ok) return;
  await run(engine.command, ["network", "create", NETWORK_NAME], { timeout: 30000 });
}

export async function ensureVolume(engine, name) {
  const exists = await run(engine.command, ["volume", "inspect", name], { timeout: 20000 });
  if (exists.ok) return;
  await run(engine.command, ["volume", "create", name], { timeout: 30000 });
}

export async function removeVolume(engine, name) {
  await run(engine.command, ["volume", "rm", name], { timeout: 30000 });
}

export async function removeContainer(engine, name) {
  await run(engine.command, ["rm", "-f", name], { timeout: 60000 });
}

export async function removeNetwork(engine) {
  await run(engine.command, ["network", "rm", NETWORK_NAME], { timeout: 30000 });
}

/**
 * Containers that are not ours but are publishing a port we need, which is
 * almost always a `docker compose up` from the manual setup path still
 * running in another terminal.
 */
export async function findPortConflicts(engine, ports, ourNames) {
  const result = await run(
    engine.command,
    ["ps", "--format", "{{.Names}}|{{.Ports}}|{{.Image}}"],
    { timeout: 20000 },
  );
  if (!result.ok || !result.stdout) return [];

  const conflicts = [];
  for (const line of result.stdout.split(/\r?\n/)) {
    const [name, portMap = "", image = ""] = line.split("|");
    if (!name || ourNames.includes(name)) continue;
    const published = [...portMap.matchAll(/:(\d+)->/g)].map((match) => Number(match[1]));
    const clash = ports.filter((port) => published.includes(port));
    if (clash.length > 0) conflicts.push({ name, image, ports: clash });
  }

  return conflicts;
}

/**
 * Docker Desktop and OrbStack define host.docker.internal for you. Plain
 * Docker on Linux and Podman do not, and without it zero-cache cannot reach
 * the API's query/mutate endpoints at all: the container starts, the app
 * connects, and every query quietly fails. Mapping it explicitly is the fix
 * the old bash script was missing.
 */
function hostGatewayArgs(engine) {
  const needsMapping = IS_LINUX || engine.command === "podman";
  return needsMapping ? ["--add-host", "host.docker.internal:host-gateway"] : [];
}

export async function startPostgres(engine) {
  await ensureNetwork(engine);
  await ensureVolume(engine, POSTGRES_VOLUME);

  const state = await containerState(engine, POSTGRES);
  if (state.exists) {
    if (!state.running) {
      const result = await run(engine.command, ["start", POSTGRES], { timeout: 60000 });
      if (!result.ok) {
        // A container left over from an older image or port layout cannot be
        // started; rebuilding it is safe because the data lives in the volume.
        await removeContainer(engine, POSTGRES);
        return createPostgres(engine);
      }
    }
    return { created: false };
  }

  return createPostgres(engine);
}

async function createPostgres(engine) {
  const result = await run(
    engine.command,
    [
      "run", "-d",
      "--name", POSTGRES,
      "--network", NETWORK_NAME,
      "--restart", "unless-stopped",
      "-p", "5432:5432",
      "-e", "POSTGRES_USER=postgres",
      "-e", "POSTGRES_PASSWORD=postgres",
      "-e", "POSTGRES_DB=games",
      "-v", `${POSTGRES_VOLUME}:/var/lib/postgresql/data`,
      POSTGRES_IMAGE,
      "postgres", "-c", "wal_level=logical",
    ],
    { timeout: 300000 },
  );

  if (!result.ok) throw new Error(`Could not start Postgres: ${result.stderr || result.stdout}`);
  return { created: true };
}

/** Always recreated: the point is a replica rebuilt from the current schema. */
export async function startZeroCache(engine, { freshReplica = true } = {}) {
  await ensureNetwork(engine);
  await removeContainer(engine, ZERO);
  if (freshReplica) await removeVolume(engine, ZERO_VOLUME);
  await ensureVolume(engine, ZERO_VOLUME);

  const upstream = `postgres://postgres:postgres@${POSTGRES}:5432/games`;
  const result = await run(
    engine.command,
    [
      "run", "-d",
      "--name", ZERO,
      "--network", NETWORK_NAME,
      "--restart", "unless-stopped",
      ...hostGatewayArgs(engine),
      "-p", "4848:4848",
      "-e", `ZERO_UPSTREAM_DB=${upstream}`,
      "-e", `ZERO_CVR_DB=${upstream}`,
      "-e", `ZERO_CHANGE_DB=${upstream}`,
      "-e", "ZERO_REPLICA_FILE=/data/zero.db",
      "-e", "ZERO_ADMIN_PASSWORD=dev-password",
      "-e", "ZERO_QUERY_URL=http://host.docker.internal:3001/api/zero/query",
      "-e", "ZERO_MUTATE_URL=http://host.docker.internal:3001/api/zero/mutate",
      "-v", `${ZERO_VOLUME}:/data`,
      ZERO_IMAGE,
    ],
    { timeout: 300000 },
  );

  if (!result.ok) throw new Error(`Could not start zero-cache: ${result.stderr || result.stdout}`);
}

/**
 * The replica lives in the volume above, but zero's record of who has synced
 * what lives in postgres, and nothing was ever clearing it. Every reset
 * orphaned another browser's worth of clients, each still holding a mutation
 * the server had already applied, and zero-cache re-pushed the lot on every
 * reconnect. That is where the wall of "already processed. Expected: 2" in the
 * api log comes from. Clearing them alongside the replica is the same fresh
 * start.
 */
export async function clearZeroClientRecords(engine) {
  await run(
    engine.command,
    [
      "exec", "-i", POSTGRES,
      "psql", "-U", "postgres", "-d", "games", "-q",
      "-c", "truncate table zero_0.clients, zero_0.mutations",
    ],
    { timeout: 30000 },
  );
}

/** Postgres accepting TCP is not the same as Postgres ready for queries. */
export async function waitForPostgresReady(engine, timeoutSeconds = 90) {
  const deadline = Date.now() + timeoutSeconds * 1000;

  while (Date.now() < deadline) {
    const result = await run(
      engine.command,
      ["exec", POSTGRES, "pg_isready", "-U", "postgres", "-d", "games"],
      { timeout: 15000 },
    );
    if (result.ok) return true;
    await sleep(1000);
  }

  return false;
}

export async function containerLogs(engine, name, { tail = 200, follow = false } = {}) {
  const args = ["logs", "--tail", String(tail)];
  if (follow) args.push("-f");
  args.push(name);

  return new Promise((resolve) => {
    const child = spawnProcess(engine.command, args, { stdio: "inherit" });
    child.on("error", () => resolve(1));
    child.on("close", (code) => resolve(code ?? 0));
  });
}

export async function restartContainer(engine, name) {
  const result = await run(engine.command, ["restart", name], { timeout: 120000 });
  return result.ok;
}

export async function stopContainer(engine, name) {
  const result = await run(engine.command, ["stop", name], { timeout: 120000 });
  return result.ok;
}

export async function imageExists(engine, image) {
  const result = await run(engine.command, ["image", "inspect", image], { timeout: 20000 });
  return result.ok;
}

/** Pulling with output attached, because a cold pull is slow and silent. */
export async function pullImage(engine, image) {
  note(`Pulling ${image} (first run only)...`);
  const code = await runInherit(engine.command, ["pull", image], {});
  if (code !== 0) warn(`Could not pull ${image}; the run below may fail.`);
}
