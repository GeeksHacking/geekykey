import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MeResponse, Stamp } from "@/api/types";
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

const cloud: Stamp = {
  station_id: "cloud",
  name: "Cloud Sponsor",
  location: "Hall B",
  points: 5,
  link: null,
  earned_at: "2026-11-12T08:04:31.000Z",
};
const robotics: Stamp = {
  station_id: "robotics",
  name: "Robotics Club",
  location: null,
  points: 3,
  link: null,
  earned_at: null,
};

const dressing: MeResponse = { ...baseMe, points: 5, stamps: [cloud, robotics] };

describe("DashboardScreen's avatar", () => {
  beforeEach(() => localStorage.clear());

  it("leads with the guest's name and says which pieces they wear", () => {
    state.me = dressing;
    renderDashboard();

    const avatar = screen.getByRole("region", { name: "Your avatar" });
    expect(within(avatar).getByRole("heading", { level: 1, name: "Alex Tan" })).toBeInTheDocument();
    const pieces = within(avatar).getByRole("list", { name: "Your outfit" });
    expect(within(pieces).getByText("Hat, from Cloud Sponsor: wearing")).toBeInTheDocument();
    expect(within(pieces).getByText("Pearls, from Robotics Club: not yet")).toBeInTheDocument();
    expect(avatar).toHaveTextContent("1 of 2 pieces · 5 points");
  });

  it("keeps a colour the guest picks, for that guest only", async () => {
    const user = userEvent.setup();
    state.me = dressing;
    const { unmount } = renderDashboard();

    await user.click(screen.getByRole("button", { name: "Change colours" }));
    await user.click(screen.getByRole("radio", { name: "Deep" }));
    await user.keyboard("{Escape}");
    unmount();

    const again = renderDashboard();
    await user.click(screen.getByRole("button", { name: "Change colours" }));
    expect(screen.getByRole("radio", { name: "Deep" })).toBeChecked();
    await user.keyboard("{Escape}");
    again.unmount();

    state.me = { ...dressing, user: { ...dressing.user, id: "user-2" } };
    renderDashboard();
    await user.click(screen.getByRole("button", { name: "Change colours" }));
    expect(screen.getByRole("radio", { name: "Warm" })).toBeChecked();
  });

  it("shows the memory card with the guest's name, and says so when the picture can't be made", async () => {
    const user = userEvent.setup();
    state.me = dressing;
    renderDashboard();

    await user.click(screen.getByRole("button", { name: "Show my card" }));

    const card = screen.getByRole("dialog", { name: "Your Grad Tea card" });
    expect(within(card).getByText("THE GRAD TEA")).toBeInTheDocument();
    expect(within(card).getByText("Alex Tan")).toBeInTheDocument();
    // jsdom has no canvas, so drawing the picture fails as it would on a broken browser.
    expect(await within(card).findByRole("alert")).toHaveTextContent(
      "Couldn't make the picture. Close this and try again.",
    );
    expect(within(card).getByRole("button", { name: "Save picture" })).toBeDisabled();
  });
});
