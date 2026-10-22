import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/errors";
import { createMockClient } from "@/api/mock/client";
import type { MeResponse } from "@/api/types";
import { ApiProvider } from "@/api/provider";
import { LoginScreen } from "@/features/auth/login-screen";
import { SessionContext, type SessionState } from "@/lib/session";
import { ThemeProvider } from "@/lib/theme-provider";

const { goAfterLogin } = vi.hoisted(() => ({ goAfterLogin: vi.fn() }));

vi.mock("@/features/auth/use-go-after-login", () => ({
  useGoAfterLogin: () => goAfterLogin,
}));

vi.mock("@firebase/app", () => ({ initializeApp: vi.fn(() => ({ name: "app" })) }));
vi.mock("@firebase/auth", () => ({
  getAuth: vi.fn(() => ({ name: "auth" })),
  GoogleAuthProvider: vi.fn(),
  OAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}));

// The screen only needs the module's config check. The buttons' own behaviour is in
// features/auth/firebase-sign-in.test.tsx.
vi.mock("@/lib/firebase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/firebase")>()),
  hasFirebaseConfig: () => true,
}));

const me: MeResponse = {
  user: { id: "dev-user-1", display_name: "Alex Tan", role: "participant" },
  points: 0,
  stamps: [],
  recent_taps: [],
};

function session(status: SessionState["status"], loginLinkError?: unknown): SessionState {
  return {
    status,
    me: status === "authenticated" ? me : null,
    error: undefined,
    loginLinkError,
    refresh: async () => {},
    signIn: async () => me,
    signInWithFirebase: async () => me,
    signOut: async () => {},
  };
}

function renderLogin(returnTo?: string, loginLinkError?: unknown) {
  const api = createMockClient({ latencyMs: [0, 0], storage: null });
  const view = (status: SessionState["status"]) => (
    <ThemeProvider>
      <ApiProvider client={api}>
        <SessionContext.Provider value={session(status, loginLinkError)}>
          <LoginScreen returnTo={returnTo} />
        </SessionContext.Provider>
      </ApiProvider>
    </ThemeProvider>
  );
  const { rerender } = render(view("anonymous"));
  return { api, rerender, view };
}

beforeEach(() => {
  goAfterLogin.mockReset();
});

describe("LoginScreen", () => {
  it("navigates exactly once after a successful sign-in", async () => {
    const { rerender, view } = renderLogin("/passport");
    expect(goAfterLogin).not.toHaveBeenCalled();

    rerender(view("authenticated"));

    await waitFor(() => expect(goAfterLogin).toHaveBeenCalledTimes(1));
    expect(goAfterLogin).toHaveBeenCalledWith("/passport", "participant");
    rerender(view("authenticated"));
    expect(goAfterLogin).toHaveBeenCalledTimes(1);
  });

  it("says what signing in is for, without promising an account", () => {
    renderLogin();

    // Agreement 7.2: Google's sign-in is for anyone, and GeeksHacking's own login is only
    // offered once its provider is set up.
    expect(screen.getByText("Sign in to open your passport for this event.")).toBeInTheDocument();
  });

  it("offers the Firebase sign-in", () => {
    renderLogin();

    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
  });

  it("points the local form at the buttons above it", () => {
    renderLogin();

    expect(
      screen.getByText(
        "Use a seeded account. The buttons above are how the showcase signs you in.",
      ),
    ).toBeInTheDocument();
  });

  it("says the login link has expired when a visitor with no session arrives with one", () => {
    // Agreement 7.4: with no session to carry on, the person lands here.
    renderLogin(undefined, new ApiError(401, "invalid_login_link"));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "That link has expired. Tap your token again to get back in.",
    );
  });
});
