#!/usr/bin/env node
/**
 * The local stack, one command, every platform.
 *
 *   bun run local up                start everything
 *   bun run local status            what is running right now
 *   bun run local restart admin     restart a single service
 *   bun run local logs api -f       follow one service
 *   bun run local down              stop everything
 *
 * This replaces the four OS-specific shell scripts. They had drifted apart
 * (the bash one ran standalone containers, the PowerShell one ran compose),
 * needed tools that are not everywhere (`nc`, `lsof`, PowerShell), and could
 * only ever start or stop the whole stack at once.
 */
import { existsSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  ALL_NAMES,
  APP_NAMES,
  APP_SERVICES,
  CONTAINER_NAMES,
  CONTAINER_SERVICES,
  LOG_DIR,
  POSTGRES_IMAGE,
  POSTGRES_VOLUME,
  ROOT_DIR,
  STATE_DIR,
  ZERO_IMAGE,
  ZERO_IMAGE_VERSION,
  ZERO_VOLUME,
  isAppService,
  isContainerService,
  resolveServiceName,
} from "./lib/config.mjs";
import {
  clearZeroClientRecords,
  containerLogs,
  containerState,
  detectEngine,
  engineVersion,
  ensureEngine,
  findPortConflicts,
  imageExists,
  isDaemonRunning,
  pullImage,
  removeContainer,
  removeNetwork,
  removeVolume,
  restartContainer,
  startPostgres,
  startZeroCache,
  stopContainer,
  waitForPostgresReady,
} from "./lib/docker.mjs";
import { databaseUrl, ensureEnvFile, hasEnvFile, isLocalDatabaseUrl } from "./lib/env.mjs";
import {
  clearStateFile,
  closeControlServer,
  createControlServer,
  ping,
  readStateFile,
  request,
  writeStateFile,
} from "./lib/ipc.mjs";
import { findPortOwners, freePort, isPortOpen, waitForPort } from "./lib/ports.mjs";
import { IS_WINDOWS, commandExists, sleep, spawnProcess } from "./lib/proc.mjs";
import { Supervisor } from "./lib/supervisor.mjs";
import {
  ARROW,
  blank,
  bold,
  dim,
  fail,
  formatDuration,
  heading,
  note,
  ok,
  paint,
  progress,
  step,
  table,
  warn,
} from "./lib/ui.mjs";
import {
  bunVersion,
  ensureZeroVersionsMatch,
  installedZeroVersion,
  pushDatabaseSchema,
  warnOnComposeDrift,
} from "./lib/workspace.mjs";

const SELF = fileURLToPath(import.meta.url);
const CONTAINER_PORTS = CONTAINER_NAMES.map((name) => CONTAINER_SERVICES[name].port);
const OUR_CONTAINERS = CONTAINER_NAMES.map((name) => CONTAINER_SERVICES[name].container);

const BOOLEAN_FLAGS = new Set([
  "skip-docker",
  "skip-db-push",
  "skip-dev",
  "skip-ports",
  "skip-deps",
  "preserve-db-data",
  "keep-replica",
  "auto-restart",
  "host",
  "detach",
  "force",
  "follow",
  "soft",
  "wipe-db",
  "help",
]);

function parseArgs(argv) {
  const flags = {};
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }

    if (token.startsWith("--")) {
      const [rawName, inlineValue] = token.slice(2).split(/=(.*)/s);
      const name = rawName.trim();

      if (inlineValue !== undefined) {
        flags[name] = inlineValue;
        continue;
      }
      if (BOOLEAN_FLAGS.has(name)) {
        flags[name] = true;
        continue;
      }
      // Value flags (--only api,web) take the next token.
      const next = argv[index + 1];
      if (next && !next.startsWith("-")) {
        flags[name] = next;
        index += 1;
      } else {
        flags[name] = true;
      }
      continue;
    }

    if (token.startsWith("-") && token.length > 1) {
      const short = token.slice(1);
      if (short === "f") flags.follow = true;
      else if (short === "d") flags.detach = true;
      else if (short === "h") flags.help = true;
      else if (short === "n") {
        flags.lines = argv[index + 1];
        index += 1;
      } else flags[short] = true;
      continue;
    }

    positionals.push(token);
  }

  return { flags, positionals };
}

