import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockClient } from "@/api/mock/client";
import type { Connection, MeResponse, Stamp } from "@/api/types";
import { DashboardScreen } from "@/features/passport/dashboard-screen";
import { PassportScreen } from "@/features/passport/passport-screen";
import { createTestProviders } from "@/test/providers";
import { makeMe } from "@/test/make-me";

/*
  jsdom is a phone here: its matchMedia matches nothing, so the screens never load GSAP and
  each change is marked for its CSS transition instead. A rerender with a new /me is a poll.
*/

const state = vi.hoisted(() => ({ me: null as MeResponse | null }));

vi.mock("@/lib/session", () => ({
  useMe: () => ({ me: state.me, refresh: async () => {} }),
  useSession: () => ({ consumeLoginLinkArrival: () => false }),
}));

vi.mock("@/components/layout/section-heading", () => ({
  SectionHeading: ({ title }: { title: string }) => <h2>{title}</h2>,
}));

const printing: Stamp = {
  station_id: "printing",
  name: "3D Printing Booth",
  location: "Hall A",
  points: 3,
  link: "https://example.com/3d-printing",
  earned_at: null,
};
const lounge: Stamp = {
  station_id: "lounge",
  name: "Hardware Lounge",
  location: null,
  points: 2,
  link: null,
  earned_at: "2026-11-17T02:14:09.000Z",
};

const before = makeMe({ points: 2, stamps: [printing, lounge] });

const met: Connection = {
  connected_at: "2026-11-17T02:40:00.000Z",
  display_name: "Mei Lin",
  kind: "B",
  match: 60,
  shared: null,
  shared_at: "2026-11-17T02:45:00.000Z",
};

function connections(count: number): Connection[] {
  return Array.from({ length: count }, (_, index) => ({
    ...met,
    connected_at: `2026-11-17T02:${String(40 + index).padStart(2, "0")}:00.000Z`,
    shared_at: `2026-11-17T02:${String(45 + index).padStart(2, "0")}:00.000Z`,
  }));
}

const withConnection: MeResponse = { ...before, points: 3, connections: [met] };
const withFourConnections: MeResponse = { ...before, points: 6, connections: connections(4) };
const afterFifthConnection: MeResponse = {
  ...withFourConnections,
  points: 7,
  connections: connections(5),
};

const afterPrinting: MeResponse = {
  ...before,
  points: 5,
  stamps: [{ ...printing, earned_at: "2026-11-17T02:31:47.000Z" }, lounge],
};

const earnedPrinting: Stamp = {
  ...printing,
  earned_at: "2026-11-17T02:31:47.000Z",
};
const careers: Stamp = {
  station_id: "careers",
  name: "Careers Corner",
  location: "Hall B",
  points: 2,
  link: "https://example.com/careers",
  earned_at: null,
};
const withCareers: MeResponse = {
  ...afterPrinting,
  points: 7,
  stamps: [earnedPrinting, careers, lounge],
};
const afterCareers: MeResponse = {
  ...withCareers,
  stamps: [earnedPrinting, { ...careers, earned_at: "2026-11-17T02:33:00.000Z" }, lounge],
};
const afterCareersNoLink: MeResponse = {
  ...withCareers,
  stamps: [
    earnedPrinting,
    { ...careers, link: null, earned_at: "2026-11-17T02:33:00.000Z" },
    lounge,
  ],
};

function renderScreen(Screen: () => React.ReactNode) {
  const api = createMockClient({ latencyMs: [0, 0], storage: null, simulate: false });
  const { Providers } = createTestProviders(api);
  const view = render(
    <Providers>
      <Screen />
    </Providers>,
  );
  return {
    poll(me: MeResponse) {
      state.me = me;
      // A new element each time, so React renders the screen again rather than skip it.
      view.rerender(
        <Providers>
          <Screen />
        </Providers>,
      );
    },
  };
}

function tile(name: string) {
  const item = within(screen.getByRole("list", { name: "Stamps" }))
    .getByText(name)
    .closest("li");
  if (!item) throw new Error(`No stamp tile for ${name}`);
  return item;
}

function changed() {
  return Array.from(document.querySelectorAll("[data-changed]"));
}

beforeEach(() => {
  state.me = before;
  localStorage.clear();
});

