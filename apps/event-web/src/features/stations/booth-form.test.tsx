import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { ApiError } from "@/api/errors";
import { createMockClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID } from "@/api/mock/fixtures";
import { pickStationAction } from "@/features/stations/station-actions-test-helpers";
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

/** The first fixture station, whose booth the booth plan names (agreement 9.12). */
const WITH_BOOTH = "3D Printing Booth";
/** A fixture station with no passport settings and no booth. */
const NO_BOOTH = "Station 6";

/** The row a station's name sits in, so a test reads the whole row rather than loose text. */
async function row(name: string) {
  return (await screen.findByText(name)).closest("tr");
}

describe("the booth on the station board (agreement 9.12)", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("fills the field with the station's booth", async () => {
    const user = userEvent.setup();
    renderBoard();

    await pickStationAction(user, WITH_BOOTH, "Change booth…");

    expect(await screen.findByLabelText("Booth")).toHaveValue("Booth 1");
  });

  it("picks a planned booth without submitting, then saves it", async () => {
    const user = userEvent.setup();
    renderBoard();

    await pickStationAction(user, WITH_BOOTH, "Change booth…");

    const booth = await screen.findByLabelText("Booth");
    expect(screen.getByRole("button", { name: "Booth 1", pressed: true })).toBeInTheDocument();
    const pick = screen.getByRole("button", { name: "Booth 2", pressed: false });
    await user.click(pick);

    expect(booth).toHaveValue("Booth 2");
    expect(pick).toHaveAttribute("aria-pressed", "true");
    expect(pick).toHaveFocus();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(booth).toHaveAccessibleDescription(
      "Another name still saves, and the map lists the station beside the plan. Blank means no booth.",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await row(WITH_BOOTH)).toHaveTextContent("Booth 2");
  });

  it("matches typed booth names without case or outer spaces and validates a keyboard pick", async () => {
    const user = userEvent.setup();
    renderBoard();
    await pickStationAction(user, WITH_BOOTH, "Change booth…");

    const booth = await screen.findByLabelText("Booth");
    await user.clear(booth);
    await user.type(booth, "  bOoTh 2  ");
    expect(screen.getByRole("button", { name: "Booth 2", pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Booth 1", pressed: false })).toBeInTheDocument();
    await user.clear(booth);
    expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(2);
    await user.type(booth, "x".repeat(81));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Keep it under 80 characters.")).toBeInTheDocument();

    await user.click(booth);
    await user.tab();
    expect(screen.getByRole("button", { name: "Booth 1" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(booth).toHaveValue("Booth 1");
    expect(screen.queryByText("Keep it under 80 characters.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Booth 1", pressed: true })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await row(WITH_BOOTH)).toHaveTextContent("Booth 1");
  });

  it("saves a booth and shows it on the board", async () => {
    const user = userEvent.setup();
    renderBoard();

    await pickStationAction(user, WITH_BOOTH, "Change booth…");

    const booth = await screen.findByLabelText("Booth");
    await user.clear(booth);
    await user.type(booth, "Booth 2");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await row(WITH_BOOTH)).toHaveTextContent("Booth 2");
  });

  it("shows No booth on a station without one, and sets one", async () => {
    const user = userEvent.setup();
    renderBoard();

    expect(await row(NO_BOOTH)).toHaveTextContent("No booth");
    await pickStationAction(user, NO_BOOTH, "Set booth…");

    await user.type(await screen.findByLabelText("Booth"), "A1");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await row(NO_BOOTH)).toHaveTextContent("A1");
  });

  it("clears the booth when the field is left blank", async () => {
    const user = userEvent.setup();
    renderBoard();

    await pickStationAction(user, WITH_BOOTH, "Change booth…");

    await user.clear(await screen.findByLabelText("Booth"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await row(WITH_BOOTH)).toHaveTextContent("No booth");
  });

  it("saves a code the plan does not name", async () => {
    // Agreement 9.10 has the map list a station whose booth its plan doesn't name beside
    // the plan, so 9.12 must not refuse one. The hint says so and the save proves it.
    const user = userEvent.setup();
    renderBoard();

    await pickStationAction(user, NO_BOOTH, "Set booth…");

    await user.type(await screen.findByLabelText("Booth"), "Z9");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await row(NO_BOOTH)).toHaveTextContent("Z9");
  });

  it("refuses a booth over 80 characters before sending it", async () => {
    const user = userEvent.setup();
    const api = renderBoard();
    const before = api.mock.data.stations.find(
      (station) => station.passport?.name === WITH_BOOTH,
    )?.booth;

    await pickStationAction(user, WITH_BOOTH, "Change booth…");

    const booth = await screen.findByLabelText("Booth");
    await user.clear(booth);
    await user.type(booth, "x".repeat(81));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Keep it under 80 characters.")).toBeInTheDocument();
    // The dialog stays open, and the station keeps the booth it had.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      api.mock.data.stations.find((station) => station.passport?.name === WITH_BOOTH)?.booth,
    ).toBe(before);
  });

  it("shows the service's own issue under the field it names", async () => {
    // The client's own rule catches a long booth before a request is sent, so the service's
    // answer is raised here as the service would raise it, with section 2's error body.
    const user = userEvent.setup();
    const api = renderBoard();
    api.setStationBooth = async () => {
      throw new ApiError(400, "validation_failed", [
        { path: ["booth"], message: "booth must be 0 to 80 characters" },
      ]);
    };

    await pickStationAction(user, WITH_BOOTH, "Change booth…");
    await user.click(await screen.findByRole("button", { name: "Save" }));

    const message = await screen.findByText("booth must be 0 to 80 characters");
    expect(message).toBeInTheDocument();
    expect(screen.getByLabelText("Booth")).toHaveAccessibleDescription(
      /booth must be 0 to 80 characters$/,
    );
  });
});