function usage() {
  console.log(`
${bold("Local stack control")}  ${dim("node scripts/local.mjs <command>")}

${bold("Commands")}
  up                     Start Docker services, push the schema, run the dev servers
  down                   Stop the dev servers and the Docker services
  reset                  down (keeping ports) then up
  status | ps            Show every service, its port, pid and health
  restart <service...>   Restart one or more services
  start <service...>     Start a stopped service
  stop <service...>      Stop a running service
  logs <service>         Show a service log  (-f to follow, -n 200 for tail size)
  doctor                 Check the machine for anything that will break the stack
  help                   This text

${bold("Services")}
  ${ALL_NAMES.join(", ")}
  Groups: all, apps (${APP_NAMES.join(", ")}), infra (${CONTAINER_NAMES.join(", ")})
  Aliases: db/pg -> postgres, zero -> zero-cache, ui -> web, backend -> api

${bold("up flags")}
  --host                 Expose the web dev server on the local network
  --detach, -d           Start in the background and return to the prompt
  --only api,web         Only run some of the dev servers
  --skip-docker          Leave containers alone
  --skip-db-push         Do not push the Drizzle schema
  --skip-dev             Bring up infrastructure only
  --skip-ports           Do not clear whatever is holding the dev ports
  --skip-deps            Skip the bun install / Zero version check
  --preserve-db-data     Do not auto-approve destructive Drizzle changes
  --keep-replica         Keep the Zero replica instead of rebuilding it
  --auto-restart         Restart a dev server automatically when it crashes
  --force                Take over from a stack that is already running

${bold("restart flags")}
  --soft                 Restart zero-cache in place instead of rebuilding its replica

${bold("down flags")}
  --skip-docker          Leave containers running
  --skip-ports           Do not kill processes on the dev ports
  --wipe-db              Also delete the Postgres volume (destroys local data)
`);
}

function resolveTargets(names, { allowGroups = true } = {}) {
  const resolved = [];

  for (const raw of names) {
    const name = resolveServiceName(raw);

    if (allowGroups && name === "all") {
      resolved.push(...CONTAINER_NAMES, ...APP_NAMES);
      continue;
    }
    if (allowGroups && (name === "apps" || name === "dev")) {
      resolved.push(...APP_NAMES);
      continue;
    }
    if (allowGroups && (name === "infra" || name === "docker" || name === "containers")) {
      resolved.push(...CONTAINER_NAMES);
      continue;
    }
    if (!isAppService(name) && !isContainerService(name)) {
      throw new Error(`Unknown service "${raw}". Known services: ${ALL_NAMES.join(", ")}.`);
    }
    resolved.push(name);
  }

  return [...new Set(resolved)];
}

function statusColor(status) {
  if (status === "running") return paint("green", status);
  if (status === "starting" || status === "restarting") return paint("yellow", status);
  if (status === "crashed" || status === "unhealthy") return paint("red", status);
  if (status === "external") return paint("yellow", status);
  return dim(status);
}

/* ------------------------------------------------------------------ up --- */

