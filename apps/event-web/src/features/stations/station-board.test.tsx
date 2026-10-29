import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EventStationBoardStation, StationResponse } from "@/api/types";
import { StationBoard } from "@/features/stations/station-board";
import { describe, expect, it, vi } from "vitest";

import { createMockClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID } from "@/api/mock/fixtures";
import { createTestProviders } from "@/test/providers";

/**
 * The board's rows hold the enable mutation since FRO-26, so the board needs the app's
 * providers around it even to render. This wraps it the way the dialog tests do, with the
 * client returned so a test can prepare the 9.9 calls behind the same rows it rendered.
 */
function renderBoard(
  stations: EventStationBoardStation[],
  api = createMockClient({ latencyMs: [0, 0], storage: null }),
) {
  const { Providers } = createTestProviders(api);
  return {
    api,
    ...render(
      <Providers>
        <StationBoard stations={stations} />
      </Providers>,
    ),
  };
}

function station(overrides: Partial<EventStationBoardStation> = {}): EventStationBoardStation {
  return {
    id: "station-1",
    label: "Station 1",
    created_at: "2026-10-01T00:00:00.000Z",
    disabled_at: null,
    game: "passport",
    game_fixed: true,
    booth: "B2",
    passport: {
      name: "Careers Corner",
      location: "Hall B",
      points: 2,
      added_at: "2026-10-01T00:00:00.000Z",
    },
    last_seen_at: "2026-10-10T09:00:00.000Z",
    online: true,
    firmware_version: "0.3.1",
    buffered_taps: 0,
    reader_ok: true,
    last_tap_at: "2026-10-10T08:58:00.000Z",
    ...overrides,
  };
}

/** Two faults at once: the station is not answering, and it has taps it has not sent. */
const offlineBuffered = station({
  id: "offline-buffered",
  label: "Station 5",
  online: false,
  buffered_taps: 3,
  reader_ok: true,
  last_tap_at: null,
});

/** Disabled by an organizer, and nothing else wrong with it. Agreement 9.2. */
const disabledStation = station({
  id: "disabled-station",
  label: "Station 7",
  disabled_at: "2026-10-10T09:05:00.000Z",
});

/** Two faults: its reader is not answering, and it has no passport settings. */
const deadReader = station({
  id: "dead-reader",
  label: "Station 3",
  passport: null,
  reader_ok: false,
});

/** In the passport, but nobody has tapped it lately. Being quiet is not a fault. */
const quietStation = station({
  id: "quiet-station",
  passport: {
    name: "Quiet Booth",
    location: "Hall C",
    points: 1,
    added_at: "2026-10-01T00:00:00.000Z",
  },
  last_tap_at: null,
});

/** In the passport, online, reader answering, nothing buffered. */
const healthyStation = station({
  id: "healthy",
  passport: {
    name: "Healthy Booth",
    location: "Hall D",
    points: 1,
    added_at: "2026-10-01T00:00:00.000Z",
  },
});

