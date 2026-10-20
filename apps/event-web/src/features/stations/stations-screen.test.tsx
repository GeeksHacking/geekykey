import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { queryKeys } from "@/api/keys";
import { createMockClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID } from "@/api/mock/fixtures";
import { StationsScreen } from "@/features/stations/stations-screen";
import { createTestProviders } from "@/test/providers";

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});

describe("StationsScreen", () => {
  it("renders the board and keeps the mock add-station dialog working", async () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    api.mock.setSession(SEEDED_ORGANIZER_ID);
    const { Providers } = createTestProviders(api);
    const user = userEvent.setup();
    render(
      <Providers>
        <StationsScreen />
      </Providers>,
    );

    expect((await screen.findAllByText("Not in the passport")).length).toBeGreaterThan(0);
    expect(screen.queryByText("No longer linked")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create station" }));
    await user.type(screen.getByLabelText("Label"), "Test Station");
    await user.click(screen.getByRole("button", { name: "Create station" }));

    expect(
      await screen.findByRole("heading", { name: "Test Station is ready" }),
    ).toBeInTheDocument();
  });

  // FRO-24's first acceptance criterion: a new station joins the board as "Not in the
  // passport", with the button that adds its settings. The test above creates one and stops
  // at the dialog, so nothing had proved the board picks it up. use-create-station.ts
  // invalidates stationBoard, and this is what pins that.
  it("puts a station added through the dialog on the board, not in the passport", async () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    api.mock.setSession(SEEDED_ORGANIZER_ID);
    const { Providers } = createTestProviders(api);
    const user = userEvent.setup();
    render(
      <Providers>
        <StationsScreen />
      </Providers>,
    );

    // Before the create, to be sure the row below is the one this test added.
    expect((await screen.findAllByText("Not in the passport")).length).toBeGreaterThan(1);

    await user.click(screen.getByRole("button", { name: "Create station" }));
    await user.type(screen.getByLabelText("Label"), "Reader 9");
    await user.click(screen.getByRole("button", { name: "Create station" }));
    await user.click(await screen.findByRole("button", { name: "Done" }));

    const row = await waitFor(() => {
      const found = screen
        .getAllByRole("row")
        .find((candidate) => (candidate.textContent ?? "").includes("Reader 9"));
      expect(found).toBeDefined();
      return found as HTMLElement;
    });

    expect(row).toHaveTextContent("Not in the passport");
    expect(screen.getByRole("button", { name: "Add to passport Reader 9" })).toBeInTheDocument();
  });

  it("puts the mock's problem stations first, so trouble is at the top", async () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    api.mock.setSession(SEEDED_ORGANIZER_ID);
    const { Providers } = createTestProviders(api);
    render(
      <Providers>
        <StationsScreen />
      </Providers>,
    );

    await screen.findAllByText("Not in the passport");

    const rows = screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => row.textContent ?? "");
    const problems = [
      "Reader not responding",
      "Holding saved taps",
      "Not in the passport",
      "Not responding",
    ];
    const isProblem = (name: string) => problems.some((problem) => name.includes(problem));
    // The disabled fixture is offline as well as disabled, and 9.2 puts a disabled station
    // last whatever else is true of it, so it is counted apart from the two groups.
    const enabled = rows.filter((row) => !row.includes("Disabled"));
    const flagged = enabled
      .map((name, index) => (isProblem(name) ? index : -1))
      .filter((i) => i >= 0);
    const quiet = enabled
      .map((name, index) => (isProblem(name) ? -1 : index))
      .filter((i) => i >= 0);

    expect(flagged.length).toBeGreaterThan(0);
    expect(quiet.length).toBeGreaterThan(0);
    expect(Math.max(...flagged)).toBeLessThan(Math.min(...quiet));
    expect(rows.filter((row) => row.includes("Disabled"))).toHaveLength(1);
    expect(rows[rows.length - 1]).toContain("Disabled");
  });

  it("never says the status is unknown, because no status call is left to fail", async () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    api.mock.setSession(SEEDED_ORGANIZER_ID);
    const { Providers } = createTestProviders(api);
    render(
      <Providers>
        <StationsScreen />
      </Providers>,
    );

    await screen.findAllByText("Not in the passport");

    expect(screen.queryByText(/Couldn't get the stations' status/)).not.toBeInTheDocument();
    expect(screen.queryByText("Status unknown")).not.toBeInTheDocument();
    // Every station now has a real answer, so nothing reads as unknown or never connected
    // on a healthy mock board.
    expect(screen.getAllByText("Online").length).toBeGreaterThan(0);
  });

  it("badges the disabled fixture and puts it last", async () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    api.mock.setSession(SEEDED_ORGANIZER_ID);
    const { Providers } = createTestProviders(api);
    render(
      <Providers>
        <StationsScreen />
      </Providers>,
    );

    await screen.findAllByText("Not in the passport");

    // The mock's seventh fixture is disabled, and keeps its passport name (9.2).
    expect(screen.getByText("Disabled")).toBeInTheDocument();
    expect(screen.getByText("Info Desk")).toBeInTheDocument();

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.at(-1)?.textContent ?? "").toContain("Info Desk");
  });

  it("keeps the board and shows a quiet note when a poll is rate limited", async () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    api.mock.setSession(SEEDED_ORGANIZER_ID);
    const { Providers, queryClient } = createTestProviders(api);
    render(
      <Providers>
        <StationsScreen />
      </Providers>,
    );

    await screen.findAllByText("Not in the passport");
    const stationCount = screen.getAllByRole("row").length;
    expect(stationCount).toBeGreaterThan(1);

    api.mock.failNext("rate_limited");
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: queryKeys.stationBoard });
    });

    expect(await screen.findByText("Showing the last update.")).toBeInTheDocument();
    // The board itself survives, rather than being swapped for an error state.
    expect(screen.getAllByRole("row")).toHaveLength(stationCount);
    expect(screen.queryByText("Station updates are delayed.")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Too many requests. Wait a minute and try again."),
    ).not.toBeInTheDocument();
  });

  it("still offers a retry from the quiet note", async () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    api.mock.setSession(SEEDED_ORGANIZER_ID);
    const { Providers, queryClient } = createTestProviders(api);
    const user = userEvent.setup();
    render(
      <Providers>
        <StationsScreen />
      </Providers>,
    );

    await screen.findAllByText("Not in the passport");
    api.mock.failNext("rate_limited");
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: queryKeys.stationBoard });
    });
    await screen.findByText("Showing the last update.");

    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() =>
      expect(screen.queryByText("Showing the last update.")).not.toBeInTheDocument(),
    );
    expect(screen.getAllByText("Online").length).toBeGreaterThan(0);
  });

  it("shows the red error state when a first load is rate limited with no data", async () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    api.mock.setSession(SEEDED_ORGANIZER_ID);
    api.mock.failNext("rate_limited");
    const { Providers } = createTestProviders(api);
    render(
      <Providers>
        <StationsScreen />
      </Providers>,
    );

    // No data to keep, so the ticket allows the usual error with a retry.
    expect(
      await screen.findByText("Too many requests. Wait a minute and try again."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Showing the last update.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