async function commandUp(flags, rawArgs) {
  if (flags.detach) return startDetached(rawArgs, flags);

  const skipDocker = Boolean(flags["skip-docker"]);
  const skipDev = Boolean(flags["skip-dev"]);
  const only = flags.only
    ? resolveTargets(String(flags.only).split(","), { allowGroups: false }).filter(isAppService)
    : null;

  if (flags.only && (!only || only.length === 0)) {
    throw new Error(`--only needs at least one of: ${APP_NAMES.join(", ")}.`);
  }

  heading("Preflight");
  if (!commandExists("bun")) {
    throw new Error("Bun is not installed or not on PATH. See https://bun.sh, then rerun.");
  }
  ensureEnvFile();
  warnOnComposeDrift();
  if (!flags["skip-deps"]) await ensureZeroVersionsMatch();
  ok("Workspace looks ready.");

  const alreadyRunning = await ping();
  if (alreadyRunning && !skipDev) {
    if (!flags.force) {
      throw new Error(
        "A local stack is already running for this repo.\n" +
          "  Use `bun run local status`, `bun run local restart <service>`, or rerun with --force to take over.",
      );
    }
    step("Taking over from the stack that is already running...");
    await shutdownRunningStack();
  }

  let engine = null;
  if (!skipDocker) {
    heading("Containers");
    engine = await ensureEngine();
    await guardPortConflicts(engine);
    await ensureImages(engine);

    const spinner = progress("Starting Postgres...");
    await startPostgres(engine);
    spinner.update("Waiting for Postgres to accept connections...");
    const listening = await waitForPort(CONTAINER_SERVICES.postgres.port, { timeoutSeconds: 90 });
    if (!listening) {
      spinner.stop();
      throw new Error("Postgres never opened port 5432. Check `docker logs games-local-postgres`.");
    }
    spinner.update("Waiting for Postgres to finish initialising...");
    const ready = await waitForPostgresReady(engine, 90);
    spinner.done(ready ? "Postgres is ready." : "Postgres is listening (readiness check timed out).");
  }

  if (!flags["skip-db-push"]) {
    heading("Database schema");
    await pushDatabaseSchema({ preserveData: Boolean(flags["preserve-db-data"]) });
    ok("Schema pushed.");
  }

  if (!skipDocker) {
    const freshReplica = !flags["keep-replica"];
    const spinner = progress(freshReplica ? "Rebuilding the Zero replica..." : "Starting zero-cache...");
    if (freshReplica) await clearZeroClientRecords(engine);
    await startZeroCache(engine, { freshReplica });
    spinner.update("Waiting for zero-cache...");
    const listening = await waitForPort(CONTAINER_SERVICES["zero-cache"].port, { timeoutSeconds: 90 });
    spinner.done(
      listening
        ? "zero-cache is up."
        : "zero-cache did not open port 4848 (see `bun run local logs zero-cache`).",
    );
  }

  if (skipDev) {
    blank();
    ok("Infrastructure is up. Dev servers were skipped.");
    await printStatus();
    return;
  }

  if (!flags["skip-ports"]) {
    const names = only ?? APP_NAMES;
    await clearDevPorts(names);
  }

  await runSupervisor({ only, flags, engine });
}

/** Someone else's containers on our ports produce baffling failures later. */
async function guardPortConflicts(engine) {
  const conflicts = await findPortConflicts(engine, CONTAINER_PORTS, OUR_CONTAINERS);
  if (conflicts.length === 0) return;

  for (const conflict of conflicts) {
    warn(
      `Container "${conflict.name}" (${conflict.image}) already publishes ${conflict.ports.join(", ")}.`,
    );
  }
  throw new Error(
    "Those ports are what this stack needs. Stop the other containers " +
      "(for example `docker compose down`) and rerun.",
  );
}

async function ensureImages(engine) {
  for (const image of [POSTGRES_IMAGE, ZERO_IMAGE]) {
    if (!(await imageExists(engine, image))) await pullImage(engine, image);
  }
}

async function clearDevPorts(names) {
  for (const name of names) {
    const { port } = APP_SERVICES[name];
    const stopped = await freePort(port);
    for (const owner of stopped) {
      note(`Freed port ${port} from ${owner.name} (${owner.pid})`);
    }
  }
}

