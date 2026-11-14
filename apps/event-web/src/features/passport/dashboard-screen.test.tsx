import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockClient } from "@/api/mock/client";
import { SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import type { Connection, MeResponse, Stamp } from "@/api/types";
import { DashboardScreen } from "@/features/passport/dashboard-screen";
import { ThemeProvider } from "@/lib/theme-provider";
import { makeMe } from "@/test/make-me";
import { createTestProviders } from "@/test/providers";

const state = vi.hoisted(() => ({ me: null as MeResponse | null }));

vi.mock("@/lib/session", () => ({
  useMe: () => ({ me: state.me, refresh: async () => {} }),
  useSession: () => ({ consumeLoginLinkArrival: () => false }),
}));

/* Home's "See all" is a router link, and these tests render the screen without a router (FRO-182). */
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));

const baseMe = makeMe({ user: { id: "user-1" } });

const firstTap: MeResponse["recent_taps"][number] = {
  id: 1,
  station_id: "station-1",
  station_name: "Entry Arch",
  status: "accepted",
  source: "nfc",
  tapped_at: null,
  received_at: "2026-10-01T00:00:00.000Z",
};

const answersGame: MeResponse["questions"] = [
  {
    id: "drink",
    text: "Tea or coffee?",
    choices: [
      { id: "tea", text: "Tea" },
      { id: "coffee", text: "Coffee" },
    ],
  },
];

