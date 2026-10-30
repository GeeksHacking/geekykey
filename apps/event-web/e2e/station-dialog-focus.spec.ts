import { expect, test, type Page } from "@playwright/test";

/*
  FRO-99 and FRO-100. A row's dialogs open from its Actions menu, and closing one puts the
  keyboard back on that menu's button. The tests in src/features/stations/dialog-focus.test.tsx
  check the same thing in jsdom, but jsdom passed them with and without a guard on the menu's
  onCloseAutoFocus, so only a real browser can say where the focus goes between the menu
  closing and the dialog opening. Radix also sets pointer-events: none on <body> while a
  modal is open, and a close that goes wrong can leave it there, so every click on the page
  stops working.

  In Chromium the focus comes back by two routes: the menu hands it to its button before the
  dialog opens, and returnFocusOnClose (dialog-focus.ts) puts it there when the dialog closes.
  Either one is enough. These tests fail when both are gone, which was checked on 30 Oct 2026
  by preventing the menu's onCloseAutoFocus and turning returnFocusOnClose into a no-op.
*/

const STATION = "3D Printing Booth";

/** Each item that opens a dialog, in menu order. Replace key and Disable ask first, in an alert. */
const ITEMS = [
  { item: "Edit passport settings…", role: "dialog" },
  { item: "Change booth…", role: "dialog" },
  { item: "Replace key…", role: "alertdialog" },
  { item: "Disable station…", role: "alertdialog" },
] as const;

/**
 * The mock's session key, which CLAUDE.md documents. The dev-login form would need a Radix
 * Select, and CLAUDE.md notes that it ignores a synthetic click.
 */
async function signInAsOrganiser(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("gk-mock-session", "dev-organizer-1"));
}

for (const [index, { item, role }] of ITEMS.entries()) {
  test(`${item} from the keyboard takes the focus in and gives it back`, async ({ page }) => {
    await signInAsOrganiser(page);
    await page.goto("/admin/stations");
    await expect(page.getByRole("heading", { name: "Stations" })).toBeVisible();

    const trigger = page.getByRole("button", { name: `Actions for ${STATION}` });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const items = page.getByRole("menu").getByRole("menuitem");
    await expect(items.first()).toBeFocused();

    // One step at a time: a press sent before Radix has moved the focus is lost.
    for (let step = 1; step <= index; step += 1) {
      await page.keyboard.press("ArrowDown");
      await expect(items.nth(step)).toBeFocused();
    }
    await expect(items.nth(index)).toHaveText(item);
    await page.keyboard.press("Enter");

    const dialog = page.getByRole(role);
    await expect(dialog).toBeVisible();
    await expect
      .poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
      .toBe(true);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(page.locator("body")).not.toHaveCSS("pointer-events", "none");
  });
}