/** Runs the dev servers in the foreground and answers control requests. */
async function runSupervisor({ only, flags, engine }) {
  heading("Dev servers");

  const supervisor = new Supervisor({
    only,
    autoRestart: Boolean(flags["auto-restart"]),
    extraEnv: flags.host ? { VITE_EXPOSE_HOST: "1" } : {},
  });

  let shuttingDown = false;
  const shutdown = async (code = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    blank();
    step("Stopping dev servers...");
    await supervisor.stopAll();
    clearStateFile({ pid: process.pid });
    if (control) await closeControlServer(control.server);
    ok("Dev servers stopped. Containers are still running (`bun run local down` stops those).");
    process.exit(code);
  };

  const control = await createControlServer(async (message, { send, socket }) => {
    const reply = (data) => send({ id: message.id, ok: true, data });
    const refuse = (error) => send({ id: message.id, ok: false, error });

    switch (message.type) {
      case "ping":
        return reply({ pid: process.pid });

      case "status":
        return reply({
          pid: process.pid,
          startedAt: supervisor.startedAt,
          host: Boolean(flags.host),
          processes: supervisor.snapshot(),
        });

      case "restart":
      case "start":
      case "stop": {
        const managed = supervisor.get(message.name);
        if (!managed) return refuse(`This stack is not running "${message.name}".`);
        if (message.type === "restart") await managed.restart();
        else if (message.type === "start") await managed.start();
        else await managed.stop();
        return reply(managed.snapshot());
      }

      case "logs": {
        const managed = supervisor.get(message.name);
        if (!managed) return refuse(`This stack is not running "${message.name}".`);
        reply({ lines: managed.tail(message.lines ?? 200), follow: Boolean(message.follow) });
        if (message.follow) {
          const unsubscribe = managed.subscribe((entry) =>
            send({ id: message.id, ok: true, stream: "log", ...entry }),
          );
          socket.on("close", unsubscribe);
          socket.on("error", unsubscribe);
        }
        return undefined;
      }

      case "shutdown":
        reply({ stopping: true });
        setTimeout(() => shutdown(0), 50);
        return undefined;

      default:
        return refuse(`Unknown control message "${message.type}".`);
    }
  });

  writeStateFile({
    pid: process.pid,
    socket: control.path,
    startedAt: Date.now(),
    services: supervisor.names,
    engine: engine?.command ?? null,
    host: Boolean(flags.host),
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      shutdown(0);
    });
  }
  process.on("exit", () => clearStateFile({ pid: process.pid }));

  await supervisor.startAll();
  await printReadyBanner(supervisor, flags);
}

async function printReadyBanner(supervisor, flags) {
  // A moment of grace so the first lines of each dev server land above this.
  await sleep(1200);

  blank();
  console.log(bold("Stack is up."));
  blank();

  const rows = [];
  for (const name of CONTAINER_NAMES) {
    const service = CONTAINER_SERVICES[name];
    const open = await isPortOpen(service.port);
    rows.push([
      name,
      statusColor(open ? "running" : "starting"),
      service.url ?? `localhost:${service.port}`,
    ]);
  }
  for (const snapshot of supervisor.snapshot()) {
    rows.push([snapshot.name, statusColor(snapshot.status), snapshot.url ?? ""]);
  }

  table(rows, { head: ["SERVICE", "STATUS", "URL"] });
  blank();

  if (flags.host) note("Web is exposed on the local network (VITE_EXPOSE_HOST=1).");
  note(`bun run local status              ${ARROW} what is running`);
  note(`bun run local restart admin       ${ARROW} restart one service`);
  note(`bun run local logs api -f         ${ARROW} follow one log`);
  note(`Ctrl+C                            ${ARROW} stop the dev servers`);
  blank();
}

