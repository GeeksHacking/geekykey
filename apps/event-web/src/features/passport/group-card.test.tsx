import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/errors";
import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { SEEDED_GUEST_ID, SEEDED_ORGANIZER_ID, SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import { GroupCard } from "@/features/passport/group-card";
import { POLL_MY_GROUP_PLACED_MS, POLL_MY_GROUP_WAITING_MS } from "@/lib/constants";
import { useSession } from "@/lib/session";
import { createTestProviders } from "@/test/providers";

const JOIN_HINT = "Press Join when you're at the event, and you'll be put in a group.";
const WAITING = "You're waiting for a group.";
const PROMPT = "What should we call you?";
const NOTHING_TO_DO = "It will show here. You don't need to do anything else.";
const ASK_AN_ORGANIZER = "There's no group to put you in yet. Ask an organizer.";

/** As RequireSession does in the app, so the card's first read is signed in. */
function SignedIn({ children }: { children: ReactNode }) {
  const { status } = useSession();
  return status === "authenticated" ? <>{children}</> : null;
}

function renderCard({
  onArrival = false,
  loginLink = "mock",
  userId = SEEDED_PARTICIPANT_ID,
  prepare,
}: {
  onArrival?: boolean;
  loginLink?: "mock" | "guest";
  userId?: string;
  prepare?: (api: MockApiClient) => void;
} = {}) {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  if (!onArrival) api.mock.setSession(userId);
  prepare?.(api);
  const { Providers } = onArrival
    ? createTestProviders(api, { session: true, loginLink })
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

/** Puts each user in one group, as Allocate or an organizer's move would. */
function placeInOneGroup(api: MockApiClient, userIds: string[]) {
  const group = api.mock.data.groups[0];
  if (!group) throw new Error("The fixture has no groups");
  const placedAt = new Date().toISOString();
  api.mock.data.groupAllocationStartedAt = placedAt;
  for (const userId of userIds) {
    const member = api.mock.data.groupMembers.find((candidate) => candidate.user_id === userId);
    if (member) {
      member.group_id = group.id;
      member.placed_at = placedAt;
      member.how = "organizer";
    } else {
      api.mock.data.groupMembers.push({
        user_id: userId,
        group_id: group.id,
        joined_at: placedAt,
        placed_at: placedAt,
        how: "organizer",
      });
    }
  }
  return group;
}

beforeEach(() => {
  sessionStorage.clear();
});

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

  it("keeps its loading card while the join on arrival is sent", async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let joins = 0;
    renderCard({
      onArrival: true,
      prepare: (client) => {
        const real = client.joinGroups.bind(client);
        vi.spyOn(client, "joinGroups").mockImplementationOnce(async () => {
          joins += 1;
          await held;
          return real();
        });
      },
    });

    await waitFor(() => expect(joins).toBe(1));
    expect(screen.getByRole("status", { name: "Loading your group" })).toBeInTheDocument();
    expect(screen.queryByText(JOIN_HINT)).not.toBeInTheDocument();

    await act(async () => {
      release();
    });
    expect(await screen.findByText(WAITING)).toBeInTheDocument();
  });

  it("shows that they're waiting once they press Join", async () => {
    const { user } = renderCard();

    await user.click(await screen.findByRole("button", { name: "Join" }));

    expect(await screen.findByText(WAITING)).toBeInTheDocument();
    expect(screen.getByText(NOTHING_TO_DO)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Join" })).not.toBeInTheDocument();
  });

  it("keeps the Join button and says why when joining fails", async () => {
    const { api, user } = renderCard();
    const joinButton = await screen.findByRole("button", { name: "Join" });

    api.mock.failNext("internal_error");
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

  it("shows another member's new name at the next poll", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { api } = renderCard({
      prepare: (client) => {
        placeInOneGroup(client, [SEEDED_PARTICIPANT_ID, "u_7f3a"]);
      },
    });

    expect(await screen.findByText("Wei Lin Chong")).toBeInTheDocument();

    // Another member sets their name from their own phone, before this card's next read.
    api.mock.setSession("u_7f3a");
    await api.updateMe({ display_name: "Wei Lin" });
    api.mock.setSession(SEEDED_PARTICIPANT_ID);

    await act(() => vi.advanceTimersByTimeAsync(POLL_MY_GROUP_PLACED_MS));

    expect(await screen.findByText("Wei Lin")).toBeInTheDocument();
    expect(screen.queryByText("Wei Lin Chong")).not.toBeInTheDocument();
  });

  it("shows the group at once to a latecomer who joins after Allocate", async () => {
    const { api, user } = renderCard();
    const join = await screen.findByRole("button", { name: "Join" });
    await allocateElsewhere(api);

    await user.click(join);

    const mine = await api.myGroup();
    if (!mine.group) throw new Error("The latecomer wasn't placed");
    expect(await screen.findByRole("heading", { name: mine.group.name })).toBeInTheDocument();
    expect(screen.queryByText(WAITING)).not.toBeInTheDocument();
  });

  it("tells a latecomer to ask an organizer when there's no group to put them in", async () => {
    const { api, user } = renderCard();
    const join = await screen.findByRole("button", { name: "Join" });
    await allocateElsewhere(api);
    api.mock.data.groups = [];

    await user.click(join);

    expect(await screen.findByText(WAITING)).toBeInTheDocument();
    expect(screen.getByText(ASK_AN_ORGANIZER)).toBeInTheDocument();
    expect(screen.queryByText(NOTHING_TO_DO)).not.toBeInTheDocument();
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

describe("GroupCard's name prompt (agreement 8.1, 8.7 and 13)", () => {
  it("asks a guest above the group card, and the Join button is still there", async () => {
    renderCard({ userId: SEEDED_GUEST_ID });

    expect(await screen.findByRole("heading", { name: PROMPT })).toBeInTheDocument();
    expect(await screen.findByText(JOIN_HINT)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join" })).toBeInTheDocument();
  });

  it("doesn't ask a participant who has a name", async () => {
    renderCard();

    expect(await screen.findByText(JOIN_HINT)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: PROMPT })).not.toBeInTheDocument();
  });

  it("saves the name, stops asking, and sends it", async () => {
    const { api, user } = renderCard({ userId: SEEDED_GUEST_ID });
    await screen.findByRole("heading", { name: PROMPT });

    await user.type(screen.getByLabelText("Name"), "Mei Ling");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: PROMPT })).not.toBeInTheDocument(),
    );
    await expect(api.me()).resolves.toMatchObject({
      user: { display_name: "Mei Ling", has_name: true },
    });
  });

  it("shows the participant's own new name in the group at once", async () => {
    const { user } = renderCard({
      userId: SEEDED_GUEST_ID,
      prepare: (client) => {
        placeInOneGroup(client, [SEEDED_GUEST_ID, "u_7f3a"]);
      },
    });
    await screen.findByRole("heading", { name: PROMPT });
    const members = await screen.findByRole("list", { name: "Members" });
    expect(within(members).getByText("Guest")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Name"), "Mei Ling");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(
        within(screen.getByRole("list", { name: "Members" })).getByText("Mei Ling"),
      ).toBeInTheDocument(),
    );
    expect(
      within(screen.getByRole("list", { name: "Members" })).queryByText("Guest"),
    ).not.toBeInTheDocument();
  });

  it("keeps the Join button after Skip, and joining still works", async () => {
    const { user } = renderCard({ userId: SEEDED_GUEST_ID });
    await screen.findByRole("heading", { name: PROMPT });

    await user.click(screen.getByRole("button", { name: "Skip" }));

    expect(screen.queryByRole("heading", { name: PROMPT })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Join" }));
    expect(await screen.findByText(WAITING)).toBeInTheDocument();
  });

  it("asks a guest who arrives through a login link, and still joins them once", async () => {
    let join: ReturnType<typeof countJoins> | undefined;
    renderCard({
      onArrival: true,
      loginLink: "guest",
      prepare: (client) => {
        join = countJoins(client);
      },
    });

    expect(await screen.findByRole("heading", { name: PROMPT })).toBeInTheDocument();
    expect(await screen.findByText(WAITING)).toBeInTheDocument();
    expect(join?.calls).toBe(1);
  });
});
