import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { createMockClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID } from "@/api/mock/fixtures";
import {
  openStationActions,
  pickStationAction,
} from "@/features/stations/station-actions-test-helpers";
import { StationsScreen } from "@/features/stations/stations-screen";
import { createTestProviders } from "@/test/providers";

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

/** Two fixture stations: one with passport settings and a booth, one with neither. */
const IN_PASSPORT = "3D Printing Booth";
const NOT_IN_PASSPORT = "Station 6";

/**
 * The dialog is gone and the keyboard is back where it was. Radix moves focus on close in a
 * timeout, so this waits rather than reading once (FRO-99).
 */
async function expectFocusBack(button: HTMLElement) {
  await waitFor(() => expect(document.activeElement).toBe(button));
}

// Since FRO-100 every row dialog opens from the row's Actions menu, so the menu's
// button is where the keyboard goes back to. It stays in the row through every save, renamed
// at most, so the same element takes the focus whatever the dialog changed.
describe("a station board dialog returns focus to its row (FRO-99)", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("puts it back on the row's settings button after Escape on passport settings", async () => {
    const user = userEvent.setup();
    renderBoard();

    const trigger = await pickStationAction(user, IN_PASSPORT, "Edit passport settings…");
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");

    await expectFocusBack(trigger);
  });

  it("puts it back after Add to passport, on a station with no settings yet", async () => {
    const user = userEvent.setup();
    renderBoard();

    const trigger = await pickStationAction(user, NOT_IN_PASSPORT, "Add to passport…");
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");

    await expectFocusBack(trigger);
  });

  it("puts it on the same button, renamed, after a passport save", async () => {
    const user = userEvent.setup();
    renderBoard();

    const trigger = await pickStationAction(user, NOT_IN_PASSPORT, "Add to passport…");
    await user.type(await screen.findByLabelText("Name"), "Photo Wall");
    await user.click(screen.getByRole("button", { name: "Add to passport" }));

    // The save renames the row's button, as the station gains a passport name.
    await screen.findByRole("button", { name: "Actions for Photo Wall" });
    expect(trigger).toHaveAccessibleName("Actions for Photo Wall");
    await expectFocusBack(trigger);
  });

  it("goes into the dialog and back out by keyboard alone", async () => {
    const user = userEvent.setup();
    renderBoard();

    const trigger = await screen.findByRole("button", {
      name: `Actions for ${IN_PASSPORT}`,
    });
    trigger.focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("menu");
    // The first item takes the focus, and Change booth is the next one down.
    await user.keyboard("{ArrowDown}{Enter}");

    // The menu closing must not pull the keyboard back out of the dialog it opened.
    const field = await screen.findByLabelText("Booth");
    await waitFor(() =>
      expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement),
    );
    expect(field).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await expectFocusBack(trigger);
  });

  it("puts it back when the dialog's Close is clicked", async () => {
    const user = userEvent.setup();
    renderBoard();

    const trigger = await pickStationAction(user, IN_PASSPORT, "Change booth…");
    await user.click(await screen.findByRole("button", { name: "Close" }));

    await expectFocusBack(trigger);
  });

  it("puts it back after a booth save, not on the page", async () => {
    const user = userEvent.setup();
    renderBoard();

    const trigger = await pickStationAction(user, NOT_IN_PASSPORT, "Set booth…");
    await user.type(await screen.findByLabelText("Booth"), "A1");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await expectFocusBack(trigger);
  });

  it("puts it back after the replace-key confirmation is cancelled", async () => {
    const user = userEvent.setup();
    renderBoard();

    const trigger = await pickStationAction(user, IN_PASSPORT, "Replace key…");
    await screen.findByRole("alertdialog");
    await user.keyboard("{Escape}");

    await expectFocusBack(trigger);
  });

  it("puts it back once the new key is done", async () => {
    const user = userEvent.setup();
    renderBoard();

    const trigger = await pickStationAction(user, IN_PASSPORT, "Replace key…");
    await user.click(await screen.findByRole("button", { name: /^Replace key$/ }));
    // The alert steps aside for the key reveal, which then closes the flow.
    await user.click(await screen.findByRole("button", { name: "Done" }));

    await expectFocusBack(trigger);
  });

  it("puts it back when the disable confirmation is cancelled", async () => {
    const user = userEvent.setup();
    renderBoard();

    const trigger = await pickStationAction(user, IN_PASSPORT, "Disable station…");
    await screen.findByRole("alertdialog");
    await user.keyboard("{Escape}");

    await expectFocusBack(trigger);
  });

  it("puts it back after a disable, on the button whose menu now offers Enable", async () => {
    const user = userEvent.setup();
    renderBoard();

    const trigger = await pickStationAction(user, IN_PASSPORT, "Disable station…");
    await user.click(await screen.findByRole("button", { name: /^Disable$/ }));

    await expectFocusBack(trigger);
    await openStationActions(user, IN_PASSPORT);
    expect(screen.getByRole("menuitem", { name: "Enable station" })).toBeInTheDocument();
  });
});
