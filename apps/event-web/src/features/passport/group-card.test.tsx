import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/errors";
import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID, SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import { GroupCard } from "@/features/passport/group-card";
import { POLL_MY_GROUP_WAITING_MS } from "@/lib/constants";
import { useSession } from "@/lib/session";
import { createTestProviders } from "@/test/providers";

const JOIN_HINT = "Press Join when you're at the event, and you'll be put in a group.";
const WAITING = "You're waiting for a group.";

/** As RequireSession does in the app, so the card's first read is signed in. */
function SignedIn({ children }: { children: ReactNode }) {
  const { status } = useSession();
  return status === "authenticated" ? <>{children}</> : null;
}

function renderCard({
  onArrival = false,
  prepare,
}: {
  onArrival?: boolean;
  prepare?: (api: MockApiClient) => void;
} = {}) {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  if (!onArrival) api.mock.setSession(SEEDED_PARTICIPANT_ID);
  prepare?.(api);
  const { Providers } = onArrival
    ? createTestProviders(api, { session: true, loginLink: "mock" })
    : createTestProviders(api, { session: true });
  render(
    <Providers>
      <SignedIn>
        <GroupCard />
      </SignedIn>
    </Providers>,
  );
  return { api, user: userEvent.setup() };
}

/** Counts the join calls while still joining for real. */
function countJoins(api: MockApiClient) {
  const join = { calls: 0 };
  const real = api.joinGroups.bind(api);
  vi.spyOn(api, "joinGroups").mockImplementation(() => {
    join.calls += 1;
    return real();
  });
  return join;
}

/** As an organizer pressing Allocate from elsewhere, then back to the participant. */
async function allocateElsewhere(api: MockApiClient) {
  api.mock.setSession(SEEDED_ORGANIZER_ID);
  await api.allocateGroups();
  api.mock.setSession(SEEDED_PARTICIPANT_ID);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("GroupCard", () => {
  it("offers Join on an ordinary visit, and joins nobody", async () => {
    let join: ReturnType<typeof countJoins> | undefined;
    const { api } = renderCard({
      prepare: (client) => {
        join = countJoins(client);
      },
    });

    expect(await screen.findByText(JOIN_HINT)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join" })).toBeInTheDocument();
    expect(join?.calls).toBe(0);
    expect(
      api.mock.data.groupMembers.some((member) => member.user_id === SEEDED_PARTICIPANT_ID),
    ).toBe(false);
  });

  it("joins once when the page arrived through a login link", async () => {
    let join: ReturnType<typeof countJoins> | undefined;
    renderCard({
      onArrival: true,
      prepare: (client) => {
        join = countJoins(client);
      },
    });

    expect(await screen.findByText(WAITING)).toBeInTheDocument();
    expect(join?.calls).toBe(1);
  });

  it("spends the arrival without posting when the participant already joined", async () => {
    let join: ReturnType<typeof countJoins> | undefined;
    renderCard({
      onArrival: true,
      prepare: (client) => {
        client.mock.data.groupMembers.push({
          user_id: SEEDED_PARTICIPANT_ID,
          group_id: null,
          joined_at: new Date().toISOString(),
          placed_at: null,
          how: null,
        });
        join = countJoins(client);
      },
    });

    expect(await screen.findByText(WAITING)).toBeInTheDocument();
    expect(join?.calls).toBe(0);
  });

  it("offers the Join button when the join on arrival fails", async () => {
    renderCard({
      onArrival: true,
      prepare: (client) => {
        vi.spyOn(client, "joinGroups").mockRejectedValueOnce(new ApiError(500, "internal_error"));
      },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong on the server. Try again in a moment.",
    );
    expect(screen.getByRole("button", { name: "Join" })).toBeInTheDocument();
  });

  it("shows that they're waiting once they press Join", async () => {
    const { user } = renderCard();

    await user.click(await screen.findByRole("button", { name: "Join" }));

    expect(await screen.findByText(WAITING)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Join" })).not.toBeInTheDocument();
  });

  it("keeps the Join button and says why when joining fails", async () => {
    const { api, user } = renderCard();
    const joinButton = await screen.findByRole("button", { name: "Join" });

    vi.spyOn(api, "joinGroups").mockRejectedValueOnce(new ApiError(500, "internal_error"));
    await user.click(joinButton);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong on the server. Try again in a moment.",
    );
    expect(screen.getByRole("button", { name: "Join" })).toBeInTheDocument();
  });

  it("shows the group and its members' names without reloading after Allocate", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { api } = renderCard();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(await screen.findByRole("button", { name: "Join" }));
    await screen.findByText(WAITING);

    await allocateElsewhere(api);
    await act(() => vi.advanceTimersByTimeAsync(POLL_MY_GROUP_WAITING_MS));

    const mine = await api.myGroup();
    if (!mine.group) throw new Error("Allocate placed nobody");
    expect(await screen.findByRole("heading", { name: mine.group.name })).toBeInTheDocument();
    expect(screen.getByText("Your group")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Members" })).toHaveTextContent("Alex Tan");
    expect(mine.group.members.length).toBeGreaterThan(1);
    for (const { display_name } of mine.group.members) {
      expect(screen.getByText(display_name)).toBeInTheDocument();
    }
    expect(screen.queryByText(WAITING)).not.toBeInTheDocument();
  });

  it("offers a retry when the first read fails", async () => {
    const { user } = renderCard({
      prepare: (client) => {
        vi.spyOn(client, "myGroup").mockRejectedValueOnce(new ApiError(500, "internal_error"));
      },
    });

    await user.click(await screen.findByRole("button", { name: "Try again" }));

    expect(await screen.findByText(JOIN_HINT)).toBeInTheDocument();
  });
});