/** Re-runs this script in the background and waits for it to answer. */
async function startDetached(rawArgs, flags) {
  // Checked here rather than in the child so the message reaches the terminal
  // instead of a log file, and so the wait below cannot mistake the stack it
  // is replacing for the one it just started.
  if (await ping()) {
    if (!flags.force) {
      throw new Error(
        "A local stack is already running for this repo.\n" +
          "  Use `bun run local status`, `bun run local restart <service>`, or rerun with --force to take over.",
      );
    }
    step("Taking over from the stack that is already running...");
    await shutdownRunningStack();
  }

  mkdirSync(LOG_DIR, { recursive: true });
  const logPath = `${LOG_DIR}/stack.log`;
  const handle = openSync(logPath, "w");
  const args = rawArgs.filter((token) => token !== "--detach" && token !== "-d");

  const child = spawnProcess(process.execPath, [SELF, ...args], {
    cwd: ROOT_DIR,
    stdio: ["ignore", handle, handle],
    detached: !IS_WINDOWS,
    windowsHide: true,
  });
  child.unref();

  const spinner = progress("Starting the stack in the background...");
  const deadline = Date.now() + 300000;

  while (Date.now() < deadline) {
    // The child is the supervisor, so a matching pid in the state file proves
    // we are looking at the stack we just started.
    if (readStateFile()?.pid === child.pid && (await ping())) {
      spinner.done("Stack is running in the background.");
      note(`Startup log: ${logPath}`);
      blank();
      await printStatus();
      return;
    }
    if (child.exitCode !== null) {
      spinner.stop();
      fail("The background stack exited during startup. Last lines of its log:");
      printFileTail(logPath, 30);
      process.exitCode = 1;
      return;
    }
    await sleep(1000);
  }

  spinner.stop();
  fail(`The background stack did not come up in time. See ${logPath}.`);
  process.exitCode = 1;
}

function printFileTail(path, count) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
  for (const line of lines.slice(-count)) console.log(`  ${dim(line)}`);
}

/* ---------------------------------------------------------------- down --- */

async function shutdownRunningStack() {
  const state = readStateFile();
  if (!(await ping())) {
    clearStateFile();
    return false;
  }

  try {
    await request({ type: "shutdown" }, { timeout: 5000 });
  } catch {
    // It may hang up before replying, which is the expected outcome anyway.
  }

  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (!(await ping())) {
      clearStateFile();
      return true;
    }
    await sleep(500);
  }

  warn(`The stack supervisor (pid ${state?.pid ?? "?"}) did not stop cleanly; clearing ports directly.`);
  clearStateFile();
  return false;
}

async function commandDown(flags) {
  heading("Stopping the local stack");

  if (await shutdownRunningStack()) ok("Dev servers stopped.");

  if (!flags["skip-ports"]) {
    for (const name of APP_NAMES) {
      const { port } = APP_SERVICES[name];
      const stopped = await freePort(port);
      for (const owner of stopped) note(`Stopped ${owner.name} (${owner.pid}) on port ${port}`);
    }
    ok("Dev ports are clear.");
  }

  if (flags["skip-docker"]) {
    ok("Local stack stopped (containers left running).");
    return;
  }

  const engine = detectEngine();
  if (!engine || !(await isDaemonRunning(engine))) {
    warn("No running container engine, so nothing to stop there.");
    ok("Local stack stopped.");
    return;
  }

  const spinner = progress("Removing containers...");
  for (const name of CONTAINER_NAMES) {
    await removeContainer(engine, CONTAINER_SERVICES[name].container);
  }
  await removeNetwork(engine);
  // The replica is disposable and a stale one is a common source of sync bugs.
  await removeVolume(engine, ZERO_VOLUME);
  if (flags["wipe-db"]) await removeVolume(engine, POSTGRES_VOLUME);
  spinner.done(
    flags["wipe-db"]
      ? "Containers removed, including the Postgres volume."
      : "Containers removed (Postgres data kept).",
  );

  ok("Local stack stopped.");
}

/* -------------------------------------------------------------- status --- */

async function commandStatus() {
  await printStatus();
}

