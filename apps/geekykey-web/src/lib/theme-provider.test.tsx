import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { ThemeProvider } from "@/lib/theme-provider";
import { THEME_STORAGE_KEY } from "@/lib/theme";

/** The class index.html toggles, and the only thing that makes a theme token resolve. */
function themeClass(): boolean {
  return document.documentElement.classList.contains("dark");
}

function renderToggle() {
  render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

/**
 * Opens the menu with the keyboard rather than a click. Radix popups opened by a synthetic
 * click only mount in the first test of a file here, which silently turns later assertions
 * into "element not found". Keyboard opening is reliable, and it is the path a keyboard
 * user takes anyway.
 */
async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  screen.getByRole("button", { name: "Change theme" }).focus();
  await user.keyboard("{Enter}");
  return screen.findByRole("menuitemradio", { name: /System/ });
}

async function choose(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await openMenu(user);
  await user.click(await screen.findByRole("menuitemradio", { name }));
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

describe("ThemeProvider and ThemeToggle", () => {
  it("offers system, light and dark", async () => {
    const user = userEvent.setup();
    renderToggle();

    await openMenu(user);

    expect(screen.getByRole("menuitemradio", { name: /System/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: /Light/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: /Dark/ })).toBeInTheDocument();
  });

  it("applies and stores a manual light choice", async () => {
    const user = userEvent.setup();
    renderToggle();
    // The stub reports no light preference, so the fallback is dark.
    expect(themeClass()).toBe(true);

    await choose(user, /Light/);

    expect(themeClass()).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("switches back to dark and stores it", async () => {
    const user = userEvent.setup();
    renderToggle();

    await choose(user, /Dark/);

    expect(themeClass()).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("clears the stored choice when it goes back to system", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    const user = userEvent.setup();
    renderToggle();

    await choose(user, /System/);

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    // Back to the dark fallback the system reports here.
    expect(themeClass()).toBe(true);
  });

  it("reads a stored light preference on the next load", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    renderToggle();

    expect(themeClass()).toBe(false);
  });

  it("keeps working when storage throws", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("private mode");
    });
    const user = userEvent.setup();
    renderToggle();

    await choose(user, /Light/);

    // The choice still applies for this session.
    expect(themeClass()).toBe(false);
    setItem.mockRestore();
  });

  it("has an accessible label on the trigger", () => {
    renderToggle();
    expect(screen.getByRole("button", { name: "Change theme" })).toBeInTheDocument();
  });
});
