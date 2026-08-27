/**
 * Port inspection without external tools where possible.
 *
 * The old scripts required `nc` to wait on a port, which is not installed by
 * default on plenty of Linux images and on none of Windows. A plain TCP
 * connect answers the same question and ships with Node. Finding *who* owns a
 * port still needs the OS, so every known tool is tried in turn.
 */
import { connect } from "node:net";
import { IS_MAC, IS_WINDOWS, commandExists, run, sleep } from "./proc.mjs";

/**
 * True when something is listening and accepting connections.
 *
 * With no host, both loopback families are tried: Vite binds [::1] only, so an
 * IPv4-only probe reports the web server as down while the browser loads it
 * happily.
 */
export async function isPortOpen(port, host = null, timeout = 1000) {
  const hosts = host ? [host] : ["127.0.0.1", "::1"];

  for (const candidate of hosts) {
    if (await connectsTo(port, candidate, timeout)) return true;
  }

  return false;
}

function connectsTo(port, host, timeout) {
  return new Promise((resolve) => {
    const socket = connect({ port, host });
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeout);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

export async function waitForPort(port, { host = null, timeoutSeconds = 90, onTick } = {}) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  let attempt = 0;

  while (Date.now() < deadline) {
    if (await isPortOpen(port, host, 1000)) return true;
    attempt += 1;
    onTick?.(attempt, Math.max(0, Math.round((deadline - Date.now()) / 1000)));
    await sleep(500);
  }

  return false;
}

/** Every PID listening on a TCP port, with its process name when we can get it. */
export async function findPortOwners(port) {
  const pids = IS_WINDOWS ? await findPidsWindows(port) : await findPidsPosix(port);
  const unique = [...new Set(pids)].filter((pid) => pid > 0 && pid !== process.pid);

  return Promise.all(
    unique.map(async (pid) => ({ pid, name: await processName(pid) })),
  );
}

async function findPidsPosix(port) {
  if (commandExists("lsof")) {
    const result = await run("lsof", [`-tiTCP:${port}`, "-sTCP:LISTEN"], { timeout: 5000 });
    // lsof exits non-zero when nothing matches, which is not an error here.
    const pids = parsePids(result.stdout);
    if (pids.length > 0) return pids;
  }

  if (commandExists("ss")) {
    const result = await run("ss", ["-lptnH", `sport = :${port}`], { timeout: 5000 });
    const pids = [...result.stdout.matchAll(/pid=(\d+)/g)].map((match) => Number(match[1]));
    if (pids.length > 0) return pids;
  }

  // Only Linux's fuser understands a port argument; macOS ships a different
  // tool of the same name that answers with an error containing the port
  // number, which reads as a pid if you are careless about parsing it.
  if (!IS_MAC && commandExists("fuser")) {
    const result = await run("fuser", [`${port}/tcp`], { timeout: 5000 });
    if (result.ok) return parsePids(result.stdout);
  }

  return [];
}

async function findPidsWindows(port) {
  const result = await run("netstat", ["-ano", "-p", "tcp"], { timeout: 8000 });
  const pids = [];

  for (const line of result.stdout.split(/\r?\n/)) {
    if (!/LISTENING/i.test(line)) continue;
    const columns = line.trim().split(/\s+/);
    const local = columns[1] ?? "";
    // Matches both 0.0.0.0:3001 and [::]:3001, but not 0.0.0.0:30011.
    if (!local.endsWith(`:${port}`)) continue;
    const pid = Number(columns[columns.length - 1]);
    if (Number.isInteger(pid)) pids.push(pid);
  }

  return pids;
}

function parsePids(text) {
  return text
    .split(/\s+/)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
}

export async function processName(pid) {
  if (IS_WINDOWS) {
    const result = await run(
      "tasklist",
      ["/FI", `PID eq ${pid}`, "/NH", "/FO", "CSV"],
      { timeout: 5000 },
    );
    const match = result.stdout.match(/^"([^"]+)"/m);
    return match?.[1] ?? "unknown";
  }

  const result = await run("ps", ["-p", String(pid), "-o", "comm="], { timeout: 5000 });
  return result.stdout.split(/\r?\n/)[0]?.trim() || "unknown";
}

export function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

/** SIGTERM, then SIGKILL if it is still there. Kills the tree on Windows. */
export async function killProcess(pid, { graceMs = 1500 } = {}) {
  if (!isProcessAlive(pid)) return true;

  if (IS_WINDOWS) {
    await run("taskkill", ["/PID", String(pid), "/T", "/F"], { timeout: 10000 });
    return !isProcessAlive(pid);
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return true;
  }

  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return true;
    await sleep(100);
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Already gone between the check and the signal.
  }
  await sleep(200);
  return !isProcessAlive(pid);
}

/** Frees a port by killing whatever holds it. Returns what it stopped. */
export async function freePort(port) {
  const owners = await findPortOwners(port);
  const stopped = [];

  for (const owner of owners) {
    if (await killProcess(owner.pid)) stopped.push(owner);
  }

  return stopped;
}