async function printStatus() {
  const engine = detectEngine();
  const daemonUp = engine ? await isDaemonRunning(engine) : false;

  heading("Local stack");

  if (!engine) note("No container engine found on PATH.");
  else if (!daemonUp) note(`${engine.name} is installed but not running.`);
  else note(`${engine.name} ${(await engineVersion(engine)) ?? ""}`.trim());

  const rows = [];

  for (const name of CONTAINER_NAMES) {
    const service = CONTAINER_SERVICES[name];
    const state = daemonUp
      ? await containerState(engine, service.container)
      : { exists: false, running: false, status: "engine down", startedAt: null, health: null };
    const listening = state.running ? await isPortOpen(service.port) : false;

    let status = "stopped";
    if (!daemonUp) status = "unknown";
    else if (!state.exists) status = "absent";
    else if (state.running) status = listening ? "running" : "starting";
    else status = state.status;

    rows.push([
      name,
      statusColor(status),
      dim("container"),
      String(service.port),
      state.startedAt ? formatDuration(Date.now() - Date.parse(state.startedAt)) : "-",
      service.url ?? "",
    ]);
  }

  const supervisorState = (await ping()) ? await request({ type: "status" }, { timeout: 5000 }) : null;
  const snapshots = new Map(
    (supervisorState?.data?.processes ?? []).map((snapshot) => [snapshot.name, snapshot]),
  );

  for (const name of APP_NAMES) {
    const service = APP_SERVICES[name];
    const snapshot = snapshots.get(name);

    if (snapshot) {
      rows.push([
        name,
        statusColor(snapshot.status),
        snapshot.pid ? `pid ${snapshot.pid}` : dim("-"),
        String(service.port),
        snapshot.uptimeMs ? formatDuration(snapshot.uptimeMs) : "-",
        snapshot.url ?? "",
      ]);
      continue;
    }

    // No supervisor: the port still tells us whether something is serving.
    const owners = await findPortOwners(service.port);
    const listening = owners.length > 0 || (await isPortOpen(service.port));
    rows.push([
      name,
      statusColor(listening ? "external" : "stopped"),
      owners.length > 0 ? `pid ${owners.map((owner) => owner.pid).join(", ")}` : dim("-"),
      String(service.port),
      "-",
      listening ? service.url ?? "" : "",
    ]);
  }

  blank();
  table(rows, { head: ["SERVICE", "STATUS", "PROCESS", "PORT", "UPTIME", "URL"] });
  blank();

  if (supervisorState?.data) {
    const { pid, startedAt } = supervisorState.data;
    note(`Supervisor pid ${pid}, up ${formatDuration(Date.now() - startedAt)}.`);
  } else {
    note("No dev-server supervisor is running. `bun run local up` starts one.");
    note('"external" means something outside this stack is holding that port.');
  }
  blank();
}

/* ------------------------------------------------------- start/stop/etc --- */

async function commandLifecycle(action, positionals, flags) {
  if (positionals.length === 0) {
    throw new Error(`${action} needs a service name. Try: ${ALL_NAMES.join(", ")}, apps, infra, all.`);
  }

  const targets = resolveTargets(positionals);
  const supervisorUp = await ping();
  let engine = null;

  for (const name of targets) {
    if (isAppService(name)) {
      if (!supervisorUp) {
        warn(`Cannot ${action} "${name}": no dev-server supervisor is running. Start one with \`bun run local up\`.`);
        continue;
      }
      const response = await request({ type: action, name }, { timeout: 60000 });
      if (response?.ok) ok(`${name} ${action === "stop" ? "stopped" : `${action}ed`}.`);
      else fail(`${name}: ${response?.error ?? "no answer from the stack"}`);
      continue;
    }

    engine ??= await ensureEngine();
    await containerLifecycle(engine, name, action, flags);
  }
}

