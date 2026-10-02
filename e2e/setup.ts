/**
 * Preloaded by e2e/bunfig.toml. Reuses a stack that is already up; otherwise
 * starts Postgres, zero-cache, the API and the web app the same way
 * `bun run local up` does, and stops it once the run ends. Admin is left out
 * because nothing here tests it.
 */
import { afterAll } from "bun:test";
import { join } from "node:path";
import { baseURL, closeBrowser } from "./fixtures";

const apiHealth = new URL("/health", process.env.E2E_API_URL ?? "http://localhost:3001");
const answers = (url: string | URL) => fetch(url).then((res) => res.ok, () => false);

/** Polls until `url` answers, saying how long it has been so a slow start reads as progress. */
async function waitFor(label: string, url: string | URL, timeoutMs: number, gaveUp: () => boolean = () => false) {
  const started = Date.now();
  let lastReport = started;
  console.log(`[e2e] waiting for ${label} at ${url}`);
  while (Date.now() - started < timeoutMs) {
    if (await answers(url)) {
      console.log(`[e2e] ${label} is up after ${Math.round((Date.now() - started) / 1000)}s`);
      return;
    }
    if (gaveUp()) throw new Error(`The stack exited before ${label} answered at ${url}`);
    if (Date.now() - lastReport >= 10_000) {
      lastReport = Date.now();
      console.log(`[e2e] still waiting for ${label}, ${Math.round((lastReport - started) / 1000)}s so far`);
    }
    await Bun.sleep(1_000);
  }
  throw new Error(`${label} never answered at ${url}`);
}

/** Prints a stack stream line by line with a prefix, so it reads apart from test output. */
async function relay(stream: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  let pending = "";
  for await (const chunk of stream) {
    const lines = (pending + decoder.decode(chunk, { stream: true })).split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) console.log(`[stack] ${line}`);
  }
}

let stopStack = async () => {};

if (!(await answers(baseURL))) {
  const stack = Bun.spawn(["node", "scripts/local.mjs", "up", "--only", "api,web"], {
    cwd: join(import.meta.dir, ".."),
    stdout: "pipe",
    stderr: "pipe",
  });
  // Show the stack coming up (containers, the API, Vite) rather than a
  // silent wait of a minute or more before the first test.
  void relay(stack.stdout);
  void relay(stack.stderr);
  const gone = () => stack.exitCode !== null || stack.signalCode !== null;
  process.once("exit", () => stack.kill("SIGTERM"));
  stopStack = async () => {
    if (gone()) return;
    stack.kill("SIGTERM");
    await stack.exited;
  };
  await waitFor("the web app", baseURL, 300_000, gone);
}

// The stack starts the API alongside the web app without waiting for it.
await waitFor("the API", apiHealth, 120_000);

afterAll(async () => {
  await closeBrowser();
  await stopStack();
});
