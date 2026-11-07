import { expect, test, type Page } from "@playwright/test";

/*
  FRO-138. The token game sends no station taps, so its dashboard hint must say how to
  connect, not how to collect stamps. The mock's organiser never receives a simulated tap,
  so the hint stays for the browser check. The guest who finishes setup is covered by
  participant-setup.test.tsx, where the mock's simulator cannot take the hint away.
*/

async function signInAsParticipant(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Use this account" }).click();
  await expect(page.getByRole("heading", { name: "Alex Tan" })).toBeVisible();
}

async function signInAsOrganiser(page: Page) {
  await page.goto("/login");
  const account = page.getByLabel("Seeded account");
  await account.click();
  await page.getByRole("option", { name: "Priya Raman, organiser" }).click();
  await page.getByRole("button", { name: "Use this account" }).click();
  await expect(page.getByRole("heading", { name: "Stations" })).toBeVisible();
}

test("the organiser dashboard says how to connect when the event has the answers game", async ({
  page,
}) => {
  await signInAsOrganiser(page);
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "Tap someone's token with your phone to connect.",
    }),
  ).toBeVisible();
});

test("the participant dashboard has no hint after a station tap", async ({ page }) => {
  await signInAsParticipant(page);

  await expect(
    page.getByRole("heading", {
      name: "Tap someone's token with your phone to connect.",
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "Tap your token at any station to start collecting stamps",
    }),
  ).toHaveCount(0);
});