async function containerLifecycle(engine, name, action, flags) {
  const service = CONTAINER_SERVICES[name];

  if (action === "stop") {
    const spinner = progress(`Stopping ${name}...`);
    const stopped = await stopContainer(engine, service.container);
    spinner.done(stopped ? `${name} stopped.` : `${name} was not running.`);
    return;
  }

  if (name === "postgres") {
    const spinner = progress(action === "restart" ? "Restarting Postgres..." : "Starting Postgres...");
    if (action === "restart" && (await containerState(engine, service.container)).exists) {
      await restartContainer(engine, service.container);
    } else {
      await startPostgres(engine);
    }
    spinner.update("Waiting for Postgres...");
    await waitForPort(service.port, { timeoutSeconds: 90 });
    const ready = await waitForPostgresReady(engine, 60);
    spinner.done(ready ? "Postgres is ready." : "Postgres is listening (readiness check timed out).");
    return;
  }

  // zero-cache: a plain restart keeps the old replica, which is usually the
  // thing you are trying to get rid of, so a rebuild is the default.
  const freshReplica = action === "restart" && !flags.soft;
  const spinner = progress(freshReplica ? "Rebuilding the Zero replica..." : "Starting zero-cache...");
  if (freshReplica) await clearZeroClientRecords(engine);
  await startZeroCache(engine, { freshReplica });
  spinner.update("Waiting for zero-cache...");
  const listening = await waitForPort(service.port, { timeoutSeconds: 90 });
  spinner.done(
    listening ? "zero-cache is up." : "zero-cache did not open its port; check its logs.",
  );
  if (freshReplica) {
    note("Reload any open browser tab: its Zero client is talking to a replica that no longer exists.");
  }
}

/* ---------------------------------------------------------------- logs --- */

async function commandLogs(positionals, flags) {
  if (positionals.length === 0) {
    throw new Error(`logs needs a service name. Try: ${ALL_NAMES.join(", ")}.`);
  }

  const [name] = resolveTargets(positionals, { allowGroups: false });
  const lines = Number(flags.lines ?? 200);
  const follow = Boolean(flags.follow);

  if (isContainerService(name)) {
    const engine = await ensureEngine({ autoStart: false });
    await containerLogs(engine, CONTAINER_SERVICES[name].container, { tail: lines, follow });
    return;
  }

  if (await ping()) {
    await streamSupervisorLogs(name, lines, follow);
    return;
  }

  const logFile = `${LOG_DIR}/${name}.log`;
  if (!existsSync(logFile)) {
    throw new Error(`No supervisor is running and there is no saved log at ${logFile}.`);
  }
  warn("No stack is running; showing the log from the last run.");
  printFileTail(logFile, lines);
}

async function streamSupervisorLogs(name, lines, follow) {
  const label = paint(APP_SERVICES[name].color ?? "cyan", `[${name}]`);

  await request(
    { type: "logs", name, lines, follow },
    {
      timeout: follow ? 0 : 15000,
      onMessage: (payload) => {
        if (!payload.ok) {
          fail(payload.error ?? "The stack refused that request.");
          return false;
        }
        if (payload.stream === "log") {
          console.log(`${label} ${payload.line}`);
          return true;
        }
        for (const entry of payload.data?.lines ?? []) {
          console.log(`${label} ${entry.line}`);
        }
        return follow;
      },
    },
  );
}

/* -------------------------------------------------------------- doctor --- */

