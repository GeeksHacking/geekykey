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
  it("only describes fields that render a description", async () => {
    setup();

    await waitFor(() =>
      expect(screen.getByLabelText("Name")).toHaveAccessibleDescription(
        "Shown on the participant's passport.",
      ),
    );
    expect(screen.getByLabelText("Points per accepted tap")).not.toHaveAttribute(
      "aria-describedby",
    );
  });

  it("shows a form-level error when validation fails without issues", async () => {
    const { api, user } = setup();
    api.mock.failNext("validation_failed");

    await user.type(screen.getByLabelText("Name"), "Print Lab");
    await user.click(screen.getByRole("button", { name: "Create station" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Some of the details are not valid. Check the form and try again.",
    );
  });
});
