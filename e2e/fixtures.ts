/**
 * What Playwright's test runner used to hand each test, rebuilt on bun:test.
 * Playwright stays as the browser library and its `expect`, which still
 * waits and retries on locators outside its own runner.
 */
import { test as bunTest } from "bun:test";
import { join } from "node:path";
import { chromium, expect as playwrightExpect, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from "@playwright/test";

export const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

export const expect = playwrightExpect.configure({ timeout: 15_000 });

const TIMEOUT = 150_000;
// Every test hits the same local API from one IP, so they run one at a time,
// which bun:test does anyway. CI gets one retry for a flaky boot.
const RETRIES = process.env.CI ? 1 : 0;
const RESULTS = join(import.meta.dir, "test-results");

let launched: Promise<Browser> | undefined;

/** One browser for the whole run. Set PW_CHANNEL=chrome (or msedge) to use an
 *  installed browser instead of the one `bunx playwright install chromium` downloads. */
function launch() {
  const channel = process.env.PW_CHANNEL;
  launched ??= chromium.launch(channel ? { channel } : {});
  return launched;
}

export async function closeBrowser() {
  if (launched) await (await launched).close();
}

export type Fixtures = { browser: Browser; context: BrowserContext; page: Page };

const attempts = new Map<string, number>();

/**
 * A browser test. Every context it opens, through `browser.newContext()` too,
 * gets the base URL and viewport and is traced. Traces are kept only for a
 * failed attempt, in test-results/, and open with `bunx playwright show-trace`.
 */
export function test(name: string, body: (fixtures: Fixtures) => Promise<void>, timeout = TIMEOUT) {
  bunTest(
    name,
    async () => {
      const browser = await launch();
      const contexts: BrowserContext[] = [];
      const newContext = async (options?: BrowserContextOptions) => {
        // Below 1440 wide the fixed sidebar covers the left column of game cards.
        const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, ...options });
        await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
        contexts.push(context);
        return context;
      };
      const tracked = new Proxy(browser, {
        get: (target, key) => {
          if (key === "newContext") return newContext;
          if (key === "newPage") return async (options?: BrowserContextOptions) => (await newContext(options)).newPage();
          return Reflect.get(target, key, target);
        },
      });

      const context = await newContext();
      const page = await context.newPage();
      let failed = true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        // Our own deadline, a little ahead of bun's, so a stuck test still
        // gets its trace saved and its contexts closed.
        const run = body({ browser: tracked, context, page });
        run.catch(() => {});
        await Promise.race([
          run,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Test timed out after ${timeout / 1000}s`)), timeout);
          }),
        ]);
        failed = false;
      } finally {
        clearTimeout(timer);
        const attempt = (attempts.get(name) ?? 0) + 1;
        attempts.set(name, attempt);
        const dir = join(RESULTS, slug(name) + (attempt > 1 ? `-retry${attempt - 1}` : ""));
        await Promise.all(
          contexts.map((c, i) => c.tracing.stop(failed ? { path: join(dir, `trace-${i + 1}.zip`) } : undefined).catch(() => {})),
        );
        await Promise.all(contexts.map((c) => c.close().catch(() => {})));
        if (failed) console.log(`[e2e] traces kept in ${dir}`);
      }
    },
    { timeout: timeout + 30_000, retry: RETRIES },
  );
}

/** A named step, logged so the CI output says how far a test got. */
export async function step<T>(title: string, body: () => Promise<T>): Promise<T> {
  console.log(`[e2e]   ${title}`);
  return body();
}

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}
