import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { ApiError } from "@/api/errors";
import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { SEEDED_GUEST_ID, SEEDED_ORGANIZER_ID } from "@/api/mock/fixtures";
import { ParticipantFrame } from "@/features/auth/participant-frame";
import { RequireSession } from "@/features/auth/require-session";
import { DashboardScreen } from "@/features/passport/dashboard-screen";
import { ThemeProvider } from "@/lib/theme-provider";
import { createTestProviders } from "@/test/providers";

vi.mock("@/lib/firebase", () => ({ signOutOfFirebase: vi.fn() }));

function guestOf(api: MockApiClient) {
  const guest = api.mock.data.users.find(({ id }) => id === SEEDED_GUEST_ID);
  if (!guest) throw new Error("The fixtures have no guest");
  return guest;
}

/** A bio, so the bio step is not in the way of the test's own subject. */
function withBio(api: MockApiClient) {
  guestOf(api).bio = "Building a robot arm";
}

/** A guest with a name and every answer, so the bio step is the next one. */
function finishSetup(api: MockApiClient) {
  const guest = guestOf(api);
  guest.has_name = true;
  guest.display_name = "Mei Lin";
  guest.answers = Object.fromEntries(
    api.mock.data.questions!.map((question) => [question.id, question.choices[0]!.id]),
  );
}

const FIRST_CHOICES = [
  "Coming up with ideas",
  "Try it myself",
  "Make a plan first",
  "Break the problem into smaller parts",
  "Something that makes everyday life easier",
];

/** Names the guest and answers every question, so the bio step is next. */
async function finishNameAndAnswers(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByRole("textbox", { name: "Name" }), "Mei Lin");
  await user.click(screen.getByRole("button", { name: "Save" }));
  for (const choice of FIRST_CHOICES) {
    await user.click(await screen.findByRole("button", { name: choice }));
  }
}

function renderEvent(
  organizer = false,
  noQuestions = false,
  setup?: (api: MockApiClient) => void,
  dashboard = false,
) {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(organizer ? SEEDED_ORGANIZER_ID : SEEDED_GUEST_ID);
  if (noQuestions) api.mock.data.questions = null;
  setup?.(api);
  const { Providers } = createTestProviders(api, { session: true });
  const root = createRootRoute({
    component: () => (
      <RequireSession>
        <ParticipantFrame>
          {dashboard ? <DashboardScreen /> : <p>Dashboard and group card</p>}
        </ParticipantFrame>
      </RequireSession>
    ),
  });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/passport"] }),
  });
  const view = render(
    <Providers>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </Providers>,
  );
  return { api, user: userEvent.setup(), ...view };
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

it("a participant who skipped before must save a name and every answer before seeing the event", async () => {
  sessionStorage.setItem(`gk-name-prompt-skipped:${SEEDED_GUEST_ID}`, "1");
  const { user } = renderEvent(false, false, withBio);
  await screen.findByRole("heading", { name: "What should we call you?" });
  expect(screen.queryByText("Dashboard and group card")).not.toBeInTheDocument();
  // The setup step hides the section tabs.
  expect(screen.queryByRole("navigation", { name: "Sections" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /skip/i })).not.toBeInTheDocument();
  expect(
    screen.queryByRole("heading", {
      name: "Your team is making something new. Which part would you most enjoy?",
    }),
  ).not.toBeInTheDocument();
  await user.type(screen.getByRole("textbox", { name: "Name" }), "Mei Lin");
  await user.click(screen.getByRole("button", { name: "Save" }));
  for (const choice of FIRST_CHOICES) {
    expect(screen.queryByText("Dashboard and group card")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /skip/i })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: choice }));
  }
  expect(await screen.findByText("Dashboard and group card")).toBeInTheDocument();
});

// FRO-138. After `answers_needed`, no half is kept, so the guest finishes setup and must
// tap again. The dashboard's hint is the next step.
it("a guest who finishes setup sees how to connect on the dashboard", async () => {
  const { user } = renderEvent(false, false, withBio, true);
  await user.type(await screen.findByRole("textbox", { name: "Name" }), "Mei Lin");
  await user.click(screen.getByRole("button", { name: "Save" }));
  for (const choice of FIRST_CHOICES) {
    await user.click(await screen.findByRole("button", { name: choice }));
  }

  expect(
    await screen.findByRole("heading", {
      name: "Tap someone's token with your phone to connect.",
    }),
  ).toBeInTheDocument();
});

it("an event without answers asks for the name, then the bio", async () => {
  const { user } = renderEvent(false, true);
  await user.type(await screen.findByRole("textbox", { name: "Name" }), "Mei Lin");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByRole("heading", { name: "Your bio" })).toBeInTheDocument();
  expect(screen.queryByText("Dashboard and group card")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Skip" }));
  expect(await screen.findByText("Dashboard and group card")).toBeInTheDocument();
});

