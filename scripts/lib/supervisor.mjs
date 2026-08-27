/**
 * The dev-server supervisor.
 *
 * Turbo ran all three dev servers as one blob: if the admin server wedged,
 * the only fix was Ctrl+C and a full restart of the whole stack, database
 * push and all. Owning the child processes here is what makes
 * `local restart admin` possible, and it also means logs can be labelled,
 * kept, and read from another terminal.
 */
import { createWriteStream, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { APP_SERVICES, LOG_DIR, ROOT_DIR } from "./config.mjs";
import { IS_WINDOWS, spawnProcess, sleep } from "./proc.mjs";
import { isPortOpen, freePort } from "./ports.mjs";
import { dim, paint } from "./ui.mjs";

const MAX_BUFFERED_LINES = 600;
const READY_POLL_MS = 750;
const READY_TIMEOUT_MS = 120000;

function stamp() {
  return new Date().toISOString().slice(11, 23);
}

/** SIGTERM/SIGKILL the whole process group: `bun run dev` spawns children. */
async function killTree(child, { graceMs = 4000 } = {}) {
  if (!child || child.exitCode !== null || !child.pid) return;
  const pid = child.pid;

  const exited = new Promise((done) => {
    if (child.exitCode !== null) done();
    else child.once("exit", done);
  });

  if (IS_WINDOWS) {
    spawnProcess("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    signalGroup(pid, "SIGTERM");
  }

  const timedOut = await Promise.race([
    exited.then(() => false),
    sleep(graceMs).then(() => true),
  ]);

  if (timedOut && !IS_WINDOWS) {
    signalGroup(pid, "SIGKILL");
    await Promise.race([exited, sleep(1000)]);
  }
}

function signalGroup(pid, signal) {
  try {
    // Negative pid means "the group", which is why children are detached.
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // Already gone.
    }
  }
}

class ManagedProcess {
  constructor(name, config, { autoRestart = false, extraEnv = {} } = {}) {
    this.name = name;
    this.config = config;
    this.autoRestart = autoRestart;
    this.extraEnv = extraEnv;

    this.child = null;
    this.status = "stopped";
    this.startedAt = null;
    this.exitCode = null;
    this.restarts = 0;
    this.crashCount = 0;
    this.stopping = false;
    this.lines = [];
    this.subscribers = new Set();
    this.logStream = null;
    this.readyTimer = null;
    this.stdoutRest = "";
    this.stderrRest = "";
  }

  get logFile() {
    return resolve(LOG_DIR, `${this.name}.log`);
  }

  label() {
    return paint(this.config.color ?? "cyan", `[${this.name}]`);
  }

  emit(line, { internal = false } = {}) {
    const entry = { time: Date.now(), line };
    this.lines.push(entry);
    if (this.lines.length > MAX_BUFFERED_LINES) this.lines.shift();

    this.logStream?.write(`${stamp()} ${line}\n`);
    console.log(`${this.label()} ${internal ? dim(line) : line}`);

    for (const subscriber of this.subscribers) {
      subscriber({ service: this.name, line, time: entry.time });
    }
  }

  pipe(stream, key) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      const text = this[key] + chunk;
      const parts = text.split(/\r?\n/);
      this[key] = parts.pop() ?? "";
      for (const part of parts) this.emit(part);
    });
  }

  async start() {
    if (this.child && this.child.exitCode === null) return { started: false, reason: "already running" };

    mkdirSync(LOG_DIR, { recursive: true });
    // One file per run: a log that spans restarts is impossible to read.
    try {
      rmSync(this.logFile, { force: true });
    } catch {
      // Keep going; the stream will recreate it.
    }
    this.logStream = createWriteStream(this.logFile, { flags: "a" });

    const [command, ...args] = this.config.command;
    this.stopping = false;
    this.exitCode = null;
    this.status = "starting";
    this.startedAt = Date.now();

    this.child = spawnProcess(command, args, {
      cwd: resolve(ROOT_DIR, this.config.cwd),
      stdio: ["ignore", "pipe", "pipe"],
      detached: !IS_WINDOWS,
      env: this.extraEnv,
    });

    this.pipe(this.child.stdout, "stdoutRest");
    this.pipe(this.child.stderr, "stderrRest");

    this.child.on("error", (error) => {
      this.status = "crashed";
      this.emit(`could not start: ${error?.message ?? error}`, { internal: true });
    });

    this.child.on("exit", (code, signal) => {
      this.exitCode = code;
      const wasStopping = this.stopping;
      this.child = null;
      this.clearReadyWatch();
      this.logStream?.end();
      this.logStream = null;

      if (wasStopping) {
        this.status = "stopped";
        return;
      }

      this.status = "crashed";
      this.crashCount += 1;
      this.emit(
        `exited with ${signal ? `signal ${signal}` : `code ${code}`}. Restart with: bun run local restart ${this.name}`,
        { internal: true },
      );

      if (this.autoRestart && this.crashCount <= 5) {
        const delay = Math.min(10000, 500 * 2 ** (this.crashCount - 1));
        this.emit(`auto-restarting in ${Math.round(delay / 1000)}s...`, { internal: true });
        setTimeout(() => {
          if (this.status === "crashed") this.start();
        }, delay).unref?.();
      }
    });

    this.watchForReady();
    return { started: true };
  }

  /** A dev server is up when its port answers, not when the process spawns. */
  watchForReady() {
    this.clearReadyWatch();
    const deadline = Date.now() + READY_TIMEOUT_MS;

    const poll = async () => {
      if (!this.child || this.status === "stopped") return;
      if (await isPortOpen(this.config.port, null, 500)) {
        if (this.status === "starting") {
          this.status = "running";
          this.emit(`ready on ${this.config.url ?? `http://localhost:${this.config.port}`}`, {
            internal: true,
          });
        }
        return;
      }
      if (Date.now() > deadline) return;
      this.readyTimer = setTimeout(poll, READY_POLL_MS);
      this.readyTimer.unref?.();
    };

    this.readyTimer = setTimeout(poll, READY_POLL_MS);
    this.readyTimer.unref?.();
  }

  clearReadyWatch() {
    if (this.readyTimer) clearTimeout(this.readyTimer);
    this.readyTimer = null;
  }

  async stop() {
    this.clearReadyWatch();
    if (!this.child) {
      this.status = "stopped";
      return { stopped: false, reason: "not running" };
    }

    this.stopping = true;
    await killTree(this.child);
    this.child = null;
    this.status = "stopped";
    this.startedAt = null;
    return { stopped: true };
  }

  async restart() {
    await this.stop();
    // Vite and Next both hold their port for a moment after exit; a leftover
    // listener here is what used to turn a restart into EADDRINUSE.
    await this.waitForPortToClear();
    this.crashCount = 0;
    const result = await this.start();
    this.restarts += 1;
    return result;
  }

  async waitForPortToClear(timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!(await isPortOpen(this.config.port, null, 300))) return true;
      await sleep(200);
    }
    // Something unrelated to our child is squatting on it; take the port.
    const stopped = await freePort(this.config.port);
    if (stopped.length > 0) {
      this.emit(
        `port ${this.config.port} was held by ${stopped.map((p) => `${p.name} (${p.pid})`).join(", ")}; stopped it`,
        { internal: true },
      );
    }
    return stopped.length > 0;
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  tail(count) {
    return this.lines.slice(-count);
  }

  snapshot() {
    return {
      name: this.name,
      kind: "process",
      status: this.status,
      pid: this.child?.pid ?? null,
      port: this.config.port,
      url: this.config.url ?? null,
      describe: this.config.describe ?? "",
      uptimeMs: this.startedAt && this.child ? Date.now() - this.startedAt : null,
      restarts: this.restarts,
      exitCode: this.exitCode,
      logFile: this.logFile,
    };
  }
}

export class Supervisor {
  constructor({ only = null, autoRestart = false, extraEnv = {} } = {}) {
    const names = only ?? Object.keys(APP_SERVICES);
    this.processes = new Map(
      names.map((name) => [
        name,
        new ManagedProcess(name, APP_SERVICES[name], { autoRestart, extraEnv }),
      ]),
    );
    this.startedAt = Date.now();
  }

  get names() {
    return [...this.processes.keys()];
  }

  has(name) {
    return this.processes.has(name);
  }

  get(name) {
    return this.processes.get(name) ?? null;
  }

  async startAll() {
    for (const managed of this.processes.values()) {
      await managed.start();
    }
  }

  async stopAll() {
    await Promise.all([...this.processes.values()].map((managed) => managed.stop()));
  }

  snapshot() {
    return [...this.processes.values()].map((managed) => managed.snapshot());
  }
}
