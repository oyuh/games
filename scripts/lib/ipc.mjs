/**
 * A tiny control channel between the running stack and other terminals.
 *
 * Node's IPC sockets are the one thing that works the same everywhere: a
 * named pipe on Windows, a unix socket elsewhere. The alternative was another
 * TCP port, which would then need its own conflict handling. Messages are
 * newline-delimited JSON.
 */
import { createServer as createNetServer, connect } from "node:net";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IS_WINDOWS } from "./proc.mjs";
import { ROOT_DIR, STATE_DIR, STATE_FILE } from "./config.mjs";
import { isProcessAlive } from "./ports.mjs";

/** Keyed by repo path so two checkouts never talk to each other's stack. */
export function socketPath() {
  const key = createHash("sha1").update(ROOT_DIR).digest("hex").slice(0, 10);
  return IS_WINDOWS
    ? `\\\\.\\pipe\\games-local-dev-${key}`
    : join(tmpdir(), `games-local-dev-${key}.sock`);
}

export function writeStateFile(state) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify({ ...state, root: ROOT_DIR }, null, 2));
}

export function readStateFile() {
  if (!existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

/**
 * `pid` scopes the delete to one stack. Without it, a supervisor shutting down
 * late (a --force takeover, say) would delete the state file its replacement
 * had already written, and every later `status` would report nothing running.
 */
export function clearStateFile({ pid = null } = {}) {
  if (pid !== null) {
    const state = readStateFile();
    if (state && state.pid !== pid) return;
  }

  try {
    rmSync(STATE_FILE, { force: true });
  } catch {
    // Nothing to clean up.
  }
}

/**
 * A state file alone is not proof: the supervisor may have been killed hard.
 * The pid check is cheap, and the caller can follow up with a real request.
 */
export function supervisorLooksAlive() {
  const state = readStateFile();
  if (!state?.pid) return false;
  if (!isProcessAlive(state.pid)) {
    clearStateFile({ pid: state.pid });
    return false;
  }
  return true;
}

export function createControlServer(handler) {
  const path = socketPath();

  // A stale socket file from a hard kill would make listen() fail with EADDRINUSE.
  if (!IS_WINDOWS && existsSync(path)) {
    try {
      rmSync(path, { force: true });
    } catch {
      // If it cannot be removed, listen() will report the real problem.
    }
  }

  const server = createNetServer((socket) => {
    socket.setEncoding("utf8");
    let buffer = "";

    const send = (payload) => {
      if (!socket.destroyed) socket.write(`${JSON.stringify(payload)}\n`);
    };

    socket.on("data", (chunk) => {
      buffer += chunk;
      let index = buffer.indexOf("\n");
      while (index !== -1) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (line) {
          let message = null;
          try {
            message = JSON.parse(line);
          } catch {
            send({ ok: false, error: "Malformed request." });
          }
          if (message) {
            Promise.resolve(handler(message, { send, socket })).catch((error) => {
              send({ id: message.id, ok: false, error: String(error?.message ?? error) });
            });
          }
        }
        index = buffer.indexOf("\n");
      }
    });

    socket.on("error", () => socket.destroy());
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(path, () => resolve({ server, path }));
  });
}

export function closeControlServer(server) {
  return new Promise((resolve) => {
    // A `logs -f` client would otherwise hold the server open forever, and
    // shutdown would hang waiting for someone to close their terminal.
    server.closeAllConnections?.();
    const safety = setTimeout(resolve, 2000);
    safety.unref?.();

    server.close(() => {
      clearTimeout(safety);
      if (!IS_WINDOWS) {
        try {
          rmSync(socketPath(), { force: true });
        } catch {
          // Already gone.
        }
      }
      resolve();
    });
  });
}

/**
 * Sends one request. With `onMessage`, stays connected and streams every
 * reply until the server hangs up or the caller's handler returns false.
 */
export function request(message, { timeout = 10000, onMessage = null } = {}) {
  return new Promise((resolve, reject) => {
    const socket = connect(socketPath());
    let buffer = "";
    let settled = false;
    let timer = null;

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve(value);
    };

    if (timeout > 0) {
      timer = setTimeout(() => finish(new Error("The stack did not answer in time.")), timeout);
      timer.unref?.();
    }

    socket.on("connect", () => {
      socket.write(`${JSON.stringify({ id: 1, ...message })}\n`);
    });

    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      buffer += chunk;
      let index = buffer.indexOf("\n");
      while (index !== -1) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (line) {
          let payload;
          try {
            payload = JSON.parse(line);
          } catch {
            index = buffer.indexOf("\n");
            continue;
          }

          if (!onMessage) {
            finish(null, payload);
            return;
          }
          // Streaming callers get every frame and decide when they are done.
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          if (onMessage(payload) === false) {
            finish(null, payload);
            return;
          }
        }
        index = buffer.indexOf("\n");
      }
    });

    socket.on("error", (error) => {
      finish(
        error?.code === "ENOENT" || error?.code === "ECONNREFUSED"
          ? new Error("NOT_RUNNING")
          : error,
      );
    });
    socket.on("close", () => finish(null, null));
  });
}

/** True when a supervisor is up and actually answering. */
export async function ping() {
  if (!supervisorLooksAlive()) return false;
  try {
    const response = await request({ type: "ping" }, { timeout: 3000 });
    return Boolean(response?.ok);
  } catch {
    return false;
  }
}