describe("StationBoard", () => {
  it("shows passport, not-in-passport, and last-tap states", () => {
    renderBoard([offlineBuffered, deadReader]);

    expect(screen.getByText("Careers Corner")).toBeInTheDocument();
    expect(screen.getByText("Station 3")).toBeInTheDocument();
    expect(screen.getByText("Not in the passport")).toBeInTheDocument();
    expect(screen.getByText("Never")).toBeInTheDocument();
  });

  // FRO-26. The switch follows the row's state, in both directions at once: the same row
  // cannot hold both, and the named labels are how a row's action stays addressable.
  it("gives an enabled station Disable, and no Enable, named for its row", () => {
    renderBoard([healthyStation]);

    expect(screen.getByRole("button", { name: "Disable Healthy Booth" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /^Enable / })).not.toBeInTheDocument();
  });

  it("no longer says 'No longer linked', which cannot happen any more", () => {
    // A station always feeds the Event Service that registered it, so agreement 9.2 has no
    // link field and the old line had nothing left to report.
    renderBoard([offlineBuffered, deadReader, healthyStation]);

    expect(screen.queryByText("No longer linked")).not.toBeInTheDocument();
  });

  it("names every problem on a station that has several", () => {
    renderBoard([offlineBuffered]);

    expect(screen.getByText("Not responding")).toBeInTheDocument();
    expect(screen.getByText("Holding saved taps")).toBeInTheDocument();
  });

  it("marks a dead reader in words, not colour alone", () => {
    renderBoard([deadReader]);

    expect(screen.getByText("Reader not responding")).toBeInTheDocument();
  });

  it("leaves a station that is only quiet uncoloured and unlabelled", () => {
    renderBoard([quietStation]);

    expect(screen.getByText("Quiet Booth")).toBeInTheDocument();
    expect(screen.queryByText("Not responding")).not.toBeInTheDocument();
    expect(screen.queryByText("Holding saved taps")).not.toBeInTheDocument();
    expect(screen.queryByText("Reader not responding")).not.toBeInTheDocument();
  });

  it("says 'Not in the passport' once per station, not twice", () => {
    renderBoard([deadReader]);

    expect(screen.getAllByText("Not in the passport")).toHaveLength(1);
  });

  // Agreement 9.2 and 9.12: the row shows the booth the map draws it at, or says there is
  // none, and the action that changes it is named for the row like every other one.
  it("shows each station's booth, or No booth when it has none", () => {
    const noBooth = station({ id: "no-booth", label: "Station 6", passport: null, booth: null });
    renderBoard([station(), noBooth]);

    expect(screen.getByText("B2")).toBeInTheDocument();
    expect(screen.getByText("No booth")).toBeInTheDocument();
  });

  it("names the booth action for its row, and says Set or Change by its state", () => {
    const noBooth = station({ id: "no-booth", label: "Station 6", passport: null, booth: null });
    renderBoard([station(), noBooth]);

    expect(screen.getByRole("button", { name: "Change booth for Careers Corner" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Set booth for Station 6" })).toBeEnabled();
  });

  it("puts problem stations above healthy ones, keeping arrival order within each group", () => {
    renderBoard([healthyStation, quietStation, deadReader]);

    const names = screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => row.textContent ?? "");

    expect(names[0]).toContain("Station 3");
    expect(names[1]).toContain("Healthy Booth");
    expect(names[2]).toContain("Quiet Booth");
  });

  describe("a disabled station", () => {
    it("shows a Disabled badge", () => {
      renderBoard([disabledStation]);

      expect(screen.getByText("Disabled")).toBeInTheDocument();
    });

    it("has an Enable action, and no Disable one, named for its row", () => {
      renderBoard([disabledStation]);

      expect(screen.getByRole("button", { name: "Enable Careers Corner" })).toBeEnabled();
      expect(screen.queryByRole("button", { name: /^Disable / })).not.toBeInTheDocument();
    });

    it("leaves an enabled station without the badge", () => {
      renderBoard([healthyStation]);

      expect(screen.queryByText("Disabled")).not.toBeInTheDocument();
    });

    it("keeps its slot and its stamps, so its passport name and points still show", () => {
      // Agreement 9.2: disabling does not take the station out of the passport.
      renderBoard([disabledStation]);

      expect(screen.getByText("Careers Corner")).toBeInTheDocument();
      expect(screen.getByText("Hall B")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
    });

    it("is not flagged as a problem just for being disabled", () => {
      renderBoard([disabledStation]);

      expect(screen.queryByText("Not responding")).not.toBeInTheDocument();
      expect(screen.queryByText("Reader not responding")).not.toBeInTheDocument();
      expect(screen.queryByText("Holding saved taps")).not.toBeInTheDocument();
    });

    it("goes last, below problem and healthy stations alike", () => {
      renderBoard([disabledStation, healthyStation, deadReader]);

      const names = screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.textContent ?? "");

      expect(names[0]).toContain("Station 3");
      expect(names[1]).toContain("Healthy Booth");
      expect(names[2]).toContain("Careers Corner");
    });
  });

  describe("a station that has never been heard from", () => {
    /** What 9.7 registers: a station at once, with no hand-off behind it yet. */
    const fresh = station({
      label: "Station 7",
      passport: null,
      last_seen_at: null,
      online: false,
      firmware_version: null,
      buffered_taps: null,
      reader_ok: null,
    });

    it("reads as never connected, not as status unknown", () => {
      renderBoard([fresh]);

      expect(screen.getByText("Never connected")).toBeInTheDocument();
      expect(screen.queryByText("Status unknown")).not.toBeInTheDocument();
    });

    it("still shows its label, since a station always has one", () => {
      renderBoard([fresh]);

      expect(screen.getByText("Station 7")).toBeInTheDocument();
    });

    it("flags the missing passport and being offline, but not the unreported reader", () => {
      renderBoard([fresh]);

      expect(screen.getByText("Not in the passport")).toBeInTheDocument();
      // It was registered at once by 9.7 and has never been heard from, so 9.2's
      // "within 120 seconds" test says offline, which is a real answer rather than unknown.
      expect(screen.getByText("Not responding")).toBeInTheDocument();
      // The reader has simply not reported yet, and that is not a fault.
      expect(screen.queryByText("Reader not responding")).not.toBeInTheDocument();
      expect(screen.queryByText("Holding saved taps")).not.toBeInTheDocument();
    });
  });

  describe("enabling a station", () => {
    // 9.9 is an organiser endpoint, and the mock refuses it without a session. The rows come
    // from 9.2, which is where the board gets them, so every id is one 9.9 knows.
    async function setup() {
      const api = createMockClient({ latencyMs: [0, 0], storage: null });
      api.mock.setSession(SEEDED_ORGANIZER_ID);
      const stations = (await api.listStationBoard()).stations;
      const user = userEvent.setup();
      renderBoard(stations, api);
      const disabled =
        stations.find((one) => one.disabled_at !== null) ?? stations[stations.length - 1]!;
      const name = disabled.passport?.name ?? disabled.label;
      return { api, user, name, id: disabled.id };
    }

    // FRO-26 gives enabling no confirmation, 9.9 answers the station, and the board's
    // refresh is the enable hook's own board-only invalidation.
    it("acts at once, with no confirmation in the way", async () => {
      const { api, user, name, id } = await setup();
      const sent = vi.spyOn(api, "enableStation");

      await user.click(screen.getByRole("button", { name: `Enable ${name}` }));

      expect(sent).toHaveBeenCalledTimes(1);
      expect(sent).toHaveBeenCalledWith(id);
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    // Read through 9.2 again rather than the prop, which never changes in this test.
    it("reads the station back as enabled through 9.2", async () => {
      const { api, user, name, id } = await setup();

      await user.click(screen.getByRole("button", { name: `Enable ${name}` }));

      const after = (await api.listStationBoard()).stations.find((one) => one.id === id);
      expect(after?.disabled_at).toBeNull();
    });

    // 9.9 answers not_found for a station this Event Service does not have, and FRO-26 asks
    // for a plain message. There is no dialog to hold it, so the row itself says it.
    it("says so plainly in the row when the station is gone", async () => {
      const { api, user, name } = await setup();
      api.mock.failNext("not_found");

      await user.click(screen.getByRole("button", { name: `Enable ${name}` }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "That was not found. It may have been removed.",
      );
      // The row is still the prop's station, so the action comes back with it.
      expect(screen.getByRole("button", { name: `Enable ${name}` })).toBeEnabled();
    });

    // The ticket: disable the button while the request is in flight. The spy never
    // resolves, which is the in-flight case with no timing guess, and a click on the held
    // button must not send a second enable either. While it runs the label swaps to
    // "Enabling", but the aria-label stays the row's.
    it("waits while one enable is in the air, and one click is one call", async () => {
      const { api, user, name } = await setup();
      vi.spyOn(api, "enableStation").mockImplementationOnce(
        () => new Promise<StationResponse>(() => {}),
      );

      await user.click(screen.getByRole("button", { name: `Enable ${name}` }));

      expect(screen.getByRole("button", { name: `Enable ${name}` })).toBeDisabled();
      expect(screen.getByRole("button", { name: `Enable ${name}` })).toHaveTextContent("Enabling");

      await user.click(screen.getByRole("button", { name: `Enable ${name}` }));
      expect(api.enableStation).toHaveBeenCalledTimes(1);
    });
  });
});
