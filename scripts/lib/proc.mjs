/**
 * Cross-platform process helpers.
 *
 * The awkward part is Windows: `bun`, `docker` and friends are often `.cmd`
 * or `.bat` shims, and Node refuses to spawn those without a shell. Rather
 * than turning `shell: true` on globally (which would make every argument a
 * quoting hazard), commands are resolved against PATH/PATHEXT first and only
 * batch files get routed through cmd.exe the way npm does it.
 */
import { spawn } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";

export const IS_WINDOWS = process.platform === "win32";
export const IS_MAC = process.platform === "darwin";
export const IS_LINUX = process.platform === "linux";

const resolveCache = new Map();

/** Absolute path of an executable on PATH, or null. */
export function resolveCommand(name) {
  if (resolveCache.has(name)) return resolveCache.get(name);

  const found = lookupCommand(name);
  resolveCache.set(name, found);
  return found;
}

function lookupCommand(name) {
  if (name.includes("/") || name.includes("\\")) {
    return isExecutable(name) ? name : null;
  }

  const pathValue = process.env.PATH ?? process.env.Path ?? "";
  const extensions = IS_WINDOWS
    ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
    : [""];

  for (const dir of pathValue.split(delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = join(dir, name + extension);
      if (isExecutable(candidate)) return candidate;
    }
  }

  return null;
}

function isExecutable(candidate) {
  try {
    if (!statSync(candidate).isFile()) return false;
    if (IS_WINDOWS) return true;
    accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function commandExists(name) {
  return resolveCommand(name) !== null;
}

const BATCH_PATTERN = /\.(cmd|bat)$/i;

/** Turns a command into something `child_process.spawn` will actually run. */
function prepare(command, args) {
  const resolved = resolveCommand(command) ?? command;

  if (IS_WINDOWS && BATCH_PATTERN.test(resolved)) {
    const comspec = process.env.ComSpec ?? "cmd.exe";
    const line = [resolved, ...args].map(quoteForCmd).join(" ");
    return {
      file: comspec,
      args: ["/d", "/s", "/c", `"${line}"`],
      options: { windowsVerbatimArguments: true },
    };
  }

  return { file: resolved, args, options: {} };
}

function quoteForCmd(value) {
  const text = String(value);
  if (text === "") return '""';
  if (!/[\s"^&|<>()]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

/** Spawn without capturing: caller owns the streams. */
export function spawnProcess(command, args = [], options = {}) {
  const { file, args: finalArgs, options: extra } = prepare(command, args);
  return spawn(file, finalArgs, {
    ...options,
    ...extra,
    env: { ...process.env, ...(options.env ?? {}) },
  });
}

/** Run to completion, capturing output. Never rejects on a non-zero exit. */
export function run(command, args = [], options = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnProcess(command, args, {
        ...options,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      resolve({ code: -1, stdout: "", stderr: String(error?.message ?? error), ok: false });
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer = null;

    const finish = (code) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim(), ok: code === 0 });
    };

    if (options.timeout) {
      timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(-1);
      }, options.timeout);
      timer.unref?.();
    }

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      stderr += String(error?.message ?? error);
      finish(-1);
    });
    child.on("close", (code) => finish(code ?? -1));
  });
}

/** Run to completion with the parent's streams attached. */
export function runInherit(command, args = [], options = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnProcess(command, args, { ...options, stdio: "inherit" });
    } catch {
      resolve(-1);
      return;
    }
    child.on("error", () => resolve(-1));
    child.on("close", (code) => resolve(code ?? -1));
  });
}

/** Fire and forget: used to nudge a Docker desktop app awake. */
export function spawnDetached(command, args = [], options = {}) {
  try {
    const child = spawnProcess(command, args, {
      ...options,
      stdio: "ignore",
      detached: true,
    });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

export function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export function pathExists(candidate) {
  try {
    statSync(isAbsolute(candidate) ? candidate : join(process.cwd(), candidate));
    return true;
  } catch {
    return false;
  }
}
