import { expect, test } from "@playwright/test";

async function signInAsParticipant(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Use this account" }).click();
  await expect(page.getByRole("heading", { name: "Alex Tan" })).toBeVisible();
}

test("participant login returns to the requested passport", async ({ page }) => {
  await page.goto("/login?return_to=%2Fpassport");
  await page.getByRole("button", { name: "Use this account" }).click();
  await expect(page).toHaveURL(/\/passport$/);
  await expect(page.getByRole("heading", { name: "Passport" })).toBeVisible();
});

test("participant cannot open organiser routes", async ({ page }) => {
  await signInAsParticipant(page);
  await page.goto("/admin/stations");

  await expect(page.getByRole("heading", { name: "Organisers only" })).toBeVisible();
});

test("the participant tabs fit, read and mark the current one at 360 px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await signInAsParticipant(page);

  const nav = page.locator('nav[aria-label="Sections"]:visible');
  await expect(nav).toBeVisible();

  for (const name of ["Home", "Passport", "Activity"]) {
    await expect(nav.getByRole("link", { name })).toBeVisible();
  }

  // 12 px is the smallest label FRO-71 allows on a phone.
  const links = nav.getByRole("link");
  for (let index = 0; index < (await links.count()); index += 1) {
    const fontSize = await links
      .nth(index)
      .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(12);
  }

  // The current tab is a pill inside the bar rather than a third of the screen, and only it
  // carries the kit's yellow fill.
  const home = nav.getByRole("link", { name: "Home" });
  await expect(home).toHaveAttribute("aria-current", "page");

  const pill = home.locator("span").first();
  const [navBox, pillBox] = await Promise.all([nav.boundingBox(), pill.boundingBox()]);
  expect(pillBox!.x).toBeGreaterThan(navBox!.x);
  expect(pillBox!.x + pillBox!.width).toBeLessThan(navBox!.x + navBox!.width);
  expect(await pill.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(
    "rgba(0, 0, 0, 0)",
  );

  const passportPill = nav.getByRole("link", { name: "Passport" }).locator("span").first();
  expect(await passportPill.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
    "rgba(0, 0, 0, 0)",
  );
});

test("a route change to the dashboard focuses its heading", async ({ page }) => {
  // FRO-49. The shell moves the focus to the new page's heading, so a screen-reader or
  // keyboard user hears which page they are on, and the dashboard is the page used most.
  await signInAsParticipant(page);
  const nav = page.locator('nav[aria-label="Sections"]:visible');

  await nav.getByRole("link", { name: "Passport" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Passport" })).toBeFocused();
  await nav.getByRole("link", { name: "Home" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Alex Tan" })).toBeFocused();
});
