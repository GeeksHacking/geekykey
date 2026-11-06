import { expect, test, type Page } from "@playwright/test";

/**
 * The dev build's key address, from `src/lib/constants.ts`: the e2e suite runs the mock dev
 * server, so the production address is not the one the screens carry.
 */
const KEY_URL = "http://localhost:5174/";

async function signInAsParticipant(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Use this account" }).click();
  await expect(page.getByRole("heading", { name: "Alex Tan" })).toBeVisible();
}

for (const width of [360, 1280]) {
  test(`the header switches to the key screens at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await signInAsParticipant(page);

    const sites = page.getByRole("navigation", { name: "Sites" });
    await expect(sites).toBeVisible();

    // The current site is plain text, so there is nothing to follow to where we already are.
    const current = sites.getByText("Event", { exact: true });
    await expect(current).toHaveAttribute("aria-current", "page");
    await expect(sites.getByRole("link", { name: "Event" })).toHaveCount(0);

    const key = sites.getByRole("link", { name: "Key" });
    await expect(key).toBeVisible();
    await expect(key).toHaveAttribute("href", KEY_URL);
    await expect(key).not.toHaveAttribute("target");

    for (const control of [current, key]) {
      const fontSize = await control.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).fontSize),
      );
      expect(fontSize).toBeGreaterThanOrEqual(12);
    }

    // The row keeps every control inside the viewport, with the switch clear of the account
    // button and the theme toggle between them.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    const [sitesBox, accountBox] = await Promise.all([
      sites.boundingBox(),
      page.getByRole("button", { name: "Account menu" }).boundingBox(),
    ]);
    expect(sitesBox!.x + sitesBox!.width).toBeLessThanOrEqual(accountBox!.x);
  });
}

test("the account menu offers My tokens in a new tab", async ({ page }) => {
  await signInAsParticipant(page);
  await page.getByRole("button", { name: "Account menu" }).click();

  const myTokens = page.getByRole("menuitem", { name: "My tokens" });
  await expect(myTokens).toBeVisible();
  await expect(myTokens).toHaveAttribute("href", KEY_URL);
  await expect(myTokens).toHaveAttribute("target", "_blank");
});

async function signInAsOrganiser(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("gk-mock-session", "dev-organizer-1"));
  await page.goto("/admin/stations");
  await expect(page.getByRole("heading", { name: "Stations" })).toBeVisible();
}

test("the organiser console offers the switch in the sidebar and the phone header", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInAsOrganiser(page);

  const sidebar = page.locator("aside");
  await expect(sidebar.getByRole("navigation", { name: "Sites" })).toBeVisible();
  await expect(sidebar.getByText("Event")).toHaveAttribute("aria-current", "page");
  await expect(sidebar.getByRole("link", { name: "Key" })).toHaveAttribute("href", KEY_URL);

  await page.setViewportSize({ width: 360, height: 900 });
  const header = page.locator("header");
  await expect(header.getByRole("navigation", { name: "Sites" })).toBeVisible();
  await expect(header.getByText("Event")).toHaveAttribute("aria-current", "page");
  await expect(header.getByRole("link", { name: "Key" })).toBeVisible();

  // The phone header keeps its controls inside the row, whatever the page below holds.
  expect(
    await header.evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBeLessThanOrEqual(1);
});
