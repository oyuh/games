/**
 * Reading (and bootstrapping) the repo root .env.
 */
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT_DIR } from "./config.mjs";
import { ok, warn } from "./ui.mjs";

const ENV_FILE = resolve(ROOT_DIR, ".env");
const ENV_EXAMPLE = resolve(ROOT_DIR, ".env.example");

export function parseDotEnv(contents) {
  const values = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }

  return values;
}

export function readDotEnv() {
  if (!existsSync(ENV_FILE)) return {};
  try {
    return parseDotEnv(readFileSync(ENV_FILE, "utf8"));
  } catch {
    return {};
  }
}

/** Real environment wins over the file, same as the apps do. */
export function envValue(name) {
  const fromProcess = process.env[name];
  if (fromProcess !== undefined && fromProcess !== "") return fromProcess;
  return readDotEnv()[name] ?? null;
}

export function hasEnvFile() {
  return existsSync(ENV_FILE);
}

/**
 * A missing .env used to fail several steps later with a confusing Drizzle
 * error. The example file is the documented local config, so just use it.
 */
export function ensureEnvFile() {
  if (existsSync(ENV_FILE)) return { created: false };

  if (!existsSync(ENV_EXAMPLE)) {
    warn("No .env and no .env.example to copy from. Local defaults will be used where possible.");
    return { created: false };
  }

  copyFileSync(ENV_EXAMPLE, ENV_FILE);
  ok("Created .env from .env.example.");
  return { created: true };
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0", "host.docker.internal"]);

/**
 * Guards the auto-approved schema push. Anything that is not clearly a local
 * database is treated as remote, because being wrong in that direction drops
 * production tables.
 */
export function isLocalDatabaseUrl(databaseUrl) {
  if (!databaseUrl || databaseUrl.trim() === "") return true;

  try {
    const url = new URL(databaseUrl);
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    return LOCAL_HOSTS.has(hostname) || LOCAL_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function databaseUrl() {
  return envValue("DATABASE_URL");
}

export { ENV_FILE, ENV_EXAMPLE };
