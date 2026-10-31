import { expect, test, type Page } from "@playwright/test";

/*
  Switching tabs moves the yellow highlight in one frame. A colour transition on the links once
  faded the old tab out while the new one faded in, so for 150 ms both were half lit and the
  tabs seemed to flicker between the two. src/test/highlight-motion.test.ts keeps the
  transition out of the source; this checks what the browser paints.
*/

/** How long to watch after the click: the old transition was 150 ms. */
const WATCH_MS = 400;

async function signInAsParticipant(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("gk-mock-session", "dev-user-1"));
}

async function signInAsOrganiser(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("gk-mock-session", "dev-organizer-1"));
}

/**
 * Starts counting, on every frame, the links in `nav` painted in the highlight's colour at any
 * alpha, so a half-faded tab counts. Hover paints another colour, so the link under the mouse
 * does not.
 */
async function watchHighlights(page: Page, nav: string) {
  await page.evaluate(
    ({ nav, watchMs }) => {
      const rgb = (colour: string) => colour.match(/\d+, \d+, \d+/)?.[0];
      const active = document.querySelector<HTMLElement>(`${nav} a[data-status="active"]`);
      const highlight = active ? rgb(getComputedStyle(active).backgroundColor) : undefined;
      const counts: number[] = [];
      (window as unknown as { highlightCounts: number[] }).highlightCounts = counts;
      const start = performance.now();
      const frame = () => {
        const links = [...document.querySelectorAll<HTMLElement>(`${nav} a`)];
        counts.push(
          links.filter((link) => {
            const colour = getComputedStyle(link).backgroundColor;
            return colour !== "rgba(0, 0, 0, 0)" && rgb(colour) === highlight;
          }).length,
        );
        if (performance.now() - start < watchMs) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    },
    { nav, watchMs: WATCH_MS },
  );
}

async function highlightCounts(page: Page): Promise<number[]> {
  await page.waitForTimeout(WATCH_MS + 100);
  return page.evaluate(() => (window as unknown as { highlightCounts: number[] }).highlightCounts);
}

test.use({ viewport: { width: 1280, height: 900 } });

test("the participant header lights one tab at a time", async ({ page }) => {
  const nav = 'header nav[aria-label="Sections"]';
  await signInAsParticipant(page);
  await page.goto("/");
  await expect(page.locator(`${nav} a[data-status="active"]`)).toHaveText("Home");

  for (const tab of ["Passport", "Activity", "Home"]) {
    await watchHighlights(page, nav);
    await page.locator(nav).getByRole("link", { name: tab }).click();
    expect(Math.max(...(await highlightCounts(page)))).toBe(1);
    await expect(page.locator(`${nav} a[data-status="active"]`)).toHaveText(tab);
  }
});

test("the organiser sidebar lights one item at a time", async ({ page }) => {
  const nav = 'aside nav[aria-label="Console"]';
  await signInAsOrganiser(page);
  await page.goto("/admin/stations");
  await expect(page.locator(`${nav} a[data-status="active"]`)).toHaveText("Stations");

  for (const item of ["Scan log", "QR fallback", "Summary", "Stations"]) {
    await watchHighlights(page, nav);
    await page.locator(nav).getByRole("link", { name: item }).click();
    expect(Math.max(...(await highlightCounts(page)))).toBe(1);
    await expect(page.locator(`${nav} a[data-status="active"]`)).toHaveText(item);
  }
});
