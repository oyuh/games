/**
 * Workspace-level preflight: dependencies, the Zero client/server version
 * lockstep, and the schema push.
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT_DIR, ZERO_IMAGE_VERSION } from "./config.mjs";
import { databaseUrl, isLocalDatabaseUrl } from "./env.mjs";
import { run, runInherit } from "./proc.mjs";
import { note, step, warn } from "./ui.mjs";

const ZERO_PACKAGE_CONSUMERS = ["packages/shared", "apps/web", "apps/api"];

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function installedZeroVersion(workspaceDir) {
  const local = resolve(ROOT_DIR, workspaceDir, "node_modules/@rocicorp/zero/package.json");
  const hoisted = resolve(ROOT_DIR, "node_modules/@rocicorp/zero/package.json");
  const manifest = readJson(local) ?? readJson(hoisted);
  return manifest?.version ?? null;
}

export function dependenciesInstalled() {
  return existsSync(resolve(ROOT_DIR, "node_modules"));
}

export async function installDependencies() {
  step("Installing workspace dependencies (bun install)...");
  const code = await runInherit("bun", ["install"], { cwd: ROOT_DIR });
  if (code !== 0) throw new Error("bun install failed. Fix the output above and rerun.");
}

/**
 * The zero-cache image and the installed client speak a versioned wire
 * protocol. When they drift, the socket still opens but the handshake never
 * completes, so the app just sits on "Sync server is waking up" forever. A
 * stale node_modules after a version bump is the usual cause, and it is
 * invisible unless you go looking, so check it up front.
 */
export async function ensureZeroVersionsMatch() {
  if (!dependenciesInstalled()) {
    await installDependencies();
  }

  let mismatched = ZERO_PACKAGE_CONSUMERS.filter(
    (dir) => installedZeroVersion(dir) !== ZERO_IMAGE_VERSION,
  );

  if (mismatched.length === 0) return;

  const found = installedZeroVersion(mismatched[0]);
  warn(
    found
      ? `zero-cache image is ${ZERO_IMAGE_VERSION} but the installed client is ${found}. Running bun install...`
      : "@rocicorp/zero is not installed yet. Running bun install...",
  );
  await installDependencies();

  mismatched = ZERO_PACKAGE_CONSUMERS.filter(
    (dir) => installedZeroVersion(dir) !== ZERO_IMAGE_VERSION,
  );

  if (mismatched.length > 0) {
    const details = mismatched
      .map((dir) => `${dir} -> ${installedZeroVersion(dir) ?? "missing"}`)
      .join(", ");
    throw new Error(
      `Zero version mismatch: image ${ZERO_IMAGE_VERSION} vs ${details}. Sync will never connect.\n` +
        "  Line up @rocicorp/zero in the package.json files with ZERO_IMAGE_VERSION in scripts/lib/config.mjs, then rerun.",
    );
  }

  clearViteDepCache();
}

/**
 * Vite serves @rocicorp/zero from its own pre-bundle, which survives an
 * install and would keep handing the browser the old client.
 */
export function clearViteDepCache() {
  const cache = resolve(ROOT_DIR, "apps/web/node_modules/.vite");
  if (!existsSync(cache)) return false;
  rmSync(cache, { recursive: true, force: true });
  note("Cleared the Vite dep cache so the browser picks up the new client.");
  return true;
}

/** docker-compose.yml is the manual-setup path; drift there is a real trap. */
export function composeZeroVersion() {
  const composePath = resolve(ROOT_DIR, "docker-compose.yml");
  if (!existsSync(composePath)) return null;
  const match = readFileSync(composePath, "utf8").match(/rocicorp\/zero:([\w.\-]+)/);
  return match?.[1] ?? null;
}

export function warnOnComposeDrift() {
  const composeVersion = composeZeroVersion();
  if (composeVersion && composeVersion !== ZERO_IMAGE_VERSION) {
    warn(
      `docker-compose.yml pins rocicorp/zero:${composeVersion} but this stack uses ${ZERO_IMAGE_VERSION}. ` +
        "Line them up before using the manual `docker compose up` path.",
    );
  }
}

export async function pushDatabaseSchema({ preserveData = false } = {}) {
  const url = databaseUrl();
  const local = isLocalDatabaseUrl(url);

  if (!local) {
    throw new Error(
      "DATABASE_URL does not point at a local database. Refusing to auto-approve schema changes.\n" +
        "  Run 'bun db:push' manually, or rerun with --skip-db-push.",
    );
  }

  if (preserveData) {
    const code = await runInherit("bun", ["run", "db:push"], { cwd: ROOT_DIR });
    if (code !== 0) throw new Error("Schema push failed.");
    return;
  }

  note("Auto-approving local Drizzle data-loss prompts.");
  const code = await runInherit("bun", ["run", "drizzle-kit", "push", "--force"], {
    cwd: resolve(ROOT_DIR, "packages/shared"),
  });
  if (code !== 0) throw new Error("Schema push failed.");
}

export async function bunVersion() {
  const result = await run("bun", ["--version"], { timeout: 10000 });
  return result.ok ? result.stdout.trim() : null;
}
