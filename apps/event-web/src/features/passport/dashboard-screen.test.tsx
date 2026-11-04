import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockClient } from "@/api/mock/client";
import { SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import type { MeResponse, Stamp } from "@/api/types";
import { DashboardScreen } from "@/features/passport/dashboard-screen";
import { ThemeProvider } from "@/lib/theme-provider";
import { makeMe } from "@/test/make-me";
import { createTestProviders } from "@/test/providers";

const state = vi.hoisted(() => ({ me: null as MeResponse | null }));

vi.mock("@/lib/session", () => ({
  useMe: () => ({ me: state.me, refresh: async () => {} }),
}));

vi.mock("@/components/layout/section-heading", () => ({
  SectionHeading: ({ title }: { title: string }) => <h2>{title}</h2>,
}));

const baseMe = makeMe({ user: { id: "user-1" } });

function renderDashboard() {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(SEEDED_PARTICIPANT_ID);
  const { Providers } = createTestProviders(api);
  return render(
    <Providers>
      <ThemeProvider>
        <DashboardScreen />
      </ThemeProvider>
    </Providers>,
  );
}

describe("DashboardScreen", () => {
  it("gives a participant the group card, and an organiser none", async () => {
    state.me = baseMe;
    const { unmount } = renderDashboard();
    expect(await screen.findByRole("button", { name: "Join" })).toBeInTheDocument();
    unmount();

    state.me = makeMe({ user: { id: "user-1", role: "organizer" } });
    renderDashboard();
    expect(screen.queryByRole("button", { name: "Join" })).not.toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Loading your group" })).not.toBeInTheDocument();
  });

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
    expect(within(pieces).getByText("Monocle, from Robotics Club: not yet")).toBeInTheDocument();
    expect(avatar).toHaveTextContent("1 of 2 pieces · 5 points");
  });

  it("says the picture can be added as a sticker in WhatsApp", () => {
    state.me = dressing;
    renderDashboard();

    const avatar = screen.getByRole("region", { name: "Your avatar" });
    const button = within(avatar).getByRole("button", { name: "Save as sticker" });
    expect(button).toHaveAccessibleDescription(
      "You can add this picture as a sticker in WhatsApp.",
    );
  });

  it("keeps a colour the guest picks, for that guest only", async () => {
    const user = userEvent.setup();
    state.me = dressing;
    const { unmount } = renderDashboard();

    await user.click(screen.getByRole("button", { name: "Change look" }));
    await user.click(screen.getByRole("radio", { name: "Deep" }));
    await user.keyboard("{Escape}");
    unmount();

    const again = renderDashboard();
    await user.click(screen.getByRole("button", { name: "Change look" }));
    expect(screen.getByRole("radio", { name: "Deep" })).toBeChecked();
    await user.keyboard("{Escape}");
    again.unmount();

    state.me = { ...dressing, user: { ...dressing.user, id: "user-2" } };
    renderDashboard();
    await user.click(screen.getByRole("button", { name: "Change look" }));
    expect(screen.getByRole("radio", { name: "Warm" })).toBeChecked();
  });

  it("dresses the character the guest picks in that character's own pieces", async () => {
    const user = userEvent.setup();
    state.me = dressing;
    renderDashboard();

    await user.click(screen.getByRole("button", { name: "Change look" }));
    const look = screen.getByRole("dialog", { name: "Your look" });
    await user.click(within(look).getByRole("radio", { name: "In a dress" }));

    expect(within(look).getByRole("radio", { name: "In a dress" })).toBeChecked();
    expect(within(look).getByRole("radiogroup", { name: "Dress" })).toBeInTheDocument();
    expect(within(look).getByRole("radio", { name: "Emerald" })).toBeChecked();
    await user.keyboard("{Escape}");
    const pieces = screen.getByRole("list", { name: "Your outfit" });
    expect(within(pieces).getByText("Feather, from Cloud Sponsor: wearing")).toBeInTheDocument();
    expect(within(pieces).getByText("Pearls, from Robotics Club: not yet")).toBeInTheDocument();
  });

  it("doesn't offer the demo toggle to a participant", () => {
    state.me = dressing;
    renderDashboard();

    expect(screen.queryByRole("region", { name: "Demo" })).not.toBeInTheDocument();
  });

  it("lets an organizer put every piece on and take it off, then go back to the stamps", async () => {
    const user = userEvent.setup();
    state.me = { ...dressing, user: { ...dressing.user, role: "organizer" } };
    renderDashboard();

    const demo = screen.getByRole("region", { name: "Demo" });
    const avatar = screen.getByRole("region", { name: "Your avatar" });
    await user.click(within(demo).getByRole("button", { name: "Monocle" }));

    expect(within(demo).getByRole("button", { name: "Monocle" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const pieces = within(avatar).getByRole("list", { name: "Your outfit" });
    expect(within(pieces).getByText("Monocle, from Robotics Club: wearing")).toBeInTheDocument();
    // The demo shows every piece, even past the event's two stamp slots, and ignores the stamps.
    expect(within(pieces).getByText("Hat, from Cloud Sponsor: not yet")).toBeInTheDocument();
    expect(within(pieces).getByText("Glass, from the demo: not yet")).toBeInTheDocument();
    expect(avatar).toHaveTextContent("1 of 4 pieces");

    await user.click(within(demo).getByRole("button", { name: "Monocle" }));
    expect(avatar).toHaveTextContent("0 of 4 pieces");

    await user.click(within(demo).getByRole("button", { name: "Back to my stamps" }));
    expect(avatar).toHaveTextContent("1 of 2 pieces · 5 points");
  });

  it("shows the memory card with the guest's name, and says so when the picture can't be made", async () => {
    const user = userEvent.setup();
    state.me = dressing;
    renderDashboard();

    await user.click(screen.getByRole("button", { name: "Show my card" }));

    const card = screen.getByRole("dialog", { name: "Your card from the grad tea" });
    expect(within(card).getByText("THE GRAD TEA")).toBeInTheDocument();
    expect(within(card).getByText("Alex Tan")).toBeInTheDocument();
    // jsdom has no canvas, so drawing the picture fails as it would on a broken browser.
    expect(await within(card).findByRole("alert")).toHaveTextContent(
      "Couldn't make the picture. Close this and try again.",
    );
    expect(within(card).getByRole("button", { name: "Save picture" })).toBeDisabled();
  });
});
