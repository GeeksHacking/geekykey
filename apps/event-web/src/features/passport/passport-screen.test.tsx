import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryKeys } from "@/api/keys";
import { createMockClient } from "@/api/mock/client";
import { SEEDED_GUEST_ID, SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import { PassportScreen } from "@/features/passport/passport-screen";
import { useSession } from "@/lib/session";
import { ThemeProvider } from "@/lib/theme-provider";
import { holdNextMe } from "@/test/hold-next-me";
import { createTestProviders } from "@/test/providers";

vi.mock("@/lib/firebase", () => ({ signOutOfFirebase: vi.fn() }));

/** The passport is only ever shown inside RequireSession, so the test waits for one too. */
function SignedIn() {
  const session = useSession();
  return session.status === "authenticated" ? <PassportScreen /> : <p>Loading</p>;
}

function renderPassport(userId: string) {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(userId);
  const { Providers, queryClient } = createTestProviders(api, { session: true });
  const view = render(
    <Providers>
      <ThemeProvider>
        <SignedIn />
      </ThemeProvider>
    </Providers>,
  );
  return { api, queryClient, user: userEvent.setup(), ...view };
}

const PROMPT = "What should we call you?";

beforeEach(() => {
  sessionStorage.clear();
});

describe("the name prompt (agreement 8.1, 8.7 and 13)", () => {
  it("asks a user with no name of their own what to call them", async () => {
    renderPassport(SEEDED_GUEST_ID);

    expect(await screen.findByRole("heading", { name: PROMPT })).toBeInTheDocument();
    // It doesn't block the passport.
    expect(screen.getByRole("list", { name: "Stamps" })).toBeInTheDocument();
  });

  it("doesn't ask a user who has a name", async () => {
    renderPassport(SEEDED_PARTICIPANT_ID);

    expect(await screen.findByRole("list", { name: "Stamps" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: PROMPT })).not.toBeInTheDocument();
  });

  it("saves the name, shows it, and stops asking", async () => {
    const { api, user } = renderPassport(SEEDED_GUEST_ID);
    await screen.findByRole("heading", { name: PROMPT });

    await user.type(screen.getByLabelText("Name"), "Mei Ling");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Mei Ling")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: PROMPT })).not.toBeInTheDocument();
    await expect(api.me()).resolves.toMatchObject({
      user: { display_name: "Mei Ling", has_name: true },
    });
  });

  it("keeps the new name when a /me asked for before the change lands after it", async () => {
    const { api, queryClient, user } = renderPassport(SEEDED_GUEST_ID);
    await screen.findByRole("heading", { name: PROMPT });

    // The 10-second poll goes out now, before the name change, and reads the guest as they
    // were.
    const poll = holdNextMe(api);
    const before = await poll.realMe();
    poll.holdTheNextOne();
    act(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me });
    });
    await poll.started;

    await user.type(screen.getByLabelText("Name"), "Mei Ling");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Mei Ling")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: PROMPT })).not.toBeInTheDocument();

    // The poll from before the change lands now. It says nothing about the session in
    // place, so it must not put the old name or the prompt back.
    await act(async () => {
      poll.answer(before);
      // Give the query's promise chain and any render it causes time to settle, so the
      // assertions see a late answer rather than one still in flight.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.queryByRole("heading", { name: PROMPT })).not.toBeInTheDocument();
    expect(screen.getByText("Mei Ling")).toBeInTheDocument();
  });

  it("hides the prompt on Skip, keeps Guest, and doesn't ask again in that visit", async () => {
    const { api, user, unmount } = renderPassport(SEEDED_GUEST_ID);
    await screen.findByRole("heading", { name: PROMPT });

    await user.click(screen.getByRole("button", { name: "Skip" }));

    expect(screen.queryByRole("heading", { name: PROMPT })).not.toBeInTheDocument();
    expect(screen.getByText("Guest")).toBeInTheDocument();
    await expect(api.me()).resolves.toMatchObject({
      user: { display_name: "Guest", has_name: false },
    });

    // Back to the passport later in the same visit, from another screen.
    unmount();
    renderPassport(SEEDED_GUEST_ID);
    expect(await screen.findByRole("list", { name: "Stamps" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: PROMPT })).not.toBeInTheDocument();
  });

  it.each([
    ["an empty name", ""],
    ["a name of only spaces", "   "],
    ["a 31-character name", "a".repeat(31)],
  ])("says the rule for %s and sends nothing", async (_, name) => {
    const { api, user } = renderPassport(SEEDED_GUEST_ID);
    await screen.findByRole("heading", { name: PROMPT });
    const setDisplayName = vi.spyOn(api, "setDisplayName");

    if (name) await user.type(screen.getByLabelText("Name"), name);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Use 1 to 30 characters.")).toBeInTheDocument();
    expect(setDisplayName).not.toHaveBeenCalled();
  });

  it("takes 30 emoji, which are 30 characters though 60 UTF-16 units", async () => {
    const { api, user } = renderPassport(SEEDED_GUEST_ID);
    await screen.findByRole("heading", { name: PROMPT });

    await user.type(screen.getByLabelText("Name"), "🦊".repeat(30));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("🦊".repeat(30))).toBeInTheDocument();
    await expect(api.me()).resolves.toMatchObject({ user: { has_name: true } });
  });

  it("says the rule when the service refuses the name", async () => {
    // The service has the last word, so its validation_failed gets the same sentence.
    const { api, user } = renderPassport(SEEDED_GUEST_ID);
    await screen.findByRole("heading", { name: PROMPT });

    await user.type(screen.getByLabelText("Name"), "Mei Ling");
    api.mock.failNext("validation_failed");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Use 1 to 30 characters.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: PROMPT })).toBeInTheDocument();
  });

  it("says what went wrong when the service can't be reached", async () => {
    const { api, user } = renderPassport(SEEDED_GUEST_ID);
    await screen.findByRole("heading", { name: PROMPT });

    await user.type(screen.getByLabelText("Name"), "Mei Ling");
    api.mock.failNext("network");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not reach the server. Check the Wi-Fi and try again.",
    );
  });
});

describe("changing the name later (agreement 8.7)", () => {
  it("lets a user who has a name change it from the passport", async () => {
    const { api, user } = renderPassport(SEEDED_PARTICIPANT_ID);
    await screen.findByText("Alex Tan");

    await user.click(screen.getByRole("button", { name: "Change name" }));
    const dialog = await screen.findByRole("dialog", { name: "Change name" });
    const field = within(dialog).getByLabelText("Name");
    expect(field).toHaveValue("Alex Tan");
    await user.clear(field);
    await user.type(field, "Alex");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Alex")).toBeInTheDocument();
    await expect(api.me()).resolves.toMatchObject({ user: { display_name: "Alex" } });
  });

  it("lets a guest who skipped set a name later", async () => {
    const { user } = renderPassport(SEEDED_GUEST_ID);
    await screen.findByRole("heading", { name: PROMPT });
    await user.click(screen.getByRole("button", { name: "Skip" }));

    await user.click(screen.getByRole("button", { name: "Change name" }));
    const dialog = await screen.findByRole("dialog", { name: "Change name" });
    await user.clear(within(dialog).getByLabelText("Name"));
    await user.type(within(dialog).getByLabelText("Name"), "Mei Ling");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Mei Ling")).toBeInTheDocument();
  });
});
