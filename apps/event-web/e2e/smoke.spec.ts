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

test("mobile participant layout keeps its bottom navigation usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsParticipant(page);

  const mobileNav = page.getByRole("navigation", { name: "Sections" }).last();
  await expect(mobileNav).toBeVisible();
  await expect(mobileNav.getByRole("link", { name: "Passport" })).toBeVisible();
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
