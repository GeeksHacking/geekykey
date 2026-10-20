import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StationResponse } from "@/api/types";
import { describe, expect, it, vi } from "vitest";

import { createMockClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID } from "@/api/mock/fixtures";
import { StationBoard } from "@/features/stations/station-board";
import { createTestProviders } from "@/test/providers";

/** FRO-26's sentence, from the ticket. Used as written, so it is asserted whole. */
const CONFIRMATION =
  "Within a minute its key stops working. The station keeps the taps it saves, and they count once it's enabled again.";

async function setup() {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  // 9.9 is an organiser endpoint, and the mock refuses it without a session.
  api.mock.setSession(SEEDED_ORGANIZER_ID);
  // The rows come from 9.2, which is where the board gets them, so every id is one 9.9
  // knows. A made-up id would answer not_found for a reason that has nothing to do with
  // the dialog under test.
  const stations = (await api.listStationBoard()).stations;
  const { Providers } = createTestProviders(api);
  const user = userEvent.setup();
  render(
    <Providers>
      <StationBoard stations={stations} />
    </Providers>,
  );
  const first = stations[0]!;
  return {
    api,
    user,
    /** The board names a row by its passport name when it has one, so the tests do too. */
    firstName: first.passport?.name ?? first.label,
    firstId: first.id,
  };
}

/** Opens the disable dialog on the given row. */
async function openDialog(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name: `Disable ${name}` }));
  return screen.findByRole("alertdialog");
}

describe("disabling a station", () => {
  // 9.9 cuts a disabled station's key off within a minute, so FRO-26 puts a confirmation in
  // front of it, the way FRO-28 does for 9.8. Opening the dialog must not have sent
  // anything, or the organizer would find out what the confirmation was warning about once
  // it was too late.
  it("asks first, and sends nothing until the organizer confirms", async () => {
    const { api, user, firstName } = await setup();
    const sent = vi.spyOn(api, "disableStation");

    const dialog = await openDialog(user, firstName);

    expect(dialog).toHaveTextContent(CONFIRMATION);
    expect(sent).not.toHaveBeenCalled();
  });

  // The ticket: on success, the board refreshes. The refresh itself is the disable hook's
  // board-only invalidation, covered there; what this dialog owes is the call made once and
  // the station reading as disabled through 9.2 afterwards.
  it("disables the station on confirm, once, and closes", async () => {
    const { api, user, firstName, firstId } = await setup();
    const sent = vi.spyOn(api, "disableStation");

    await openDialog(user, firstName);
    await user.click(screen.getByRole("button", { name: "Disable" }));

    expect(sent).toHaveBeenCalledTimes(1);
    expect(sent).toHaveBeenCalledWith(firstId);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());

    // Read through 9.2 again rather than the prop, which never changes in this test.
    const after = (await api.listStationBoard()).stations.find((one) => one.id === firstId);
    expect(after?.disabled_at).not.toBeNull();
  });

  // 9.9 answers not_found for a station this Event Service does not have, and FRO-26 asks
  // for a plain message. Nothing was disabled, so the alert stays open: this is the test
  // that holds the confirm button's preventDefault, as the replace-key refusal holds its
  // own.
  it("says so plainly when the station is gone, and stays open", async () => {
    const { api, user, firstName } = await setup();
    api.mock.failNext("not_found");

    await openDialog(user, firstName);
    await user.click(screen.getByRole("button", { name: "Disable" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That was not found. It may have been removed.",
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  // The ticket: disable the button while the request is in flight. The spy never resolves,
  // which is the in-flight case with no timing guess, and a second click on the held-open
  // alert must not send a second disable either. The row's button and the alert's both
  // read "Disable", so the modal keeps the roles apart: only the alert's is reachable.
  it("holds its buttons while a disable is in the air", async () => {
    const { api, user, firstName } = await setup();
    const sent = vi
      .spyOn(api, "disableStation")
      .mockImplementationOnce(() => new Promise<StationResponse>(() => {}));

    await openDialog(user, firstName);
    await user.click(screen.getByRole("button", { name: "Disable" }));

    // Both buttons of the covering alert wait with it, and the confirm's label has
    // swapped to "Disabling" while its call never lands.
    expect(screen.getByRole("button", { name: "Disabling" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Disabling" }));
    expect(sent).toHaveBeenCalledTimes(1);
  });

  // Each row passes its own station, so a row wired to the wrong one would name the wrong
  // one here. The alert is modal, so the other rows cannot be reached while it is open, and
  // the second one is opened after cancelling the first.
  it("names the station of the row that asked, after cancelling", async () => {
    const { user, firstName } = await setup();
    const second = screen.getAllByRole("button", { name: /^Disable / })[1]!;
    const secondName = (second.getAttribute("aria-label") ?? "").replace("Disable ", "");

    await openDialog(user, firstName);
    expect(screen.getByRole("alertdialog")).toHaveTextContent(`Disable ${firstName}?`);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    const dialog = await openDialog(user, secondName);
    expect(dialog).toHaveTextContent(`Disable ${secondName}?`);
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
  });
});