beforeEach(() => {
  sessionStorage.clear();
});

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

  it("asks a participant with no name at the group card, and an organizer not at all", async () => {
    state.me = makeMe({ user: { id: "user-1", has_name: false } });
    const { unmount } = renderDashboard();
    expect(
      await screen.findByRole("heading", { name: "What should we call you?" }),
    ).toBeInTheDocument();
    unmount();

    state.me = makeMe({ user: { id: "user-1", role: "organizer", has_name: false } });
    renderDashboard();
    expect(
      screen.queryByRole("heading", { name: "What should we call you?" }),
    ).not.toBeInTheDocument();
  });

  it("shows how to start collecting stamps before the first tap without the answers game", () => {
    state.me = baseMe;
    renderDashboard();

    expect(
      screen.getByRole("heading", {
        name: "Tap your token at any station to start collecting stamps",
      }),
    ).toBeInTheDocument();
  });

  it("says how to connect before the first tap when the event has the answers game", () => {
    state.me = makeMe({ questions: answersGame });
    renderDashboard();

    expect(
      screen.getByRole("heading", {
        name: "Tap someone's token with your phone to connect.",
      }),
    ).toBeInTheDocument();
  });

  it("leaves My tokens to the account menu, before and after the first tap", () => {
    state.me = baseMe;
    const first = renderDashboard();
    expect(screen.queryByRole("link", { name: "My tokens" })).not.toBeInTheDocument();
    first.unmount();

    state.me = { ...baseMe, recent_taps: [firstTap] };
    renderDashboard();
    expect(screen.queryByRole("link", { name: "My tokens" })).not.toBeInTheDocument();
  });

  it("leaves the passport to its tab, and links to the full activity list", () => {
    state.me = { ...baseMe, recent_taps: [firstTap] };
    renderDashboard();

    expect(screen.getByRole("heading", { name: "Latest stamps" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recent activity" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open passport" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See all" })).toHaveAttribute("href", "/activity");
  });

  it("removes the hint after the first tap, and leaves the user ID to the Profile tab", () => {
    state.me = { ...baseMe, recent_taps: [firstTap] };
    renderDashboard();

    expect(
      screen.queryByRole("heading", {
        name: "Tap your token at any station to start collecting stamps",
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("user-1")).not.toBeInTheDocument();
  });

  it("keeps the avatar but drops the profile, the answers and the details", () => {
    state.me = makeMe({ questions: answersGame, user: { bio: "Robot arm" } });
    renderDashboard();

    expect(screen.getByRole("region", { name: "Your avatar" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your profile" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your answers" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your details" })).not.toBeInTheDocument();
  });

  it("keeps the connect hint after a connection when there have been no station taps", () => {
    state.me = makeMe({ questions: answersGame, connections: [met] });
    renderDashboard();

    expect(
      screen.getByRole("heading", {
        name: "Tap someone's token with your phone to connect.",
      }),
    ).toBeInTheDocument();
  });

  it("drops the connect hint after the first tap", () => {
    state.me = makeMe({ questions: answersGame });
    const first = renderDashboard();
    expect(
      screen.getByRole("heading", {
        name: "Tap someone's token with your phone to connect.",
      }),
    ).toBeInTheDocument();
    first.unmount();

    state.me = { ...makeMe({ questions: answersGame }), recent_taps: [firstTap] };
    renderDashboard();
    expect(
      screen.queryByRole("heading", {
        name: "Tap someone's token with your phone to connect.",
      }),
    ).not.toBeInTheDocument();
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

const met: Connection = {
  connected_at: "2026-11-12T08:20:00.000Z",
  display_name: "Mei Lin",
  bio: null,
  contact_line: null,
  kind: "B",
  match: 60,
  shared: null,
  shared_at: "2026-11-12T08:22:00.000Z",
};

function connections(count: number): Connection[] {
  return Array.from({ length: count }, (_, index) => ({
    ...met,
    connected_at: `2026-11-12T08:${String(20 + index).padStart(2, "0")}:00.000Z`,
    shared_at: `2026-11-12T08:${String(22 + index).padStart(2, "0")}:00.000Z`,
  }));
}

const won: Connection = {
  ...met,
  dice: { your_roll: 5, their_roll: 2, result: "win" },
};

const lost: Connection = {
  ...met,
  dice: { your_roll: 2, their_roll: 5, result: "loss" },
};

const dressing: MeResponse = {
  ...baseMe,
  points: 5,
  stamps: [cloud, robotics],
  connections: [met],
};

describe("DashboardScreen's avatar", () => {
  beforeEach(() => localStorage.clear());

  it("leads with the guest's name and says which pieces they wear", () => {
    state.me = dressing;
    renderDashboard();

    const avatar = screen.getByRole("region", { name: "Your avatar" });
    expect(within(avatar).getByText("GeekyKey at the showcase")).toBeInTheDocument();
    expect(within(avatar).getByRole("heading", { level: 1, name: "Alex Tan" })).toBeInTheDocument();
    const pieces = within(avatar).getByRole("list", { name: "Your outfit" });
    expect(within(pieces).getByText("Hat: wearing")).toBeInTheDocument();
    expect(within(pieces).getByText("Monocle: not yet")).toBeInTheDocument();
    expect(avatar).toHaveTextContent("1 of 4 pieces · 5 points");
  });

  it("gives a guest with no connections four empty pieces and a count of 0", () => {
    state.me = makeMe({ points: 0 });
    renderDashboard();

    const avatar = screen.getByRole("region", { name: "Your avatar" });
    expect(avatar).toHaveTextContent("0 of 4 pieces · 0 points");
    expect(within(avatar).getByText("Hat: not yet")).toBeInTheDocument();
    expect(within(avatar).getByText("Glass: not yet")).toBeInTheDocument();
  });

  it("stays at four pieces after more connections, and still shows the points", () => {
    state.me = makeMe({ points: 12, connections: connections(5) });
    renderDashboard();

    const avatar = screen.getByRole("region", { name: "Your avatar" });
    expect(avatar).toHaveTextContent("4 of 4 pieces · 12 points");
    expect(within(avatar).getByText("Hat: wearing")).toBeInTheDocument();
    expect(within(avatar).getByText("Glass: wearing")).toBeInTheDocument();
  });

  it("wears two pieces for a win and one for a loss", () => {
    state.me = makeMe({ connections: [won] });
    const first = renderDashboard();
    expect(screen.getByRole("region", { name: "Your avatar" })).toHaveTextContent("2 of 4 pieces");
    first.unmount();

    state.me = makeMe({ connections: [lost] });
    renderDashboard();
    expect(screen.getByRole("region", { name: "Your avatar" })).toHaveTextContent("1 of 4 pieces");
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
    expect(within(pieces).getByText("Feather: wearing")).toBeInTheDocument();
    expect(within(pieces).getByText("Pearls: not yet")).toBeInTheDocument();
  });

  it("doesn't offer the demo toggle to a participant", () => {
    state.me = dressing;
    renderDashboard();

    expect(screen.queryByRole("region", { name: "Demo" })).not.toBeInTheDocument();
  });

  it("lets an organizer put every piece on and take it off, then go back to the connections", async () => {
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
    expect(within(pieces).getByText("Monocle: wearing")).toBeInTheDocument();
    // The demo shows every piece, even past the guest's one connection, and ignores the connections.
    expect(within(pieces).getByText("Hat: not yet")).toBeInTheDocument();
    expect(within(pieces).getByText("Glass: not yet")).toBeInTheDocument();
    expect(avatar).toHaveTextContent("1 of 4 pieces");

    await user.click(within(demo).getByRole("button", { name: "Monocle" }));
    expect(avatar).toHaveTextContent("0 of 4 pieces");

    await user.click(within(demo).getByRole("button", { name: "Back to my connections" }));
    expect(avatar).toHaveTextContent("1 of 4 pieces · 5 points");
  });

  it("shows the memory card with the guest's name, and says so when the picture can't be made", async () => {
    const user = userEvent.setup();
    state.me = dressing;
    renderDashboard();

    await user.click(screen.getByRole("button", { name: "Show my card" }));

    const card = screen.getByRole("dialog", { name: "Your card from the showcase" });
    expect(within(card).getByText("GEEKYKEY AT THE SHOWCASE")).toBeInTheDocument();
    expect(within(card).getByText("Alex Tan")).toBeInTheDocument();
    // The card stays anonymous: it never names who the guest connected with.
    expect(card).not.toHaveTextContent(met.display_name!);
    // jsdom has no canvas, so drawing the picture fails as it would on a broken browser.
    expect(await within(card).findByRole("alert")).toHaveTextContent(
      "Couldn't make the picture. Close this and try again.",
    );
    expect(within(card).getByRole("button", { name: "Save picture" })).toBeDisabled();
  });
});
