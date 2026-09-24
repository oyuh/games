import { expect, test } from "@playwright/test";

// Solo games have to stay playable when the API and sync server are down.
test.beforeEach(async ({ context }) => {
  const api = new URL(process.env.E2E_API_URL ?? "http://localhost:3001");
  const sync = new URL(process.env.E2E_SYNC_URL ?? "http://localhost:4848");
  await context.route((url) => url.host === api.host || url.host === sync.host, (route) => route.abort());
});

for (const mode of ["Ranked run", "Endless run"]) {
  test(`pips starts a ${mode.toLowerCase()} with the backend offline`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/pips");
    await page.getByRole("radio", { name: new RegExp(`^${mode}`) }).click();
    await page.getByRole("button", { name: /^Start/ }).click();

    await expect(page.getByRole("region", { name: "Pips board" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Domino collection" }).getByRole("button", { name: /^Domino \d-\d$/ })).toHaveCount(6);
    expect(errors).toEqual([]);
  });

  test(`shikaku starts a ${mode.toLowerCase()} with the backend offline`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/shikaku");
    await page.getByRole("radio", { name: new RegExp(`^${mode}`) }).click();
    await page.getByRole("button", { name: /^Start/ }).click();

    // Easy is 5×5.
    await expect(page.getByRole("gridcell")).toHaveCount(25);
    expect(errors).toEqual([]);
  });
}
