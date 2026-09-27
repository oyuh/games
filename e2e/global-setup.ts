// webServer only waits for the web app, and the stack starts the API
// alongside it without waiting, so hold the run until the API answers too.
// Says how long it has been waiting, so a slow start reads as progress in the
// CI log rather than a hang.
export default async function waitForApi() {
  const health = new URL("/health", process.env.E2E_API_URL ?? "http://localhost:3001");
  const started = Date.now();
  const deadline = started + 120_000;
  let lastReport = started;
  console.log(`[e2e] waiting for the API at ${health}`);
  while (Date.now() < deadline) {
    const ok = await fetch(health).then((res) => res.ok, () => false);
    if (ok) {
      console.log(`[e2e] API is up after ${Math.round((Date.now() - started) / 1000)}s`);
      return;
    }
    if (Date.now() - lastReport >= 10_000) {
      lastReport = Date.now();
      console.log(`[e2e] still waiting for the API, ${Math.round((lastReport - started) / 1000)}s so far`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`API never answered at ${health}`);
}