describe("the passport marks what a poll changed", () => {
  it("marks the slot that filled, and only that one", () => {
    const { poll } = renderScreen(PassportScreen);
    expect(changed()).toEqual([]);

    poll(afterPrinting);

    expect(tile("3D Printing Booth")).toHaveAttribute("data-changed", "stamp");
    expect(tile("Hardware Lounge")).not.toHaveAttribute("data-changed");
  });

  it("clears the mark once it has played, so a rotated tablet doesn't play it again", () => {
    vi.useFakeTimers();
    try {
      const { poll } = renderScreen(PassportScreen);
      poll(afterPrinting);
      expect(changed()).not.toEqual([]);

      act(() => vi.advanceTimersByTime(2_000));

      expect(changed()).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks nothing on a poll that changed nothing", () => {
    const { poll } = renderScreen(PassportScreen);
    poll(afterPrinting);

    poll(structuredClone(afterPrinting));

    expect(changed()).toEqual([]);
  });
});

describe("the passport offers the new stamp's group page", () => {
  function banner(name: string) {
    return screen.getByRole("status", { name: `New stamp at ${name}` });
  }

  it("offers nothing on the first poll", () => {
    renderScreen(PassportScreen);

    expect(screen.queryByText("New stamp")).toBeNull();
  });

  it("offers nothing for a stamp that was already there", () => {
    state.me = afterPrinting;
    renderScreen(PassportScreen);

    expect(screen.queryByText("New stamp")).toBeNull();
  });

  it("offers the new stamp's name and page", () => {
    const { poll } = renderScreen(PassportScreen);
    poll(afterPrinting);

    const card = banner("3D Printing Booth");
    expect(within(card).getByText("3D Printing Booth")).toBeInTheDocument();
    const link = within(card).getByRole("link", { name: "Open their page?" });
    expect(link).toHaveAttribute("href", "https://example.com/3d-printing");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("keeps the offer through a poll that changed nothing", () => {
    const { poll } = renderScreen(PassportScreen);
    poll(afterPrinting);

    poll(structuredClone(afterPrinting));

    expect(banner("3D Printing Booth")).toBeInTheDocument();
  });

  it("dismisses the offer", () => {
    const { poll } = renderScreen(PassportScreen);
    poll(afterPrinting);

    fireEvent.click(within(banner("3D Printing Booth")).getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByText("New stamp")).toBeNull();
  });

  it("goes away when the page is pressed", () => {
    const { poll } = renderScreen(PassportScreen);
    poll(afterPrinting);

    fireEvent.click(
      within(banner("3D Printing Booth")).getByRole("link", { name: "Open their page?" }),
    );

    expect(screen.queryByText("New stamp")).toBeNull();
  });

  it("replaces the offer at the next new stamp", () => {
    const { poll } = renderScreen(PassportScreen);
    poll(afterPrinting);
    poll(withCareers);

    poll(afterCareers);

    const card = banner("Careers Corner");
    expect(within(card).getByRole("link", { name: "Open their page?" })).toHaveAttribute(
      "href",
      "https://example.com/careers",
    );
  });

  it("clears the offer when the next new stamp has no link", () => {
    const { poll } = renderScreen(PassportScreen);
    poll(afterPrinting);
    poll(withCareers);

    poll(afterCareersNoLink);

    expect(screen.queryByText("New stamp")).toBeNull();
  });

  it("clears the offer when someone else signs in", () => {
    const { poll } = renderScreen(PassportScreen);
    poll(afterPrinting);

    poll({ ...afterPrinting, user: { ...afterPrinting.user, id: "dev-user-2" } });

    expect(screen.queryByText("New stamp")).toBeNull();
  });
});

describe("the dashboard marks what a poll changed", () => {
  it("marks the points, and not a piece, when a stamp fills", () => {
    const { poll } = renderScreen(DashboardScreen);
    expect(changed()).toEqual([]);

    poll(afterPrinting);

    expect(changed().map((element) => element.getAttribute("data-changed"))).toEqual(["points"]);
    const avatar = screen.getByRole("region", { name: "Your avatar" });
    expect(within(avatar).getByText("5")).toHaveAttribute("data-changed", "points");
  });

  it("marks the piece a new connection gave, and the point", () => {
    const { poll } = renderScreen(DashboardScreen);
    expect(changed()).toEqual([]);

    poll(withConnection);

    const avatar = screen.getByRole("region", { name: "Your avatar" });
    expect(within(avatar).getByText("3")).toHaveAttribute("data-changed", "points");
    const pieces = within(avatar).getByRole("list", { name: "Your outfit" });
    expect(within(pieces).getByText("Hat: wearing").closest("li")).toHaveAttribute(
      "data-changed",
      "piece",
    );
    expect(within(pieces).getByText("Monocle: not yet").closest("li")).not.toHaveAttribute(
      "data-changed",
    );
  });

  it("marks nothing for a fifth connection, though the points still rise", () => {
    state.me = withFourConnections;
    const { poll } = renderScreen(DashboardScreen);
    expect(changed()).toEqual([]);

    poll(afterFifthConnection);

    const avatar = screen.getByRole("region", { name: "Your avatar" });
    expect(avatar).toHaveTextContent("4 of 4 pieces · 7 points");
    expect(changed().map((element) => element.getAttribute("data-changed"))).toEqual(["points"]);
  });

  it("marks nothing on the first read, as after a login link", () => {
    state.me = withConnection;
    renderScreen(DashboardScreen);

    expect(changed()).toEqual([]);
    const avatar = screen.getByRole("region", { name: "Your avatar" });
    expect(avatar).toHaveTextContent("1 of 4 pieces · 3 points");
  });

  it("marks nothing on a poll that changed nothing", () => {
    const { poll } = renderScreen(DashboardScreen);
    poll(afterPrinting);

    poll(structuredClone(afterPrinting));

    expect(changed()).toEqual([]);
  });
});
