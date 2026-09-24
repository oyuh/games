// webServer only waits for the web app, and the stack starts the API
// alongside it without waiting, so hold the run until the API answers too.
export default async function waitForApi() {
  const health = new URL("/health", process.env.E2E_API_URL ?? "http://localhost:3001");
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const ok = await fetch(health).then((res) => res.ok, () => false);
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`API never answered at ${health}`);
}
