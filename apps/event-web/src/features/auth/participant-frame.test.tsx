import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/errors";
import type { MeResponse } from "@/api/types";
import { ParticipantFrame } from "@/features/auth/participant-frame";
import { SessionContext, type SessionState } from "@/lib/session";
import { ThemeProvider } from "@/lib/theme-provider";

const me: MeResponse = {
  user: { id: "dev-organizer-1", display_name: "Priya Raman", role: "organizer", has_name: true },
  points: 0,
  stamps: [],
  recent_taps: [],
};

function renderFrame(loginLinkError: unknown) {
  const session: SessionState = {
    status: "authenticated",
    me,
    error: undefined,
    loginLinkError,
    refresh: async () => {},
    signIn: async () => me,
    signInWithFirebase: async () => me,
    signOut: async () => {},
  };
  const rootRoute = createRootRoute({
    component: () => (
      <ParticipantFrame>
        <p>Dashboard</p>
      </ParticipantFrame>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(
    <ThemeProvider>
      <SessionContext.Provider value={session}>
        <RouterProvider router={router} />
      </SessionContext.Provider>
    </ThemeProvider>,
  );
}

describe("ParticipantFrame", () => {
  it("says the login link has expired above the session the browser already had", async () => {
    // Agreement 7.4: a link that fails leaves the existing session as it was, so the
    // dashboard carries on underneath the sentence.
    renderFrame(new ApiError(401, "invalid_login_link"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That link has expired. Tap your token again to get back in.",
    );
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("says nothing about a link when the page arrived without one", async () => {
    renderFrame(undefined);

    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