it("organisers see the event without the new setup step", async () => {
  renderEvent(true);
  expect(await screen.findByText("Dashboard and group card")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Your answers" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Your bio" })).not.toBeInTheDocument();
});

it("someone with a bio opens the event without being asked again", async () => {
  renderEvent(false, false, (api) => {
    finishSetup(api);
    guestOf(api).bio = "Building a robot arm";
  });
  expect(await screen.findByText("Dashboard and group card")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Your bio" })).not.toBeInTheDocument();
});

it("someone with a contact line opens the event without being asked again", async () => {
  renderEvent(false, false, (api) => {
    finishSetup(api);
    guestOf(api).contact_line = "@meilin";
  });
  expect(await screen.findByText("Dashboard and group card")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Your bio" })).not.toBeInTheDocument();
});

it("someone who finished setup before the bio step sees it once, and Save opens the event", async () => {
  const { api, user } = renderEvent(false, false, finishSetup);

  expect(await screen.findByRole("heading", { name: "Your bio" })).toBeInTheDocument();
  await user.type(screen.getByLabelText("Bio"), "Building a robot arm");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByText("Dashboard and group card")).toBeInTheDocument();
  expect(guestOf(api).bio).toBe("Building a robot arm");
});

it("a new participant gets the bio step after their last answer", async () => {
  const { user } = renderEvent();
  await finishNameAndAnswers(user);

  expect(await screen.findByRole("heading", { name: "Your bio" })).toBeInTheDocument();
  expect(screen.queryByText("Dashboard and group card")).not.toBeInTheDocument();
});

it("a new participant saves a bio, which opens the event", async () => {
  const { api, user } = renderEvent();
  await finishNameAndAnswers(user);

  await user.type(screen.getByLabelText("Bio"), "  Building a robot arm ");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByText("Dashboard and group card")).toBeInTheDocument();
  expect(guestOf(api).bio).toBe("Building a robot arm");
});

it("the bio step's skip stays in this browser", async () => {
  const first = renderEvent(false, false, finishSetup);
  await first.user.click(await screen.findByRole("button", { name: "Skip" }));
  expect(await screen.findByText("Dashboard and group card")).toBeInTheDocument();
  first.unmount();

  const again = renderEvent(false, false, finishSetup);
  expect(await screen.findByText("Dashboard and group card")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Your bio" })).not.toBeInTheDocument();
  again.unmount();

  localStorage.clear();
  renderEvent(false, false, finishSetup);
  expect(await screen.findByRole("heading", { name: "Your bio" })).toBeInTheDocument();
});

it("needs a bio or a contact line to save", async () => {
  const { api, user } = renderEvent();
  await finishNameAndAnswers(user);

  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Add a bio or a contact line to save.",
  );
  expect(screen.getByRole("heading", { name: "Your bio" })).toBeInTheDocument();
  expect(guestOf(api).bio ?? null).toBeNull();
  expect(guestOf(api).contact_line ?? null).toBeNull();
});

it("shows the service's refusal under the field it names and keeps what was typed", async () => {
  const { api, user } = renderEvent();
  await finishNameAndAnswers(user);
  vi.spyOn(api, "updateMe").mockRejectedValueOnce(
    new ApiError(400, "validation_failed", [{ path: ["contact_line"], message: "Too long" }]),
  );

  await user.type(screen.getByLabelText("Bio"), "Robot arms");
  await user.type(screen.getByLabelText("Contact line"), "@alex");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByText("Use at most 80 characters.")).toBeInTheDocument();
  expect(screen.getByLabelText("Bio")).toHaveValue("Robot arms");
  expect(screen.getByLabelText("Contact line")).toHaveValue("@alex");
  expect(screen.getByRole("heading", { name: "Your bio" })).toBeInTheDocument();
});

it("an older connection does not stop someone filling missing answers in setup", async () => {
  const { user } = renderEvent(false, false, (api) => {
    const guest = guestOf(api);
    guest.has_name = true;
    guest.display_name = "Mei Lin";
    guest.bio = "Building a robot arm";
    guest.answers = Object.fromEntries(
      api.mock.data
        .questions!.slice(0, -1)
        .map((question) => [question.id, question.choices[0]!.id]),
    );
    guest.connections = [
      {
        connected_at: "2026-11-05T08:00:00.000Z",
        display_name: null,
        bio: null,
        contact_line: null,
        avatar: null,
        kind: "B",
        match: null,
        shared: [],
        shared_at: "2026-11-05T08:02:00.000Z",
      },
    ];
  });
  expect(screen.queryByText("Dashboard and group card")).not.toBeInTheDocument();
  await screen.findByRole("button", { name: "Something that makes everyday life easier" });
  expect(screen.queryByRole("button", { name: /Change answer/ })).not.toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: "Something that makes everyday life easier" }),
  );
  expect(await screen.findByText("Dashboard and group card")).toBeInTheDocument();
});
