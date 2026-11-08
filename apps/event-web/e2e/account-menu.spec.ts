import { expect, test } from "@playwright/test";

for (const width of [360, 768, 1280]) {
  for (const organiser of [false, true]) {
    test(`places and account stay separate for ${organiser ? "organisers" : "participants"} at ${width} px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(
        (id) => sessionStorage.setItem("gk-mock-session", id),
        organiser ? "dev-organizer-1" : "dev-user-1",
      );
      await page.goto(organiser ? "/admin/stations" : "/");
      const currentPlace = organiser ? "Organiser console" : "Event screens";
      const switcher = page.getByRole("button", { name: `Switch place, ${currentPlace}` });
      await switcher.focus();
      await page.keyboard.press("Enter");
      const menu = page.getByRole("menu");
      const myTokens = menu.getByRole("menuitem", { name: "My tokens" });
      await expect(myTokens).toHaveAttribute("href", "http://localhost:5174/");
      await expect(myTokens).not.toHaveAttribute("target");
      await expect(menu.getByRole("menuitem", { name: currentPlace, exact: true })).toHaveAttribute(
        "aria-current",
        /^(page|location)$/,
      );
      await expect(menu.getByRole("menuitem", { name: "Sign out" })).toHaveCount(0);
      if (organiser) {
        await expect(
          menu.getByRole("menuitem", { name: "Event screens", exact: true }),
        ).not.toHaveAttribute("aria-current");
        await menu.getByRole("menuitem", { name: "Event screens", exact: true }).click();
        await expect(page).toHaveURL(/\/$/);
        await page.getByRole("button", { name: "Switch place, Event screens" }).click();
        await page.getByRole("menuitem", { name: "Organiser console" }).click();
        await expect(page).toHaveURL(/\/admin\/stations$/);
      } else {
        await expect(menu.getByRole("menuitem", { name: "Organiser console" })).toHaveCount(0);
        await page.keyboard.press("Escape");
        await expect(switcher).toBeFocused();
      }
      await page.getByRole("button", { name: "Account menu" }).click();
      await expect(menu.getByRole("menuitem")).toHaveCount(1);
      await expect(menu.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
      await expect(page.getByText("Signed in as")).toBeVisible();
      await page.keyboard.press("Escape");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    });
  }
}

for (const theme of ["light", "dark"] as const) {
  test(`place-menu hover is immediate and the current place stays highlighted in ${theme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript(() => sessionStorage.setItem("gk-mock-session", "dev-user-1"));
    await page.goto("/");
    await page.getByRole("button", { name: "Switch place, Event screens" }).click();
    const menu = page.getByRole("menu");
    const other = menu.getByRole("menuitem", { name: "My tokens" });
    const current = menu.getByRole("menuitem", { name: "Event screens", exact: true });
    const activePage = page.locator('header nav a[data-status="active"]').first();
    const selectedColor = await activePage.evaluate((el) => getComputedStyle(el).backgroundColor);
    await other.hover();
    await expect(other).toBeFocused();
    await expect(current).toHaveCSS("background-color", selectedColor);
    await page.waitForTimeout(200);
    await current.hover();
    await expect(current).toBeFocused();
    const frames = await menu.evaluate(async (element) => {
      const [other, current] = element.querySelectorAll<HTMLElement>('[role="menuitem"]');
      const results: { other: string; current: string; property: string }[] = [];
      for (let frame = 0; frame < 5; frame++) {
        await new Promise(requestAnimationFrame);
        results.push({
          other: getComputedStyle(other!).backgroundColor,
          current: getComputedStyle(current!).backgroundColor,
          property: getComputedStyle(other!).transitionProperty,
        });
      }
      return results;
    });
    expect(new Set(frames.map((frame) => frame.other)).size).toBe(1);
    expect(frames.every((frame) => frame.property === "none")).toBe(true);
    expect(frames.every((frame) => frame.current === selectedColor)).toBe(true);
  });
}
