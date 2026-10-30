import { render, screen, waitFor } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { createMockClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID } from "@/api/mock/fixtures";
import { StationsScreen } from "@/features/stations/stations-screen";
import { createTestProviders } from "@/test/providers";

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});

function renderBoard() {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(SEEDED_ORGANIZER_ID);
  const { Providers } = createTestProviders(api);
  render(
    <Providers>
      <StationsScreen />
    </Providers>,
  );
  return api;
}

/** The station the fixtures give passport settings and a booth (agreement 9.1, 9.12). */
const NAMED = "3D Printing Booth";
/** A fixture station with no passport settings and no booth. */
const BARE = "Station 6";

async function open(user: UserEvent, name: string) {
  const button = await screen.findByRole("button", { name });
  await user.click(button);
  return button;
}

/**
 * The dialog is gone and the keyboard is back where it was. Radix moves focus on close in a
 * timeout, so this waits rather than reading once (FRO-99).
 */
async function expectFocusBack(button: HTMLElement) {
  await waitFor(() => expect(document.activeElement).toBe(button));
}

describe("a station board dialog returns focus to its row (FRO-99)", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("puts it back on the passport settings button after Escape", async () => {
    const user = userEvent.setup();
    renderBoard();

    const button = await open(user, `Change passport settings for ${NAMED}`);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");

    await expectFocusBack(button);
  });

  it("puts it back on the Add to passport button, which has no settings yet", async () => {
    const user = userEvent.setup();
    renderBoard();

    const button = await open(user, `Add to passport ${BARE}`);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");

    await expectFocusBack(button);
  });

  it("puts it on the renamed passport button after a save", async () => {
    const user = userEvent.setup();
    renderBoard();

    await open(user, `Add to passport ${NOT_IN_PASSPORT}`);
    await user.type(await screen.findByLabelText("Name"), "Photo Wall");
    await user.click(screen.getByRole("button", { name: "Add to passport" }));

    // The save renames the row's button, as it gains passport settings.
    const renamed = await screen.findByRole("button", {
      name: "Change passport settings for Photo Wall",
    });
    await expectFocusBack(renamed);
  });

  it("puts it back on the booth button after Enter and Escape, the keyboard path", async () => {
    const user = userEvent.setup();
    renderBoard();

    const button = await screen.findByRole("button", { name: `Change booth for ${NAMED}` });
    button.focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");

    await expectFocusBack(button);
  });

  it("puts it back on the button when the dialog's Close is clicked", async () => {
    const user = userEvent.setup();
    renderBoard();

    const button = await open(user, `Change booth for ${NAMED}`);
    await user.click(await screen.findByRole("button", { name: "Close" }));

    await expectFocusBack(button);
  });

  it("puts it on the renamed booth button after a save, not on the page", async () => {
    const user = userEvent.setup();
    renderBoard();

    await open(user, `Set booth for ${BARE}`);
    const field = await screen.findByLabelText("Booth");
    await user.type(field, "A1");
    await user.click(screen.getByRole("button", { name: "Save" }));

    // The save renames the row's button from Set booth to Change booth.
    const renamed = await screen.findByRole("button", { name: `Change booth for ${BARE}` });
    await expectFocusBack(renamed);
  });

  it("puts it back on the replace-key button after the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    renderBoard();

    const button = await open(user, `Replace key for ${NAMED}`);
    await screen.findByRole("alertdialog");
    await user.keyboard("{Escape}");

    await expectFocusBack(button);
  });

  it("puts it back on the replace-key button once the new key is done", async () => {
    const user = userEvent.setup();
    renderBoard();

    const button = await open(user, `Replace key for ${NAMED}`);
    await user.click(await screen.findByRole("button", { name: /^Replace key$/ }));
    // The alert steps aside for the key reveal, which then closes the flow.
    await user.click(await screen.findByRole("button", { name: "Done" }));

    await expectFocusBack(button);
  });

  it("puts it back on the disable button when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    renderBoard();

    const button = await open(user, `Disable ${NAMED}`);
    await screen.findByRole("alertdialog");
    await user.keyboard("{Escape}");

    await expectFocusBack(button);
  });

  it("puts it on the row's Enable after a disable replaces the button", async () => {
    const user = userEvent.setup();
    renderBoard();

    await open(user, `Disable ${NAMED}`);
    await user.click(await screen.findByRole("button", { name: /^Disable$/ }));

    // Disabling swaps the row's Disable for an Enable, a different element, so the focus
    // goes to the row's new power button rather than the one that opened the alert.
    const enable = await screen.findByRole("button", { name: `Enable ${NAMED}` });
    await expectFocusBack(enable);
  });
});
