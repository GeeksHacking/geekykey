import { expect, test } from "@playwright/test";

/** A3 landscape with the 12 mm margins the print shop uses. */
const PAGE = {
  format: "A3",
  landscape: true,
  margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
};

test("the booth page prints on one A3 sheet", async ({ page }) => {
  await page.goto("/what-stays");
  await expect(
    page.getByRole("heading", { name: "What stays and what changes each event" }),
  ).toBeVisible();

  const pdf = await page.pdf({ ...PAGE, printBackground: true });
  const pageTree = /\/Type\s*\/Pages[\s\S]{0,200}?\/Count\s+(\d+)/.exec(pdf.toString("latin1"));

  expect(pageTree?.[1]).toBe("1");
});
