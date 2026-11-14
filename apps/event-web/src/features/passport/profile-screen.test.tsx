import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockClient } from "@/api/mock/client";
import type { MeResponse } from "@/api/types";
import { ProfileScreen } from "@/features/passport/profile-screen";
import { ThemeProvider } from "@/lib/theme-provider";
import { makeMe } from "@/test/make-me";
import { createTestProviders } from "@/test/providers";

const state = vi.hoisted(() => ({ me: null as MeResponse | null }));

vi.mock("@/lib/session", () => ({
  useMe: () => ({ me: state.me, refresh: async () => {} }),
  useSession: () => ({ consumeLoginLinkArrival: () => false }),
}));

const answersGame: MeResponse["questions"] = [
  {
    id: "drink",
    text: "Tea or coffee?",
    choices: [
      { id: "tea", text: "Tea" },
      { id: "coffee", text: "Coffee" },
    ],
  },
];

beforeEach(() => {
  state.me = makeMe();
});

function renderProfile() {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  const { Providers } = createTestProviders(api);
  return render(
    <Providers>
      <ThemeProvider>
        <ProfileScreen />
      </ThemeProvider>
    </Providers>,
  );
}

describe("the Profile tab (FRO-184)", () => {
  it("gathers the avatar, the name, the bio, how others see you, the answers and the user ID", () => {
    state.me = makeMe({
      user: { display_name: "Alex Tan", bio: "Robot arm", contact_line: "@alex" },
      questions: answersGame,
    });
    renderProfile();

    expect(screen.getByRole("region", { name: "Your avatar" })).toBeInTheDocument();
    expect(screen.getAllByText("Alex Tan").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Change name" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change profile" })).toBeInTheDocument();
    expect(screen.getAllByText("Robot arm").length).toBeGreaterThan(0);
    expect(screen.getByText("Contact: @alex")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How others see you" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your answers" })).toBeInTheDocument();
    expect(screen.getByText("dev-user-1")).toBeInTheDocument();
  });

  it("draws How others see you as the card, with the user's own name and bio", () => {
    state.me = makeMe({
      user: { display_name: "Alex Tan", bio: "Robot arm" },
      questions: answersGame,
    });
    renderProfile();

    const section = screen.getByRole("heading", { name: "How others see you" }).closest("section");
    if (!section) throw new Error("No How others see you section");
    expect(within(section).getByText("Alex Tan")).toBeInTheDocument();
    expect(within(section).getByText("Robot arm")).toBeInTheDocument();
    expect(within(section).queryByText(/Contact:/)).not.toBeInTheDocument();
  });

  it("keeps today's sentence while there is no bio or contact line", () => {
    state.me = makeMe({ questions: answersGame });
    renderProfile();

    expect(
      screen.getByText(
        "No bio or contact line yet. Add them so people you connect with can reach you.",
      ),
    ).toBeInTheDocument();
  });

  it("shows an organiser no name row and no answers", () => {
    state.me = makeMe({
      user: { role: "organizer", display_name: "Priya Raman" },
      questions: answersGame,
    });
    renderProfile();

    expect(screen.queryByRole("button", { name: "Change name" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your answers" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How others see you" })).toBeInTheDocument();
    expect(screen.getByText("dev-user-1")).toBeInTheDocument();
  });

  it("leaves the profile block out in an event with no connections game", () => {
    state.me = makeMe({ questions: null });
    renderProfile();

    expect(screen.queryByRole("heading", { name: "Your profile" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How others see you" })).toBeInTheDocument();
  });
});
