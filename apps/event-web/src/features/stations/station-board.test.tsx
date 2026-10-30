import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EventStationBoardStation, StationResponse } from "@/api/types";
import { StationBoard } from "@/features/stations/station-board";
import {
  openStationActions,
  pickStationAction,
} from "@/features/stations/station-actions-test-helpers";
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
  const result = render(
    <Providers>
      <StationBoard stations={stations} />
    </Providers>,
  );
  return {
    api,
    ...result,
    /** What the board's 12-second poll does: the same board, given the stations again. */
    poll: (next: EventStationBoardStation[]) =>
      result.rerender(
        <Providers>
          <StationBoard stations={next} />
        </Providers>,
      ),
  };
}

function menuItemNames() {
  return screen.getAllByRole("menuitem").map((item) => item.textContent);
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

  // FRO-100. One control per row, named for its station, in place of the four actions that
  // used to sit under the name.
  it("gives each row one Actions control, named for its station", () => {
    renderBoard([healthyStation, deadReader]);

    expect(screen.getByRole("button", { name: "Actions for Healthy Booth" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Actions for Station 3" })).toBeEnabled();
    expect(screen.getAllByRole("button")).toHaveLength(2);
    // The name carries the station for a screen reader; the row shows only the word.
    expect(screen.getByRole("button", { name: "Actions for Station 3" })).toHaveTextContent(
      /^Actions$/,
    );
  });

  // FRO-26. The switch follows the row's state, in both directions at once: the same row
  // cannot hold both.
  it("gives an enabled station Disable, and no Enable", async () => {
    const user = userEvent.setup();
    renderBoard([healthyStation]);

    await openStationActions(user, "Healthy Booth");

    expect(screen.getByRole("menuitem", { name: "Disable station…" })).toBeEnabled();
    expect(screen.queryByRole("menuitem", { name: /^Enable/ })).not.toBeInTheDocument();
  });

  // FRO-100. Every action that was on the row is still there, and the wording still follows
  // the station's state. An ellipsis marks each one that opens a dialog before it acts.
  it("lists the passport, booth and key actions, worded by the station's state", async () => {
    const user = userEvent.setup();
    const noBooth = station({ id: "no-booth", label: "Station 6", passport: null, booth: null });
    renderBoard([station(), noBooth]);

    await openStationActions(user, "Careers Corner");
    expect(menuItemNames()).toEqual([
      "Edit passport settings…",
      "Change booth…",
      "Replace key…",
      "Disable station…",
    ]);
    await user.keyboard("{Escape}");

    await openStationActions(user, "Station 6");
    expect(menuItemNames()).toEqual([
      "Add to passport…",
      "Set booth…",
      "Replace key…",
      "Disable station…",
    ]);
  });

  // The ticket: the menu works by keyboard. Enter on the trigger opens it, the arrows move
  // through it, and Enter on an item opens that item's dialog.
  it("opens by keyboard, and an item opens its dialog", async () => {
    const user = userEvent.setup();
    renderBoard([healthyStation]);

    screen.getByRole("button", { name: "Actions for Healthy Booth" }).focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Edit passport settings…" })).toHaveFocus();

    await user.keyboard("{ArrowDown}{Enter}");

    expect(await screen.findByRole("dialog")).toHaveTextContent("Booth");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
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
  // none.
  it("shows each station's booth, or No booth when it has none", () => {
    const noBooth = station({ id: "no-booth", label: "Station 6", passport: null, booth: null });
    renderBoard([station(), noBooth]);

    expect(screen.getByText("B2")).toBeInTheDocument();
    expect(screen.getByText("No booth")).toBeInTheDocument();
  });

  // The board polls every 12 seconds. A poll that sorts the stations again must not close a
  // menu the organiser has open, or move its row out from under them, so the order holds
  // while a menu is open and catches up once it closes.
  describe("a poll while a row's menu is open", () => {
    const wentOffline = { ...quietStation, online: false };

    /** The rows in order. An open menu is modal and hides them from the tree, hence hidden. */
    function names() {
      return screen
        .getAllByRole("row", { hidden: true })
        .slice(1)
        .map((row) => row.textContent ?? "");
    }

    it("keeps the menu open and the rows where they were", async () => {
      const user = userEvent.setup();
      const { poll } = renderBoard([healthyStation, quietStation]);

      await openStationActions(user, "Quiet Booth");
      poll([healthyStation, wentOffline]);

      expect(screen.getByRole("menu")).toBeInTheDocument();
      expect(names()[0]).toContain("Healthy Booth");
      expect(names()[1]).toContain("Quiet Booth");
      // The row itself is up to date, only its place is held.
      expect(names()[1]).toContain("Not responding");
    });

    it("acts on the station whose menu it is", async () => {
      const user = userEvent.setup();
      const { poll } = renderBoard([healthyStation, quietStation]);

      await openStationActions(user, "Quiet Booth");
      poll([healthyStation, wentOffline]);
      await user.click(screen.getByRole("menuitem", { name: "Disable station…" }));

      expect(await screen.findByRole("alertdialog")).toHaveTextContent("Disable Quiet Booth?");
    });

    it("sorts the rows again once the menu closes", async () => {
      const user = userEvent.setup();
      const { poll } = renderBoard([healthyStation, quietStation]);

      await openStationActions(user, "Quiet Booth");
      poll([healthyStation, wentOffline]);
      await user.keyboard("{Escape}");

      await waitFor(() => expect(names()[0]).toContain("Quiet Booth"));
    });

    it("still shows a station that arrives while the menu is open, below the rest", async () => {
      const user = userEvent.setup();
      const { poll } = renderBoard([healthyStation, quietStation]);
      const added = station({ id: "added", label: "Station 8", passport: null });

      await openStationActions(user, "Quiet Booth");
      poll([healthyStation, quietStation, added]);

      expect(names()).toHaveLength(3);
      expect(names()[2]).toContain("Station 8");
    });
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

    it("has an Enable action, and no Disable one", async () => {
      const user = userEvent.setup();
      renderBoard([disabledStation]);

      await openStationActions(user, "Careers Corner");

      expect(screen.getByRole("menuitem", { name: "Enable station" })).toBeEnabled();
      expect(screen.queryByRole("menuitem", { name: "Disable station…" })).not.toBeInTheDocument();
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

      await pickStationAction(user, name, "Enable station");

      expect(sent).toHaveBeenCalledTimes(1);
      expect(sent).toHaveBeenCalledWith(id);
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    // Read through 9.2 again rather than the prop, which never changes in this test.
    it("reads the station back as enabled through 9.2", async () => {
      const { api, user, name, id } = await setup();

      await pickStationAction(user, name, "Enable station");

      const after = (await api.listStationBoard()).stations.find((one) => one.id === id);
      expect(after?.disabled_at).toBeNull();
    });

    // 9.9 answers not_found for a station this Event Service does not have, and FRO-26 asks
    // for a plain message. There is no dialog to hold it, so the row itself says it.
    it("says so plainly in the row when the station is gone", async () => {
      const { api, user, name } = await setup();
      api.mock.failNext("not_found");

      await pickStationAction(user, name, "Enable station");

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "That was not found. It may have been removed.",
      );
      // The row is still the prop's station, so the action comes back with it.
      await openStationActions(user, name);
      expect(screen.getByRole("menuitem", { name: "Enable station" })).toBeEnabled();
    });

    // The ticket: disable the action while the request is in flight. The spy never
    // resolves, which is the in-flight case with no timing guess. Picking Enable closes the
    // menu, so the row says it is enabling, and the held item is checked by opening the
    // menu again. A click on it must not send a second enable either.
    it("waits while one enable is in the air, and one click is one call", async () => {
      const { api, user, name } = await setup();
      vi.spyOn(api, "enableStation").mockImplementationOnce(
        () => new Promise<StationResponse>(() => {}),
      );

      await pickStationAction(user, name, "Enable station");
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("Enabling");

      await openStationActions(user, name);

      const held = screen.getByRole("menuitem", { name: "Enabling" });
      expect(held).toHaveAttribute("aria-disabled", "true");

      await user.click(held);
      expect(api.enableStation).toHaveBeenCalledTimes(1);
    });
  });
});
