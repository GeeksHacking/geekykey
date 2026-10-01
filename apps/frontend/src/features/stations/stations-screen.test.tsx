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
});
