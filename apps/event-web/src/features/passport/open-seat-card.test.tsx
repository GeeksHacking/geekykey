import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import type { Connection, ConnectionRequest, OpenSeat } from "@/api/types";
import { OpenSeatCard } from "@/features/passport/open-seat-card";
import { createTestProviders } from "@/test/providers";

const OPEN: OpenSeat = {
  status: "open",
  role: "sitter",
  station_id: "st_seat",
  booth: "A3",
  opened_at: "2026-11-17T08:00:00.000Z",
  closes_at: "2026-11-17T08:01:00.000Z",
  taken_at: null,
  other_display_name: null,
  prompt: null,
};

const TAKEN: OpenSeat = {
  ...OPEN,
  status: "taken",
  taken_at: "2026-11-17T08:00:12.000Z",
  other_display_name: "Mei Lin Koh",
  prompt: "What are you building?",
};

function request(fields: Partial<ConnectionRequest> = {}): ConnectionRequest {
  return {
    id: "cr_seat",
    display_name: "Mei Lin Koh",
    bio: "Sensors and sourdough",
    avatar: null,
    requested_at: "2026-11-17T08:00:12.000Z",
    ...fields,
  };
}

function connection(fields: Partial<Connection> = {}): Connection {
  return {
    connected_at: "2026-11-17T07:55:00.000Z",
    display_name: "Mei Lin Koh",
    bio: null,
    contact_line: null,
    kind: "B",
    match: 50,
    shared: null,
    shared_at: "2026-11-17T07:57:00.000Z",
    ...fields,
  };
}

function renderCard({
  api = createMockClient({ latencyMs: [0, 0], storage: null }),
  seat = OPEN,
  request: waiting,
  connections = [],
}: {
  api?: MockApiClient;
  seat?: OpenSeat;
  request?: ConnectionRequest;
  connections?: Connection[];
} = {}) {
  api.mock.setSession(SEEDED_PARTICIPANT_ID);
  const { Providers } = createTestProviders(api);
  render(
    <Providers>
      <OpenSeatCard
        seat={seat}
        userId={SEEDED_PARTICIPANT_ID}
        request={waiting}
        connections={connections}
      />
    </Providers>,
  );
  return { api, user: userEvent.setup() };
}

/** The request the mock's participant is waiting for, for the Accept tests. */
function seededRequest(api: MockApiClient): ConnectionRequest {
  const participant = api.mock.data.users.find((user) => user.id === SEEDED_PARTICIPANT_ID);
  const waiting = participant?.connection_requests?.[0];
  if (!waiting) throw new Error("The fixtures have no request");
  return waiting;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the open seat card (FRO-179)", () => {
  it("shows the sitter's seat, its booth and the countdown", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-17T08:00:00.000Z"));
    renderCard();

    const card = screen.getByRole("region", { name: "Open seat" });
    expect(within(card).getByText("Your seat is open at booth A3.")).toBeInTheDocument();
    expect(within(card).getByText("Closes in 60s.")).toBeInTheDocument();
    expect(within(card).getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  it("says the seat is open without a booth", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-17T08:00:00.000Z"));
    renderCard({ seat: { ...OPEN, booth: null } });

    expect(screen.getByText("Your seat is open.")).toBeInTheDocument();
  });

  it("closes the seat at its closing time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-17T08:00:00.000Z"));
    renderCard({ seat: { ...OPEN, closes_at: "2026-11-17T08:00:05.000Z" } });

    expect(screen.getByText("Closes in 5s.")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByText("Your seat closed with no one taking it.")).toBeInTheDocument();
  });

  it("remembers the closed seat's Dismiss for that seat only", async () => {
    const { user } = renderCard({ seat: { ...OPEN, status: "closed" } });
    const card = screen.getByRole("region", { name: "Open seat" });

    expect(within(card).getByText("Your seat closed with no one taking it.")).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByRole("region", { name: "Open seat" })).not.toBeInTheDocument();
    expect(
      localStorage.getItem(`gk-open-seat-dismissed:${SEEDED_PARTICIPANT_ID}:${OPEN.opened_at}`),
    ).toBe("1");
  });

  it("shows the taker whose seat it was, the prompt, and a Dismiss", async () => {
    const { user } = renderCard({ seat: { ...TAKEN, role: "taker" } });
    const card = screen.getByRole("region", { name: "Open seat" });

    expect(within(card).getByText("You took Mei Lin Koh's seat.")).toBeInTheDocument();
    expect(within(card).getByText("Ask each other: What are you building?")).toBeInTheDocument();
    expect(within(card).getByText("They can accept on their phone.")).toBeInTheDocument();

    await user.click(within(card).getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("region", { name: "Open seat" })).not.toBeInTheDocument();
  });

  it("hides the taker's card once the two are connected", () => {
    renderCard({ seat: { ...TAKEN, role: "taker" }, connections: [connection()] });

    expect(screen.queryByRole("region", { name: "Open seat" })).not.toBeInTheDocument();
  });

  it("shows the sitter who took the seat, the prompt and the request", () => {
    renderCard({ seat: TAKEN, request: request() });
    const card = screen.getByRole("region", { name: "Open seat" });

    expect(within(card).getByText("Mei Lin Koh took your seat.")).toBeInTheDocument();
    expect(within(card).getByText("Ask each other: What are you building?")).toBeInTheDocument();
    expect(within(card).getByText("Mei Lin Koh wants to connect.")).toBeInTheDocument();
    expect(within(card).getByText("Sensors and sourdough")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Decline" })).toBeInTheDocument();
  });

  it("hides the sitter's card when the request is gone and nothing was refused", () => {
    renderCard({ seat: TAKEN });

    expect(screen.queryByRole("region", { name: "Open seat" })).not.toBeInTheDocument();
  });

  it("accepts the request from the card", async () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    const waiting = seededRequest(api);
    const spy = vi.spyOn(api, "acceptConnectionRequest");
    const { user } = renderCard({ api, seat: TAKEN, request: waiting });
    const card = screen.getByRole("region", { name: "Open seat" });

    await user.click(within(card).getByRole("button", { name: "Accept" }));

    await waitFor(() => expect(spy).toHaveBeenCalledWith(waiting.id));
  });

  it("shows the service's refusal and keeps the request", async () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    const waiting = seededRequest(api);
    vi.spyOn(api, "acceptConnectionRequest").mockResolvedValueOnce({ status: "same_group" });
    const { user } = renderCard({ api, seat: TAKEN, request: waiting });
    const card = screen.getByRole("region", { name: "Open seat" });

    await user.click(within(card).getByRole("button", { name: "Accept" }));

    expect(
      await within(card).findByText("You're in the same group. Find someone from another group."),
    ).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Accept" })).toBeInTheDocument();

    await user.click(within(card).getByRole("button", { name: "Dismiss" }));
    expect(
      within(card).queryByText("You're in the same group. Find someone from another group."),
    ).not.toBeInTheDocument();
  });
});
