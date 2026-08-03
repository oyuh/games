/**
 * Dev runner for the API.
 *
 * `bun --watch` only watches files it imported, and it skips node_modules.
 * `@games/shared` resolves through a workspace symlink inside node_modules, so
 * editing anything in packages/shared never restarted the API: it kept serving
 * stale mutators until someone restarted it by hand. This watches both trees
 * and restarts on change. Node's fs.watch does it, so nothing new to install.
 */
import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../apps/api");
const WATCH_DIRS = [
  resolve(API_DIR, "src"),
  resolve(API_DIR, "../../packages/shared/src"),
];

let child = null;
let timer = null;
let stopping = false;

function start() {
  // Inherit stdio so API logs keep showing up in the turbo output as before.
  child = spawn("bun", ["src/index.ts"], { cwd: API_DIR, stdio: "inherit" });
  child.on("exit", (code) => {
    // A crash should not look like a clean shutdown, but a restart-kill should.
    if (!stopping && code !== null && code !== 0) {
      console.log(`[dev-api] exited with ${code}, waiting for a change...`);
    }
  });
}

function restart() {
  clearTimeout(timer);
  // Editors and formatters write in bursts; one restart is enough.
  timer = setTimeout(() => {
    const previous = child;
    child = null;
    if (!previous || previous.exitCode !== null) {
      start();
      return;
    }
    // Wait for the port to actually free up, otherwise the new process
    // races the old one and dies with EADDRINUSE.
    previous.once("exit", start);
    previous.kill();
  }, 150);
}

start();

for (const dir of WATCH_DIRS) {
  watch(dir, { recursive: true }, (_event, file) => {
    if (file && /\.(ts|tsx|json)$/.test(String(file))) restart();
  });
}

// Ctrl+C (or turbo shutting the task down) must take the API with it, or the
// next `bun dev` hits EADDRINUSE on a port nothing appears to own.
process.on("exit", () => child?.kill());
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopping = true;
    process.exit(0);
  });
}
