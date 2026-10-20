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
