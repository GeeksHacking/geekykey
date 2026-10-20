import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { createMockClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID } from "@/api/mock/fixtures";
import { StationBoard } from "@/features/stations/station-board";
import { createTestProviders } from "@/test/providers";

/** FRO-28's sentence, from the 8 Oct decision. Used as written, so it is asserted whole. */
const CONFIRMATION =
  "The old key stops working within a minute. Zi Tao has to enter the new key in the station's setup mode before it can send taps again.";

async function setup() {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  // 9.8 is an organiser endpoint, and the mock refuses it without a session.
  api.mock.setSession(SEEDED_ORGANIZER_ID);
  // The rows come from 9.2, which is where the board gets them, so every id is one 9.8 knows.
  // A made-up id answers not_found for a reason that has nothing to do with the dialog under
  // test, and the mock's raw fixtures are not board stations: they carry simulate_online
  // where 9.2 carries online and last_tap_at.
  const stations = (await api.listStationBoard()).stations;
  const { Providers } = createTestProviders(api);
  const user = userEvent.setup();
  render(
    <Providers>
      <StationBoard stations={stations} />
    </Providers>,
  );
  const first = stations[0]!;
  const disabled =
    stations.find((one) => one.disabled_at !== null) ?? stations[stations.length - 1]!;
  return {
    api,
    user,
    /** The board names a row by its passport name when it has one, so the tests do too. */
    firstName: first.passport?.name ?? first.label,
    /** FRO-24's reveal titles the station by its device label, which is what 9.8 returns. */
    firstLabel: first.label,
    disabledName: disabled.passport?.name ?? disabled.label,
    disabledId: disabled.id,
  };
}

/** Opens the replace dialog on the given row. */
async function openDialog(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name: `Replace key for ${name}` }));
  return screen.findByRole("alertdialog");
}

