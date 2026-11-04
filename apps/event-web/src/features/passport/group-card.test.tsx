import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID, SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import { GroupCard } from "@/features/passport/group-card";
import { POLL_MY_GROUP_WAITING_MS } from "@/lib/constants";
import { createTestProviders } from "@/test/providers";

const JOIN_HINT = "Press Join when you're at the event, and you'll be put in a group.";
const WAITING = "You're waiting for a group.";

function renderCard() {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(SEEDED_PARTICIPANT_ID);
  const { Providers } = createTestProviders(api);
  render(
    <Providers>
      <GroupCard />
    </Providers>,
  );
  return { api, user: userEvent.setup() };
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
  it("offers Join to someone who hasn't joined, and joins nobody by itself", async () => {
    const { api } = renderCard();

    expect(await screen.findByText(JOIN_HINT)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join" })).toBeInTheDocument();
    expect(
      api.mock.data.groupMembers.some((member) => member.user_id === SEEDED_PARTICIPANT_ID),
    ).toBe(false);
  });

  it("shows that they're waiting once they press Join", async () => {
    const { user } = renderCard();

    await user.click(await screen.findByRole("button", { name: "Join" }));

    expect(await screen.findByText(WAITING)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Join" })).not.toBeInTheDocument();
  });

  it("keeps the Join button and says why when joining fails", async () => {
    const { api, user } = renderCard();
    const join = await screen.findByRole("button", { name: "Join" });

    api.mock.failNext("internal_error");
    await user.click(join);

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
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    api.mock.setSession(SEEDED_PARTICIPANT_ID);
    api.mock.failNext("internal_error");
    const { Providers } = createTestProviders(api);
    const user = userEvent.setup();
    render(
      <Providers>
        <GroupCard />
      </Providers>,
    );

    await user.click(await screen.findByRole("button", { name: "Try again" }));

    expect(await screen.findByText(JOIN_HINT)).toBeInTheDocument();
  });
});
