import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { createMockClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID } from "@/api/mock/fixtures";
import { AddStationDialog } from "@/features/stations/add-station-dialog";
import { createTestProviders } from "@/test/providers";

function setup() {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  // 9.7 is an organiser endpoint, and the mock refuses it without a session.
  api.mock.setSession(SEEDED_ORGANIZER_ID);
  const { Providers } = createTestProviders(api);
  const user = userEvent.setup();
  render(
    <Providers>
      <AddStationDialog />
    </Providers>,
  );
  return { api, user };
}

/** Opens the dialog, creates a station with `label`, and waits for the key field. */
async function createAStation(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole("button", { name: "Create station" }));
  await user.type(screen.getByLabelText("Label"), label);
  await user.click(screen.getByRole("button", { name: "Create station" }));
  return screen.findByLabelText("Station key");
}

describe("AddStationDialog", () => {
  // 9.7 returns the key in the create response and there is no endpoint to read it back, so
  // the dialog holds it in state and has to let it go on close. StationKeyReveal cannot cover
  // this: it has no open or close of its own, so the clearing lives here.
  //
  // This one only proves the key is on screen while the dialog is open and gone once it
  // closes. Deleting the setCreated(null) on close leaves it green, because the dialog
  // unmounts its content either way. The test below is the one that catches that.
  it("shows the key while the dialog is open, and not after it closes", async () => {
    const { user } = setup();

    // The mock mints a fresh random key per call, so this matches the shape the agreement
    // shows rather than a value. toHaveValue compares exactly, so the regex goes on the value.
    const field = (await createAStation(user, "Reader 9")) as HTMLInputElement;
    expect(field.value).toMatch(/^gk_sta_/);

    await user.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => expect(screen.queryByLabelText("Station key")).not.toBeInTheDocument());
  });

  // The reveal is only skipped while `created` is cleared. If closing left it set, reopening
  // would show the same dead key again and the organizer would copy a key the service has
  // already rotated past.
  it("reopens at the form, not at the key it already showed", async () => {
    const { user } = setup();
    await createAStation(user, "Reader 9");

    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByLabelText("Station key")).not.toBeInTheDocument());
    await waitFor(() => screen.getByRole("button", { name: "Create station" }));

    await user.click(screen.getByRole("button", { name: "Create station" }));

    expect(await screen.findByLabelText("Label")).toBeInTheDocument();
    expect(screen.queryByLabelText("Station key")).not.toBeInTheDocument();
  });

  // The reveal reads the kind from a prop, so nothing but this holds the one call site to
  // 9.7's half of the copy. With kind="replace" the dialog would greet an organizer with a
  // station they have never seen and an old key nobody lost, and the reveal's own tests would
  // stay green, because they render it directly rather than through here.
  it("opens on 9.7's copy, never on the replacement's", async () => {
    const { user } = setup();

    await createAStation(user, "Reader 9");

    expect(await screen.findByText("Reader 9 is ready")).toBeInTheDocument();
    expect(screen.queryByText("Reader 9 has a new key")).not.toBeInTheDocument();
  });
});
