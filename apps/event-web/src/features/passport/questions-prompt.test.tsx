import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryKeys } from "@/api/keys";
import { createMockClient } from "@/api/mock/client";
import { SEEDED_GUEST_ID, SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import type { UpdateMeRequest, UpdateMeResponse } from "@/api/types";
import { PassportScreen } from "@/features/passport/passport-screen";
import { useSession } from "@/lib/session";
import { ThemeProvider } from "@/lib/theme-provider";
import { createTestProviders } from "@/test/providers";

vi.mock("@/lib/firebase", () => ({ signOutOfFirebase: vi.fn() }));

const SENTENCE = "Answer all 5 to get your match when you connect.";
const EDITABLE = "You can change these until your first connection.";
const READ_ONLY = "You've connected, so your answers are set.";
const connection = {
  connected_at: "2026-11-12T08:12:30.000Z",
  kind: "B",
  match: 60,
  shared: null,
  shared_at: "2026-11-12T08:14:30.000Z",
};

function SignedIn() {
  const session = useSession();
  return session.status === "authenticated" ? <PassportScreen /> : <p>Loading</p>;
}

function renderPassport(
  userId: string = SEEDED_GUEST_ID,
  setup?: (api: ReturnType<typeof createMockClient>) => void,
) {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(userId);
  setup?.(api);
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

async function answerAll(user: ReturnType<typeof userEvent.setup>) {
  for (const choice of ["Tea", "Night owl", "Friends", "Fly", "Out with friends"]) {
    await user.click(await screen.findByRole("button", { name: choice }));
  }
  await screen.findByText(EDITABLE);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  sessionStorage.clear();
});

describe("the answers game's questions (agreement 0.13, section 13)", () => {
  it("asks them after the name prompt, with the count sentence", async () => {
    renderPassport(SEEDED_GUEST_ID);

    const name = await screen.findByRole("heading", { name: "What should we call you?" });
    const answers = await screen.findByRole("heading", { name: "Your answers" });

    // The name prompt comes first in the document, even though neither blocks the other.
    expect(name.compareDocumentPosition(answers) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(SENTENCE)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tea or coffee?" })).toBeInTheDocument();
    expect(screen.getByText("Question 1 of 5")).toBeInTheDocument();
  });

  it("sends one answer and moves to the next question", async () => {
    const { api, user } = renderPassport();
    await screen.findByRole("heading", { name: "Tea or coffee?" });
    const updateMe = vi.spyOn(api, "updateMe");

    await user.click(screen.getByRole("button", { name: "Tea" }));

    expect(updateMe).toHaveBeenCalledWith({ answers: { drink: "tea" } });
    expect(
      await screen.findByRole("heading", { name: "Night owl or early bird?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Question 2 of 5")).toBeInTheDocument();
  });

  it("answers all five, one tap each, then lists them with a Change on each", async () => {
    const { api, user } = renderPassport();
    await answerAll(user);

    expect(screen.getAllByRole("button", { name: /^Change answer to/ })).toHaveLength(5);
    expect(screen.queryByRole("heading", { name: "Tea or coffee?" })).not.toBeInTheDocument();
    await expect(api.me()).resolves.toMatchObject({
      user: {
        answers: {
          drink: "tea",
          hours: "night_owl",
          school: "friends",
          superpower: "fly",
          weekend: "friends",
        },
      },
    });
  });

  it("changes one answer from the list and marks the choice already given", async () => {
    const { api, user } = renderPassport();
    await answerAll(user);
    const updateMe = vi.spyOn(api, "updateMe");

    await user.click(screen.getByRole("button", { name: 'Change answer to "Tea or coffee?"' }));

    expect(await screen.findByRole("button", { name: "Tea" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Coffee" })).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: "Coffee" }));

    expect(updateMe).toHaveBeenCalledWith({ answers: { drink: "coffee" } });
    expect(await screen.findByText(EDITABLE)).toBeInTheDocument();
    expect(screen.getByText("Coffee")).toBeInTheDocument();
  });

  it("changes an answer before all five are answered", async () => {
    const { user } = renderPassport();
    await screen.findByRole("heading", { name: "Tea or coffee?" });
    await user.click(screen.getByRole("button", { name: "Tea" }));
    await screen.findByRole("heading", { name: "Night owl or early bird?" });
    expect(screen.getByText(EDITABLE)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: 'Change answer to "Tea or coffee?"' }));
    await user.click(await screen.findByRole("button", { name: "Coffee" }));

    expect(
      await screen.findByRole("heading", { name: "Night owl or early bird?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Coffee")).toBeInTheDocument();
    expect(screen.getByText(SENTENCE)).toBeInTheDocument();
  });

  it("leaves the answer as it was when a change is cancelled", async () => {
    const { api, user } = renderPassport();
    await answerAll(user);
    const updateMe = vi.spyOn(api, "updateMe");

    await user.click(screen.getByRole("button", { name: 'Change answer to "Tea or coffee?"' }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(updateMe).not.toHaveBeenCalled();
    expect(screen.getByText(EDITABLE)).toBeInTheDocument();
    expect(screen.getByText("Tea")).toBeInTheDocument();
  });

  it("does not carry an error from another question into a change", async () => {
    const { api, user } = renderPassport();
    await screen.findByRole("heading", { name: "Tea or coffee?" });
    await user.click(screen.getByRole("button", { name: "Tea" }));
    await screen.findByRole("heading", { name: "Night owl or early bird?" });
    api.mock.failNext("network");
    await user.click(screen.getByRole("button", { name: "Night owl" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server");

    await user.click(screen.getByRole("button", { name: 'Change answer to "Tea or coffee?"' }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Tea" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("disables Change while an answer is being sent", async () => {
    const { api, user } = renderPassport();
    await screen.findByRole("heading", { name: "Tea or coffee?" });
    await user.click(screen.getByRole("button", { name: "Tea" }));
    await screen.findByRole("heading", { name: "Night owl or early bird?" });

    const held = deferred<UpdateMeResponse>();
    vi.spyOn(api, "updateMe").mockReturnValue(held.promise);
    await user.click(screen.getByRole("button", { name: "Night owl" }));

    expect(
      screen.getByRole("button", { name: 'Change answer to "Tea or coffee?"' }),
    ).toBeDisabled();

    await act(async () => {
      held.resolve({
        user: {
          id: SEEDED_GUEST_ID,
          display_name: "Guest",
          role: "participant",
          has_name: false,
          answers: { drink: "tea", hours: "night_owl" },
        },
      });
    });
    expect(
      await screen.findByRole("heading", { name: "Best part of school?" }),
    ).toBeInTheDocument();
  });

  it("shows the answers read-only after a connection reaches a poll", async () => {
    const { api, queryClient, user } = renderPassport();
    await answerAll(user);
    const participant = api.mock.data.users.find((user) => user.id === SEEDED_GUEST_ID);
    if (!participant) throw new Error("The seeded guest is missing");
    participant.connections = [connection];

    act(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me });
    });

    expect(await screen.findByText(READ_ONLY)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Change answer to/ })).not.toBeInTheDocument();
    expect(screen.getByText("Tea")).toBeInTheDocument();
  });

  it("turns read-only and refreshes /me when a change is refused with answers_fixed", async () => {
    const { api, user } = renderPassport();
    await answerAll(user);
    const participant = api.mock.data.users.find((user) => user.id === SEEDED_GUEST_ID);
    if (!participant) throw new Error("The seeded guest is missing");
    participant.connections = [connection];
    const me = vi.spyOn(api, "me");

    await user.click(screen.getByRole("button", { name: 'Change answer to "Tea or coffee?"' }));
    await user.click(screen.getByRole("button", { name: "Coffee" }));

    expect(await screen.findByText(READ_ONLY)).toBeInTheDocument();
    // The connection that refused the change is now in /me, so a remount stays read-only.
    await waitFor(() => expect(me).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /^Change answer to/ })).not.toBeInTheDocument();
    // The refused change saved nothing, so the answer stays as it was.
    expect(screen.getByText("Tea")).toBeInTheDocument();
  });

  it("keeps an answer when a slower name change lands after it", async () => {
    const { api, user } = renderPassport(SEEDED_GUEST_ID);
    await screen.findByRole("heading", { name: "What should we call you?" });
    await screen.findByRole("heading", { name: "Tea or coffee?" });

    const name = deferred<UpdateMeResponse>();
    const answer = deferred<UpdateMeResponse>();
    vi.spyOn(api, "updateMe").mockImplementation((input: UpdateMeRequest) =>
      input.display_name !== undefined ? name.promise : answer.promise,
    );

    await user.type(screen.getByLabelText("Name"), "Mei Ling");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: "Tea" }));

    await act(async () => {
      answer.resolve({
        user: {
          id: SEEDED_GUEST_ID,
          display_name: "Guest",
          role: "participant",
          has_name: false,
          answers: { drink: "tea" },
        },
      });
    });
    expect(
      await screen.findByRole("heading", { name: "Night owl or early bird?" }),
    ).toBeInTheDocument();

    await act(async () => {
      name.resolve({
        user: {
          id: SEEDED_GUEST_ID,
          display_name: "Mei Ling",
          role: "participant",
          has_name: true,
          answers: {},
        },
      });
    });

    expect(await screen.findByText("Mei Ling")).toBeInTheDocument();
    // The slower name answer did not put the first question, or its empty answers, back.
    expect(screen.getByRole("heading", { name: "Night owl or early bird?" })).toBeInTheDocument();
  });

  it("shows the questions read-only when the user has already connected", async () => {
    renderPassport(SEEDED_GUEST_ID, (api) => {
      const participant = api.mock.data.users.find((user) => user.id === SEEDED_GUEST_ID);
      if (!participant) throw new Error("The seeded guest is missing");
      participant.connections = [connection];
    });

    expect(await screen.findByText(READ_ONLY)).toBeInTheDocument();
    expect(screen.getAllByText("Not answered")).toHaveLength(5);
    expect(screen.queryByText(SENTENCE)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Change answer to/ })).not.toBeInTheDocument();
  });

  it("skips a question and asks the next one, keeping the sentence", async () => {
    const { user } = renderPassport();
    await screen.findByRole("heading", { name: "Tea or coffee?" });

    await user.click(screen.getByRole("button", { name: "Skip this question" }));

    expect(
      await screen.findByRole("heading", { name: "Night owl or early bird?" }),
    ).toBeInTheDocument();
    expect(screen.getByText(SENTENCE)).toBeInTheDocument();
  });

  it("collapses when every question is skipped, and Answer the rest brings them back", async () => {
    const { user } = renderPassport();
    await screen.findByRole("heading", { name: "Tea or coffee?" });

    for (let skipped = 0; skipped < 5; skipped += 1) {
      await user.click(await screen.findByRole("button", { name: "Skip this question" }));
    }

    expect(await screen.findByText("0 of 5 answered.")).toBeInTheDocument();
    expect(screen.getByText(SENTENCE)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Answer the rest" }));

    expect(await screen.findByRole("heading", { name: "Tea or coffee?" })).toBeInTheDocument();
  });

  it("asks nothing without an answers game", async () => {
    renderPassport(SEEDED_PARTICIPANT_ID, (api) => {
      api.mock.data.questions = null;
    });

    await screen.findByRole("list", { name: "Stamps" });

    expect(screen.queryByRole("heading", { name: "Your answers" })).not.toBeInTheDocument();
  });

  it("keeps the question and says what happened when the service can't be reached", async () => {
    const { api, user } = renderPassport();
    await screen.findByRole("heading", { name: "Tea or coffee?" });
    api.mock.failNext("network");

    await user.click(screen.getByRole("button", { name: "Tea" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not reach the server. Check the Wi-Fi and try again.",
    );
    expect(screen.getByRole("heading", { name: "Tea or coffee?" })).toBeInTheDocument();
    await expect(api.me()).resolves.toMatchObject({ user: { answers: {} } });
  });
});
