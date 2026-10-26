import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { MeResponse } from "@/api/types";
import { DashboardScreen } from "@/features/passport/dashboard-screen";
import { ThemeProvider } from "@/lib/theme-provider";

const state = vi.hoisted(() => ({ me: null as MeResponse | null }));

vi.mock("@/lib/session", () => ({
  useMe: () => ({ me: state.me, refresh: async () => {} }),
}));

vi.mock("@/components/layout/section-heading", () => ({
  SectionHeading: ({ title }: { title: string }) => <h2>{title}</h2>,
}));

const baseMe: MeResponse = {
  user: { id: "user-1", display_name: "Alex Tan", role: "participant", has_name: true },
  points: 0,
  stamps: [],
  recent_taps: [],
};

function renderDashboard() {
  return render(
    <ThemeProvider>
      <DashboardScreen />
    </ThemeProvider>,
  );
}

describe("DashboardScreen", () => {
  it("shows the claim help before the first tap", () => {
    state.me = baseMe;
    renderDashboard();

    expect(screen.getByText("Tap your token with your phone to claim it")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My tokens" })).toBeInTheDocument();
  });

  it("keeps the user ID but removes the claim help after the first tap", () => {
    state.me = {
      ...baseMe,
      recent_taps: [
        {
          id: 1,
          station_id: "station-1",
          station_name: "Entry Arch",
          status: "accepted",
          source: "nfc",
          tapped_at: null,
          received_at: "2026-10-01T00:00:00.000Z",
        },
      ],
    };
    renderDashboard();

    expect(
      screen.queryByText("Tap your token with your phone to claim it"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "My tokens" })).not.toBeInTheDocument();
    expect(screen.getByText("user-1")).toBeInTheDocument();
  });
});
