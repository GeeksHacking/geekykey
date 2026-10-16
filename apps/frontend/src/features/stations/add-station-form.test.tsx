import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { createMockClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID } from "@/api/mock/fixtures";
import { AddStationForm } from "@/features/stations/add-station-form";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { createTestProviders } from "@/test/providers";

function setup() {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(SEEDED_ORGANIZER_ID);
  const { Providers } = createTestProviders(api);
  const user = userEvent.setup();
  render(
    <Providers>
      <Dialog open>
        <DialogContent>
          <AddStationForm onCreated={vi.fn()} />
        </DialogContent>
      </Dialog>
    </Providers>,
  );
  return { api, user };
}

describe("AddStationForm", () => {
  it("asks only for a label, and says where the passport name goes", async () => {
    setup();

    // Agreement 9.7 takes { label } and nothing else. Name, location and points are
    // passport settings, added with 9.1 from the board.
    await waitFor(() =>
      expect(screen.getByLabelText("Label")).toHaveAccessibleDescription(
        "The device's name. Set the name on the passport separately.",
      ),
    );
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Location")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Points per accepted tap")).not.toBeInTheDocument();
  });

  // The agreement's Station keys section says the key goes out on every request, not only
  // on taps, because the heartbeat authenticates the same way. "Every tap" understated it.
  it("says the station sends the key on every request", () => {
    setup();

    expect(
      screen.getByText(
        "Creates the station and returns its key, which the station sends on every request.",
      ),
    ).toBeInTheDocument();
  });

  it("shows a form-level error when validation fails without issues", async () => {
    const { api, user } = setup();
    api.mock.failNext("validation_failed");

    await user.type(screen.getByLabelText("Label"), "Reader 3");
    await user.click(screen.getByRole("button", { name: "Create station" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Some of the details are not valid. Check the form and try again.",
    );
  });

  it("puts a too-long label on the label field and sends nothing", async () => {
    const { api, user } = setup();

    await user.type(screen.getByLabelText("Label"), "x".repeat(81));
    await user.click(screen.getByRole("button", { name: "Create station" }));

    expect(await screen.findByText("Keep it under 80 characters.")).toBeInTheDocument();
    expect(api.mock.data.stations.every((station) => station.label.length <= 80)).toBe(true);
  });

  it("will not submit an empty label", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Create station" }));

    expect(await screen.findByText("Give the station a label.")).toBeInTheDocument();
  });
});
