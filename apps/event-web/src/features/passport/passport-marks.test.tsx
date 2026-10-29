import { act, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockClient } from "@/api/mock/client";
import type { MeResponse, Stamp } from "@/api/types";
import { DashboardScreen } from "@/features/passport/dashboard-screen";
import { PassportScreen } from "@/features/passport/passport-screen";
import { createTestProviders } from "@/test/providers";

/*
  jsdom is a phone here: its matchMedia matches nothing, so the screens never load GSAP and
  each change is marked for its CSS transition instead. A rerender with a new /me is a poll.
*/

const state = vi.hoisted(() => ({ me: null as MeResponse | null }));

vi.mock("@/lib/session", () => ({
  useMe: () => ({ me: state.me, refresh: async () => {} }),
}));

vi.mock("@/components/layout/section-heading", () => ({
  SectionHeading: ({ title }: { title: string }) => <h2>{title}</h2>,
}));

const printing: Stamp = {
  station_id: "printing",
  name: "3D Printing Booth",
  location: "Hall A",
  points: 3,
  earned_at: null,
};
const lounge: Stamp = {
  station_id: "lounge",
  name: "Hardware Lounge",
  location: null,
  points: 2,
  earned_at: "2026-11-17T02:14:09.000Z",
};

const before: MeResponse = {
  user: { id: "dev-user-1", display_name: "Alex Tan", role: "participant", has_name: true },
  points: 2,
  stamps: [printing, lounge],
  recent_taps: [],
};

const afterPrinting: MeResponse = {
  ...before,
  points: 5,
  stamps: [{ ...printing, earned_at: "2026-11-17T02:31:47.000Z" }, lounge],
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

describe("the dashboard marks what a poll changed", () => {
  it("marks the points and the slot that filled", () => {
    const { poll } = renderScreen(DashboardScreen);
    expect(changed()).toEqual([]);

    poll(afterPrinting);

    const summary = screen.getByRole("region", { name: "Points and stamps" });
    expect(within(summary).getByText("5")).toHaveAttribute("data-changed", "points");
    const slots = within(summary).getByRole("list", { name: "Stamp slots" });
    expect(
      within(slots)
        .getByText(/3D Printing Booth/)
        .closest("li"),
    ).toHaveAttribute("data-changed", "slot");
    expect(
      within(slots)
        .getByText(/Hardware Lounge/)
        .closest("li"),
    ).not.toHaveAttribute("data-changed");
  });

  it("marks nothing on a poll that changed nothing", () => {
    const { poll } = renderScreen(DashboardScreen);
    poll(afterPrinting);

    poll(structuredClone(afterPrinting));

    expect(changed()).toEqual([]);
  });
});