async function commandDoctor() {
  heading("Environment");
  note(`${process.platform} ${process.arch}`);
  note(`node ${process.version}`);
  note(`bun ${(await bunVersion()) ?? "not installed"}`);
  note(`repo ${ROOT_DIR}`);

  const problems = [];
  const report = (good, message, fix) => {
    if (good) ok(message);
    else {
      fail(message);
      problems.push(fix ?? message);
    }
  };

  heading("Tooling");
  report(commandExists("bun"), "bun is on PATH", "Install Bun from https://bun.sh");

  const engine = detectEngine();
  report(Boolean(engine), engine ? `${engine.name} is on PATH` : "No container engine on PATH",
    "Install Docker Desktop, OrbStack, Colima, Rancher Desktop or Podman");

  if (engine) {
    const daemonUp = await isDaemonRunning(engine);
    if (daemonUp) ok(`${engine.name} daemon is running (${await engineVersion(engine)})`);
    else warn(`${engine.name} daemon is not running (\`bun run local up\` will start it)`);

    if (daemonUp) {
      for (const image of [POSTGRES_IMAGE, ZERO_IMAGE]) {
        const present = await imageExists(engine, image);
        if (present) ok(`image ${image} present`);
        else warn(`image ${image} not pulled yet (first run will download it)`);
      }
    }
  }

  heading("Configuration");
  report(hasEnvFile(), ".env exists", "Run `bun run local up`, which copies .env.example");
  const url = databaseUrl();
  report(
    isLocalDatabaseUrl(url),
    url ? `DATABASE_URL points at a local database` : "DATABASE_URL is unset (local default will be used)",
    "DATABASE_URL points somewhere remote; local up refuses to push a schema there",
  );

  heading("Zero version lockstep");
  for (const dir of ["packages/shared", "apps/web", "apps/api"]) {
    const installed = installedZeroVersion(dir);
    report(
      installed === ZERO_IMAGE_VERSION,
      `${dir}: @rocicorp/zero ${installed ?? "missing"} (image is ${ZERO_IMAGE_VERSION})`,
      `Line up @rocicorp/zero in ${dir} with ${ZERO_IMAGE_VERSION}, then run bun install`,
    );
  }

  heading("Ports");
  for (const name of [...CONTAINER_NAMES, ...APP_NAMES]) {
    const service = CONTAINER_SERVICES[name] ?? APP_SERVICES[name];
    const owners = await findPortOwners(service.port);
    const busy = owners.length > 0 || (await isPortOpen(service.port));
    if (!busy) ok(`${service.port} free (${name})`);
    else {
      const who = owners.map((owner) => `${owner.name} (${owner.pid})`).join(", ");
      note(`${service.port} in use by ${who || "a container"} (${name})`);
    }
  }

  heading("Summary");
  if (problems.length === 0) {
    ok("Nothing blocking. `bun run local up` should work.");
    return;
  }
  for (const problem of problems) fail(problem);
  process.exitCode = 1;
}

/* ------------------------------------------------------------------ run --- */

/** Rewrites the argv of an alias command so a detached relaunch runs `up`. */
function asUpArgs(rawArgs, aliasCommand) {
  return ["up", ...rawArgs.filter((token) => token !== aliasCommand)];
}

const HANDLERS = {
  up: (flags, positionals, rawArgs) => commandUp(flags, rawArgs),
  start: (flags, positionals, rawArgs) =>
    positionals.length === 0
      ? commandUp(flags, asUpArgs(rawArgs, "start"))
      : commandLifecycle("start", positionals, flags),
  down: (flags) => commandDown(flags),
  stop: (flags, positionals) =>
    positionals.length === 0 ? commandDown(flags) : commandLifecycle("stop", positionals, flags),
  restart: (flags, positionals) => commandLifecycle("restart", positionals, flags),
  reset: async (flags, positionals, rawArgs) => {
    await commandDown({ ...flags, "skip-ports": true });
    blank();
    await commandUp(flags, asUpArgs(rawArgs, "reset"));
  },
  status: () => commandStatus(),
  ps: () => commandStatus(),
  logs: (flags, positionals) => commandLogs(positionals, flags),
  doctor: () => commandDoctor(),
  help: () => usage(),
};

async function main() {
  const rawArgs = process.argv.slice(2);
  const { flags, positionals } = parseArgs(rawArgs);
  const command = positionals.shift() ?? "help";

  if (flags.help && command !== "help") {
    usage();
    return;
  }

  const handler = HANDLERS[command];
  if (!handler) {
    fail(`Unknown command "${command}".`);
    usage();
    process.exitCode = 1;
    return;
  }

  mkdirSync(STATE_DIR, { recursive: true });
  await handler(flags, positionals, rawArgs);
}

main().catch((error) => {
  blank();
  fail(String(error?.message ?? error));
  process.exitCode = 1;
});
