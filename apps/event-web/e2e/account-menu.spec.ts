import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * The dev build's key address, from `src/lib/constants.ts`: the e2e suite runs the mock dev
 * server, so the production address is not the one the screens carry.
 */
const KEY_URL = "http://localhost:5174/";

/** The event menu's one key-site link, in the same tab. Both roles share the menu. */
async function expectMyTokensLink(menu: Locator) {
  const myTokens = menu.getByRole("menuitem", { name: "My tokens" });
  await expect(myTokens).toHaveAttribute("href", KEY_URL);
  await expect(myTokens).not.toHaveAttribute("target");
}

async function signInAsParticipant(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Use this account" }).click();
  await expect(page.getByRole("heading", { name: "Alex Tan" })).toBeVisible();
}

for (const width of [360, 1280]) {
  test(`the account menu offers the key screens at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await signInAsParticipant(page);

    // The header has no separate switch.
    await expect(page.getByRole("navigation", { name: "Sites" })).toHaveCount(0);

    await page.getByRole("button", { name: "Account menu" }).click();
    const menu = page.getByRole("menu");

    await expect(menu.getByRole("menuitem", { name: "Key screens" })).toHaveCount(0);

    await expectMyTokensLink(menu);
  });
}

async function signInAsOrganiser(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("gk-mock-session", "dev-organizer-1"));
  await page.goto("/admin/stations");
  await expect(page.getByRole("heading", { name: "Stations" })).toBeVisible();
}

for (const width of [360, 1280]) {
  test(`the organiser account menu offers the key screens at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await signInAsOrganiser(page);

    await expect(page.getByRole("navigation", { name: "Sites" })).toHaveCount(0);
    await page.getByRole("button", { name: "Account menu" }).click();
    const menu = page.getByRole("menu");

    await expect(menu.getByRole("menuitem", { name: "Key screens" })).toHaveCount(0);
    await expectMyTokensLink(menu);
  });
}