describe("replacing a station's key", () => {
  // 9.8 replaces a key in use, and the old one stops within a minute, so FRO-28 puts a
  // confirmation in front of it. Opening the dialog must not have sent anything, or the
  // organizer would find out what the confirmation was warning about once it was too late.
  it("asks first, and sends nothing until the organizer confirms", async () => {
    const { api, user, firstName } = await setup();
    const sent = vi.spyOn(api, "replaceStationKey");

    const dialog = await openDialog(user, firstName);

    expect(dialog).toHaveTextContent(CONFIRMATION);
    expect(sent).not.toHaveBeenCalled();
  });

  // 9.8 returns the key exactly once and no endpoint reads it back, so the success path has to
  // show it. The reveal is a second dialog, which is why it survives the alert closing: the
  // confirm button's preventDefault is not what this test holds, the not_found one below is.
  it("replaces the key, then shows the new one once in the reveal", async () => {
    const { api, user, firstName, firstLabel } = await setup();
    const sent = vi.spyOn(api, "replaceStationKey");

    await openDialog(user, firstName);
    await user.click(screen.getByRole("button", { name: "Replace key" }));

    expect(sent).toHaveBeenCalledTimes(1);
    // The mock mints a fresh random key per call, so this matches the agreement's shape
    // rather than a value, and the regex goes on the value because toHaveValue is exact.
    const field = (await screen.findByLabelText("Station key")) as HTMLInputElement;
    expect(field.value).toMatch(/^gk_sta_/);
    // The reveal's replace half, not the create half's "is ready".
    expect(screen.getByText(`${firstLabel} has a new key`)).toBeInTheDocument();
    expect(screen.queryByText(`${firstLabel} is ready`)).not.toBeInTheDocument();
  });

  // 9.8 answers not_found for a station this Event Service does not have. FRO-28 asks for a
  // plain message, and nothing was replaced, so no key may appear afterwards. The row above
  // replaces the same station successfully, so this failure is failNext and not a bad id.
  //
  // This is also what holds the confirm button's preventDefault. Without it the alert shuts on
  // click, and the refusal would have nowhere to show.
  it("says so plainly when the station is gone, and shows no key", async () => {
    const { api, user, firstName } = await setup();
    api.mock.failNext("not_found");

    await openDialog(user, firstName);
    await user.click(screen.getByRole("button", { name: "Replace key" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That was not found. It may have been removed.",
    );
    expect(screen.queryByLabelText("Station key")).not.toBeInTheDocument();
  });

  // Spec section 10 has an organizer disable a station that has gone missing and then replace
  // its key, and FRO-28 says each station has the button with no word about enabled ones. The
  // fixture's own disabled station is the case, so the button cannot quietly be hidden from it.
  it("offers it on the disabled station as well as an enabled one", async () => {
    const { disabledName } = await setup();

    expect(screen.getByRole("button", { name: `Replace key for ${disabledName}` })).toBeEnabled();
  });

  // Spec section 10's answer to a station that has gone missing is to disable it and then
  // replace its key, which is the only reason the button is on a disabled row. So the flow
  // has to work there, and 9.8 replaces the key and nothing else, so the station has to come
  // back still disabled or an organizer would be disabling it twice.
  it("replaces a disabled station's key, and leaves it disabled", async () => {
    const { api, user, disabledName, disabledId } = await setup();
    const sent = vi.spyOn(api, "replaceStationKey");

    await openDialog(user, disabledName);
    await user.click(screen.getByRole("button", { name: "Replace key" }));

    expect(await screen.findByLabelText("Station key")).toBeInTheDocument();
    expect(sent).toHaveBeenCalledTimes(1);

    // Read through 9.2 again rather than the prop, which never changes in this test.
    const after = (await api.listStationBoard()).stations.find((one) => one.id === disabledId);
    expect(after?.disabled_at).not.toBeNull();
  });

  // FRO-28 shows the new key once, and 9.8 says there is no endpoint to read it back, so
  // closing has to let it go rather than keep it for the next open. The last refusal has to go
  // too, or a moment ago's problem greets the organizer on a fresh question. The two clear by
  // different mechanisms: the error lives in the alert's content, which Radix unmounts on
  // close, while the key is held above both dialogs and cleared by hand on every way out.
  it("forgets the key and the last refusal once it closes", async () => {
    const { api, user, firstName } = await setup();
    api.mock.failNext("not_found");

    await openDialog(user, firstName);
    await user.click(screen.getByRole("button", { name: "Replace key" }));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    // A fresh question, not last time's refusal.
    await openDialog(user, firstName);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    // Done closes the reveal, and the key it was holding goes with it.
    await user.click(screen.getByRole("button", { name: "Replace key" }));
    const field = (await screen.findByLabelText("Station key")) as HTMLInputElement;
    expect(field.value).toMatch(/^gk_sta_/);
    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByLabelText("Station key")).not.toBeInTheDocument());

    // The next replacement asks again, and Escape closes its reveal the same way.
    await openDialog(user, firstName);
    await user.click(screen.getByRole("button", { name: "Replace key" }));
    const again = await screen.findByLabelText("Station key");
    await user.click(again);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByLabelText("Station key")).not.toBeInTheDocument());
    await openDialog(user, firstName);
    expect(screen.getByRole("alertdialog")).toHaveTextContent(CONFIRMATION);
  });

  // Each row passes its own id and its own station, so a row wired to the wrong station would
  // name the wrong one here. The dialog is modal, so the other rows cannot be reached while it
  // is open, and the second dialog is opened after cancelling the first.
  it("names the station of the row that asked, after cancelling", async () => {
    const { user, firstName } = await setup();
    const second = screen.getAllByRole("button", { name: /^Replace key for / })[1]!;
    const secondName = (second.getAttribute("aria-label") ?? "").replace("Replace key for ", "");

    await openDialog(user, firstName);
    expect(screen.getByRole("alertdialog")).toHaveTextContent(`Replace ${firstName}'s key?`);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    const dialog = await openDialog(user, secondName);
    expect(dialog).toHaveTextContent(`Replace ${secondName}'s key?`);
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
  });
});
