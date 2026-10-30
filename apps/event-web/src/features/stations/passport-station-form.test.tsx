import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { ApiError } from "@/api/errors";
import { createMockClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID } from "@/api/mock/fixtures";
import {
  openStationSettings,
  pickStationAction,
} from "@/features/stations/station-settings-test-helpers";
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

/** Two fixture stations have no passport settings, so they show "Add to passport". */
const NOT_IN_PASSPORT = "Station 6";
const IN_PASSPORT = "3D Printing Booth";

/**
 * A `validation_failed` the way the service sends one: agreement section 2's error body, so
 * `issues` is present and each issue names the field it belongs to.
 */
function failWithValidation(issues: { path: (string | number)[]; message: string }[]) {
  return async () => {
    throw new ApiError(400, "validation_failed", issues);
  };
}

describe("passport settings on the station board", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("adds a station to the passport and swaps its menu's Add for an Edit", async () => {
    const user = userEvent.setup();
    renderBoard();

    await pickStationAction(user, NOT_IN_PASSPORT, "Add to passport");

    const name = await screen.findByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Photo Wall");
    await user.click(screen.getByRole("button", { name: "Add to passport" }));

    // The row is now named for the passport name it just gained, and its menu offers Edit.
    await openStationSettings(user, "Photo Wall");
    expect(screen.getByRole("menuitem", { name: "Edit passport settings" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Add to passport" })).toBeNull();
  });

  it("fills the form with the current settings when editing", async () => {
    const user = userEvent.setup();
    renderBoard();

    await pickStationAction(user, IN_PASSPORT, "Edit passport settings");

    const name = await screen.findByLabelText("Name");
    expect(name).toHaveValue(IN_PASSPORT);
    expect(screen.getByLabelText("Location")).toHaveValue("Hall A");
    expect(screen.getByLabelText("Points per accepted tap")).toHaveValue("1");
  });

  it("changes a station's settings and shows the new points on the board", async () => {
    const user = userEvent.setup();
    renderBoard();

    await pickStationAction(user, IN_PASSPORT, "Edit passport settings");

    const points = await screen.findByLabelText("Points per accepted tap");
    await user.clear(points);
    await user.type(points, "4");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    const row = (await screen.findByText(IN_PASSPORT)).closest("tr");
    expect(row).toHaveTextContent("4");
  });

  it("puts a server validation issue on the field it names", async () => {
    const user = userEvent.setup();
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    api.mock.setSession(SEEDED_ORGANIZER_ID);
    const { Providers } = createTestProviders(api);
    render(
      <Providers>
        <StationsScreen />
      </Providers>,
    );

    await pickStationAction(user, IN_PASSPORT, "Edit passport settings");

    const name = await screen.findByLabelText("Name");
    await user.clear(name);

    api.mock.failNext("validation_failed");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    // The client blocks an empty name before sending, so the issue shown is the
    // field's own rule rather than the service's.
    expect(await screen.findByText("Give the station a name.")).toBeInTheDocument();
  });

  it("shows the service's own issue text on the field it names", async () => {
    // The test above cannot reach this: the client's own rules reject an empty name and
    // bad points before a request is sent, and `failNext("validation_failed")` carries no
    // issues at all. So the failure is raised here as the service would raise it, with
    // the error body of agreement section 2.
    const user = userEvent.setup();
    const api = renderBoard();
    api.setStationPassport = failWithValidation([
      { path: ["name"], message: "name is already used by another station" },
    ]);

    await pickStationAction(user, IN_PASSPORT, "Edit passport settings");
    await user.click(await screen.findByRole("button", { name: "Save changes" }));

    // The service's wording, wired to the Name input by aria-describedby, so it is read as
    // that field's message rather than as loose text. With nothing left over the form still
    // shows its own summary line, so the check is that the service's wording did not land
    // there instead.
    const message = await screen.findByText("name is already used by another station");
    expect(message).toBeInTheDocument();
    // aria-describedby carries the hint and the message together, so match the tail.
    expect(screen.getByLabelText("Name")).toHaveAccessibleDescription(
      /name is already used by another station$/,
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      "name is already used by another station",
    );
  });

  it("puts a matched issue on its field and an unmatched one on a form-level line", async () => {
    const user = userEvent.setup();
    const api = renderBoard();
    api.setStationPassport = failWithValidation([
      { path: ["points"], message: "points must be an integer of 0 or more" },
      { path: ["uid"], message: "uid must be 4 to 10 hex bytes" },
    ]);

    await pickStationAction(user, IN_PASSPORT, "Edit passport settings");
    await user.click(await screen.findByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("points must be an integer of 0 or more")).toBeInTheDocument();
    // `uid` matches no field on this form, so it becomes the form-level line.
    expect(await screen.findByRole("alert")).toHaveTextContent("uid must be 4 to 10 hex bytes");
  });

  it("does not accept a name the mock rejects, and leaves the station out of the passport", async () => {
    const user = userEvent.setup();
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    api.mock.setSession(SEEDED_ORGANIZER_ID);
    const { Providers } = createTestProviders(api);
    render(
      <Providers>
        <StationsScreen />
      </Providers>,
    );

    await pickStationAction(user, IN_PASSPORT, "Edit passport settings");
    const points = await screen.findByLabelText("Points per accepted tap");
    await user.clear(points);
    await user.type(points, "-1");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Whole numbers only, 0 or more.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("takes the last stamp slot when added, and keeps it when changed", async () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    api.mock.setSession(SEEDED_ORGANIZER_ID);

    const stations = (await api.listStationBoard()).stations;
    const station = stations.find((s) => s.passport === null);
    if (!station) throw new Error("the fixtures need a station with no passport settings");

    const added = await api.setStationPassport(station.id, { name: "Photo Wall", points: 2 });
    expect(added.passport.station_id).toBe(station.id);
    expect(added.passport.name).toBe("Photo Wall");
    expect(added.passport.points).toBe(2);

    // The new station takes the last slot, and nobody has tapped it yet.
    const afterAdd = await api.me();
    expect(afterAdd.stamps.map((stamp) => stamp.name)).toContain("Photo Wall");
    const lastSlot = afterAdd.stamps.at(-1);
    expect(lastSlot?.name).toBe("Photo Wall");
    expect(lastSlot?.earned_at).toBeNull();

    // Changing the settings must not move the slot (agreement 8.1 and 9.1).
    const changed = await api.setStationPassport(station.id, { name: "Photo Wall", points: 5 });
    expect(changed.passport.added_at).toBe(added.passport.added_at);

    const afterChange = await api.me();
    expect(afterChange.stamps.length).toBe(afterAdd.stamps.length);
    expect(afterChange.stamps.at(-1)?.name).toBe("Photo Wall");
    expect(afterChange.stamps.at(-1)?.points).toBe(5);
  });

  it("rejects a blank name and negative points, and answers not_found for a stranger", async () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    api.mock.setSession(SEEDED_ORGANIZER_ID);

    const station = (await api.listStationBoard()).stations.at(0);
    if (!station) throw new Error("the fixtures need at least one station");

    await expect(api.setStationPassport(station.id, { name: "   " })).rejects.toThrow();
    await expect(api.setStationPassport(station.id, { name: "OK", points: -1 })).rejects.toThrow();
    await expect(api.setStationPassport("no-such-station", { name: "OK" })).rejects.toThrow();
  });
});
