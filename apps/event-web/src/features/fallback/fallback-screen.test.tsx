import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { createMockClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID } from "@/api/mock/fixtures";
import { FallbackScreen } from "@/features/fallback/fallback-screen";
import { createTestProviders } from "@/test/providers";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

describe("FallbackScreen", () => {
  it("offers station setup when the station list is empty", async () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    api.mock.setSession(SEEDED_ORGANIZER_ID);
    api.mock.data.stations = [];
    const { Providers } = createTestProviders(api);

    render(
      <Providers>
        <FallbackScreen />
      </Providers>,
    );

    expect(await screen.findByText("No stations to log for")).toBeInTheDocument();
    const action = screen.getByRole("link", { name: "Create a station" });
    expect(action).toHaveAttribute("href", "/admin/stations");
  });
});
