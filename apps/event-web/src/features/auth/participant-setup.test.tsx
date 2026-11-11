import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { createMockClient } from "@/api/mock/client";
import { SEEDED_GUEST_ID, SEEDED_ORGANIZER_ID } from "@/api/mock/fixtures";
import { ParticipantFrame } from "@/features/auth/participant-frame";
import { RequireSession } from "@/features/auth/require-session";
import { DashboardScreen } from "@/features/passport/dashboard-screen";
import { ThemeProvider } from "@/lib/theme-provider";
import { createTestProviders } from "@/test/providers";

vi.mock("@/lib/firebase", () => ({ signOutOfFirebase: vi.fn() }));

function renderEvent(
  organizer = false,
  noQuestions = false,
  setup?: (api: ReturnType<typeof createMockClient>) => void,
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
  render(
    <Providers>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </Providers>,
  );
  return { api, user: userEvent.setup() };
}

beforeEach(() => sessionStorage.clear());

it("a participant who skipped before must save a name and every answer before seeing the event", async () => {
  sessionStorage.setItem(`gk-name-prompt-skipped:${SEEDED_GUEST_ID}`, "1");
  const { user } = renderEvent();
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
  for (const choice of [
    "Coming up with ideas",
    "Try it myself",
    "Make a plan first",
    "Break the problem into smaller parts",
    "Something that makes everyday life easier",
  ]) {
    expect(screen.queryByText("Dashboard and group card")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /skip/i })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: choice }));
  }
  expect(await screen.findByText("Dashboard and group card")).toBeInTheDocument();
});

// FRO-138. After `answers_needed`, no half is kept, so the guest finishes setup and must
// tap again. The dashboard's hint is the next step.
it("a guest who finishes setup sees how to connect on the dashboard", async () => {
  const { user } = renderEvent(false, false, undefined, true);
  await user.type(await screen.findByRole("textbox", { name: "Name" }), "Mei Lin");
  await user.click(screen.getByRole("button", { name: "Save" }));
  for (const choice of [
    "Coming up with ideas",
    "Try it myself",
    "Make a plan first",
    "Break the problem into smaller parts",
    "Something that makes everyday life easier",
  ]) {
    await user.click(await screen.findByRole("button", { name: choice }));
  }

  expect(
    await screen.findByRole("heading", {
      name: "Tap someone's token with your phone to connect.",
    }),
  ).toBeInTheDocument();
});

it("an event without answers needs only the participant's name", async () => {
  const { user } = renderEvent(false, true);
  await user.type(await screen.findByRole("textbox", { name: "Name" }), "Mei Lin");
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByText("Dashboard and group card")).toBeInTheDocument();
});

it("organisers see the event without the new setup step", async () => {
  renderEvent(true);
  expect(await screen.findByText("Dashboard and group card")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Your answers" })).not.toBeInTheDocument();
});

it("someone who already finished opens the event without being asked again", async () => {
  renderEvent(false, false, (api) => {
    const guest = api.mock.data.users.find(({ id }) => id === SEEDED_GUEST_ID)!;
    guest.has_name = true;
    guest.display_name = "Mei Lin";
    guest.answers = Object.fromEntries(
      api.mock.data.questions!.map((q) => [q.id, q.choices[0]!.id]),
    );
  });
  expect(await screen.findByText("Dashboard and group card")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Your answers" })).not.toBeInTheDocument();
});

it("an older connection does not stop someone filling missing answers in setup", async () => {
  const { user } = renderEvent(false, false, (api) => {
    const guest = api.mock.data.users.find(({ id }) => id === SEEDED_GUEST_ID)!;
    guest.has_name = true;
    guest.display_name = "Mei Lin";
    guest.answers = Object.fromEntries(
      api.mock.data.questions!.slice(0, -1).map((q) => [q.id, q.choices[0]!.id]),
    );
    guest.connections = [
      {
        connected_at: "2026-11-05T08:00:00.000Z",
        display_name: null,
        bio: null,
        contact_line: null,
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
