import { render, screen } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { ApiError } from "@/api/errors";
import { createMockClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID } from "@/api/mock/fixtures";
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

/** The first fixture station, whose booth the example plan names (agreement 9.12). */
const WITH_BOOTH = "3D Printing Booth";
/** A fixture station with no passport settings and no booth. */
const NO_BOOTH = "Station 6";

async function button(user: UserEvent, name: string) {
  const matches = await screen.findAllByRole("button", { name });
  const first = matches[0];
  if (!first) throw new Error(`no button named ${name}`);
  await user.click(first);
}

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

    await button(user, `Change booth for ${WITH_BOOTH}`);

    expect(await screen.findByLabelText("Booth")).toHaveValue("B1");
  });

  it("names the example plan's codes in the hint", async () => {
    const user = userEvent.setup();
    renderBoard();

    await button(user, `Change booth for ${WITH_BOOTH}`);

    const hint = await screen.findByText(/The example plan names/);
    expect(hint).toHaveTextContent("A1 to A3");
    expect(hint).toHaveTextContent("B1 to B6");
    expect(hint).toHaveTextContent("C1 to C5");
  });

  it("saves a booth and shows it on the board", async () => {
    const user = userEvent.setup();
    renderBoard();

    await button(user, `Change booth for ${WITH_BOOTH}`);

    const booth = await screen.findByLabelText("Booth");
    await user.clear(booth);
    await user.type(booth, "C4");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await row(WITH_BOOTH)).toHaveTextContent("C4");
  });

  it("shows No booth on a station without one, and sets one", async () => {
    const user = userEvent.setup();
    renderBoard();

    expect(await row(NO_BOOTH)).toHaveTextContent("No booth");
    await button(user, `Set booth for ${NO_BOOTH}`);

    await user.type(await screen.findByLabelText("Booth"), "A1");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await row(NO_BOOTH)).toHaveTextContent("A1");
  });

  it("clears the booth when the field is left blank", async () => {
    const user = userEvent.setup();
    renderBoard();

    await button(user, `Change booth for ${WITH_BOOTH}`);

    await user.clear(await screen.findByLabelText("Booth"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await row(WITH_BOOTH)).toHaveTextContent("No booth");
  });

  it("saves a code the plan does not name", async () => {
    // Agreement 9.10 has the map list a station whose booth its plan doesn't name beside
    // the plan, so 9.12 must not refuse one. The hint says so and the save proves it.
    const user = userEvent.setup();
    renderBoard();

    await button(user, `Set booth for ${NO_BOOTH}`);

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

    await button(user, `Change booth for ${WITH_BOOTH}`);

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

    await button(user, `Change booth for ${WITH_BOOTH}`);
    await user.click(await screen.findByRole("button", { name: "Save" }));

    const message = await screen.findByText("booth must be 0 to 80 characters");
    expect(message).toBeInTheDocument();
    expect(screen.getByLabelText("Booth")).toHaveAccessibleDescription(
      /booth must be 0 to 80 characters$/,
    );
  });
});
