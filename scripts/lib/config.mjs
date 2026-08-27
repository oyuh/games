/**
 * One description of the local stack, shared by every command.
 *
 * The old shell scripts each carried their own copy of the container names,
 * ports and image tags, and they had already drifted: the bash script ran
 * standalone containers while the PowerShell one ran docker compose, so the
 * two platforms were not even starting the same stack. Everything now reads
 * from here.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const STATE_DIR = resolve(ROOT_DIR, ".local-dev");
export const LOG_DIR = resolve(STATE_DIR, "logs");
export const STATE_FILE = resolve(STATE_DIR, "supervisor.json");

export const ZERO_IMAGE_VERSION = "1.8.0";
export const ZERO_IMAGE = `rocicorp/zero:${ZERO_IMAGE_VERSION}`;
export const POSTGRES_IMAGE = "postgres:16-alpine";

export const NETWORK_NAME = "games-local-dev";
export const POSTGRES_VOLUME = "games-pg-data";
export const ZERO_VOLUME = "games-zero-data";

/** Dev servers the supervisor owns: started, watched, restartable one by one. */
export const APP_SERVICES = {
  api: {
    label: "api",
    color: "magenta",
    port: 3001,
    cwd: "apps/api",
    command: ["bun", "run", "dev"],
    url: "http://localhost:3001",
    readyPath: "/",
    describe: "Hono API, Zero query/mutate endpoints",
  },
  web: {
    label: "web",
    color: "cyan",
    port: 5173,
    cwd: "apps/web",
    command: ["bun", "run", "dev"],
    url: "http://localhost:5173",
    describe: "Vite React app",
  },
  admin: {
    label: "admin",
    color: "yellow",
    port: 3002,
    cwd: "apps/admin",
    command: ["bun", "run", "dev"],
    url: "http://localhost:3002",
    describe: "Next.js admin app",
  },
};

/** Containers the stack needs before any dev server is worth starting. */
export const CONTAINER_SERVICES = {
  postgres: {
    label: "postgres",
    color: "blue",
    container: "games-local-postgres",
    port: 5432,
    image: POSTGRES_IMAGE,
    describe: "Postgres 16 (logical replication on)",
  },
  "zero-cache": {
    label: "zero-cache",
    color: "green",
    container: "games-local-zero-cache",
    port: 4848,
    image: ZERO_IMAGE,
    url: "http://localhost:4848",
    describe: "Zero sync server",
  },
};

export const APP_NAMES = Object.keys(APP_SERVICES);
export const CONTAINER_NAMES = Object.keys(CONTAINER_SERVICES);
export const ALL_NAMES = [...CONTAINER_NAMES, ...APP_NAMES];

/** Accepts the shorthands people actually type. */
export const SERVICE_ALIASES = {
  db: "postgres",
  postgresql: "postgres",
  pg: "postgres",
  zero: "zero-cache",
  zerocache: "zero-cache",
  sync: "zero-cache",
  server: "api",
  backend: "api",
  frontend: "web",
  ui: "web",
  vite: "web",
  next: "admin",
};

export function resolveServiceName(name) {
  const key = String(name).trim().toLowerCase();
  return SERVICE_ALIASES[key] ?? key;
}

export function isAppService(name) {
  return Object.hasOwn(APP_SERVICES, name);
}

export function isContainerService(name) {
  return Object.hasOwn(CONTAINER_SERVICES, name);
}

export function getService(name) {
  return APP_SERVICES[name] ?? CONTAINER_SERVICES[name] ?? null;
}
