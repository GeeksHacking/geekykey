import { expect, test, type Page } from "@playwright/test";

/*
  FRO-64. The participant header is one row capped at max-w-3xl: the wordmark, the three tabs
  from md up, and the theme toggle with the account menu. The account button shows the display
  name from sm up, and agreement 8.7 allows 30 characters in any script, so a Google name is
  often wider than the room the row has left for it. The row has to give way at the name, not at
  the wordmark: a wordmark squeezed below its own text runs under the Home tab.
*/

const LONG_NAME = "Lee Jun Lei Adam Student";
/** The ticket's three widths, plus the phone width CLAUDE.md's definition of done asks for. */
const WIDTHS = [360, 768, 820, 1280];
const THEMES = ["light", "dark"] as const;

interface HeaderGeometry {
  theme: string;
  viewportWidth: number;
  pageScrollWidth: number;
  rowRight: number;
  rowPaddingRight: number;
  rowClientWidth: number;
  rowScrollWidth: number;
  wordmarkRight: number;
  wordmarkTextOverflow: number;
  firstTabLeft: number | null;
  accountRight: number;
  accountText: string;
}

async function signInAsParticipant(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Use this account" }).click();
  await expect(page.getByRole("heading", { name: "Alex Tan" })).toBeVisible();
}

/** Sets the name through the passport, the way a Google user's own name arrives (agreement 8.7). */
async function setDisplayName(page: Page) {
  await page.locator("header").getByRole("link", { name: "Passport" }).click();
  await page.getByRole("button", { name: "Change name" }).click();
  const dialog = page.getByRole("dialog", { name: "Change name" });
  await dialog.getByRole("textbox").fill(LONG_NAME);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  // A link, not a reload: the mock keeps the new name in memory for this page only.
  await page.locator("header").getByRole("link", { name: "Home", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
}

function readHeader(page: Page) {
  return page.evaluate((): HeaderGeometry => {
    const header = document.querySelector("header")!;
    const row = header.firstElementChild as HTMLElement;
    const wordmark = header.querySelector<HTMLElement>('a[aria-label="GeekyKey home"]')!;
    const wordmarkText = wordmark.querySelector<HTMLElement>("span")!;
    const sections = header.querySelector<HTMLElement>('nav[aria-label="Sections"]');
    // The nav is hidden below md but still in the DOM, where its first link reports x=0.
    const sectionsShown = !!sections && sections.getClientRects().length > 0;
    const firstTab = sectionsShown ? sections.querySelector<HTMLElement>('a[href="/"]') : null;
    const account = header.querySelector<HTMLElement>('button[aria-label="Account menu"]')!;

    return {
      theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
      viewportWidth: window.innerWidth,
      pageScrollWidth: document.documentElement.scrollWidth,
      rowRight: row.getBoundingClientRect().right,
      rowPaddingRight: Number.parseFloat(getComputedStyle(row).paddingRight),
      rowClientWidth: row.clientWidth,
      rowScrollWidth: row.scrollWidth,
      wordmarkRight: wordmark.getBoundingClientRect().right,
      wordmarkTextOverflow: wordmarkText.scrollWidth - wordmarkText.clientWidth,
      firstTabLeft: firstTab ? firstTab.getBoundingClientRect().left : null,
      accountRight: account.getBoundingClientRect().right,
      accountText: account.textContent ?? "",
    };
  });
}

test("a long display name leaves the header's tabs clear", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInAsParticipant(page);
  await setDisplayName(page);

  for (const theme of THEMES) {
    await page.emulateMedia({ colorScheme: theme });
    // The theme comes from the system preference (lib/theme.ts), so wait for the class React
    // sets before measuring anything.
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains("dark")))
      .toBe(theme === "dark");
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      const where = `${width}px in the ${theme} theme`;
      const header = await readHeader(page);

      expect(header.theme, `the page is in the ${theme} theme at ${where}`).toBe(theme);
      // The name is cut short visually; the whole name stays in the DOM.
      expect(header.accountText, `the account menu keeps the whole name at ${where}`).toContain(
        LONG_NAME,
      );
      // The wordmark's text stays inside its own box, so it cannot run under the tabs.
      expect(
        header.wordmarkTextOverflow,
        `the wordmark's text spills out of its box at ${where}`,
      ).toBeLessThanOrEqual(1);
      // Below md the sections move to the bottom navigation, so there is no tab to run into.
      if (header.firstTabLeft !== null) {
        expect(
          header.wordmarkRight,
          `the wordmark runs into the Home tab at ${where}`,
        ).toBeLessThanOrEqual(header.firstTabLeft + 0.5);
      }
      // Nothing else is pushed out of the row either.
      expect(header.rowScrollWidth, `the header row overflows at ${where}`).toBeLessThanOrEqual(
        header.rowClientWidth + 1,
      );
      expect(
        header.accountRight,
        `the account menu runs past the row at ${where}`,
      ).toBeLessThanOrEqual(header.rowRight - header.rowPaddingRight + 1);
      expect(header.pageScrollWidth, `the page scrolls sideways at ${where}`).toBeLessThanOrEqual(
        header.viewportWidth,
      );
    }
  }

  // The full name is the reason the header may cut it short, so it has to be readable.
  await page.getByRole("button", { name: "Account menu" }).click();
  await expect(page.getByRole("menu")).toContainText(LONG_NAME);
});
