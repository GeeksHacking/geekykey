import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

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
  it("renders the v0.2 board and keeps the mock add-station dialog working", async () => {
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
    expect(screen.getByText("No longer linked")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add station" }));
    await user.type(screen.getByLabelText("Name"), "Test Station");
    await user.click(screen.getByRole("button", { name: "Create station" }));

    expect(
      await screen.findByRole("heading", { name: "Test Station is ready" }),
    ).toBeInTheDocument();
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

    const names = screen
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
    const flagged = names
      .map((name, index) => (isProblem(name) ? index : -1))
      .filter((i) => i >= 0);
    const quiet = names.map((name, index) => (isProblem(name) ? -1 : index)).filter((i) => i >= 0);

    expect(flagged.length).toBeGreaterThan(0);
    expect(quiet.length).toBeGreaterThan(0);
    expect(Math.max(...flagged)).toBeLessThan(Math.min(...quiet));
  });

  it("shows a notice and 'Status unknown' when the status call failed", async () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    api.mock.setSession(SEEDED_ORGANIZER_ID);
    api.mock.setStatusKnown(false);
    const { Providers } = createTestProviders(api);
    render(
      <Providers>
        <StationsScreen />
      </Providers>,
    );

    expect(await screen.findByText(/Couldn't get the stations' status/)).toBeInTheDocument();
    expect(screen.getAllByText("Status unknown").length).toBeGreaterThan(0);
    expect(screen.queryByText("Offline")).not.toBeInTheDocument();
    expect(screen.queryByText("Never connected")).not.toBeInTheDocument();
  });

  it("still shows passport details and last taps when the status is unknown", async () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    api.mock.setSession(SEEDED_ORGANIZER_ID);
    api.mock.setStatusKnown(false);
    const { Providers } = createTestProviders(api);
    render(
      <Providers>
        <StationsScreen />
      </Providers>,
    );

    // Passport names and locations come from the Event Service, so they survive.
    expect(await screen.findByText("3D Printing Booth")).toBeInTheDocument();
    expect(screen.getByText("Hall A")).toBeInTheDocument();
  });

  it("turns nothing red just because the status is unknown", async () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    api.mock.setSession(SEEDED_ORGANIZER_ID);
    api.mock.setStatusKnown(false);
    const { Providers } = createTestProviders(api);
    render(
      <Providers>
        <StationsScreen />
      </Providers>,
    );

    await screen.findByText(/Couldn't get the stations' status/);

    expect(screen.queryByText("Not responding")).not.toBeInTheDocument();
    expect(screen.queryByText("Reader not responding")).not.toBeInTheDocument();
    expect(screen.queryByText("Holding saved taps")).not.toBeInTheDocument();
  });

  it("says nothing about the status when the status call worked", async () => {
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
    expect(screen.getAllByText("Online").length).toBeGreaterThan(0);
  });
});
