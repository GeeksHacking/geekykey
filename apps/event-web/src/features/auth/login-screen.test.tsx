import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const me: MeResponse = {
  user: { id: "dev-user-1", display_name: "Alex Tan", role: "participant" },
  points: 0,
  stamps: [],
  recent_taps: [],
};

function session(status: SessionState["status"]): SessionState {
  return {
    status,
    me: status === "authenticated" ? me : null,
    error: undefined,
    refresh: async () => {},
    signIn: async () => me,
    signOut: async () => {},
  };
}

beforeEach(() => {
  goAfterLogin.mockReset();
});

describe("LoginScreen", () => {
  it("navigates exactly once after a successful sign-in", async () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    const { rerender } = render(
      <ThemeProvider>
        <ApiProvider client={api}>
          <SessionContext.Provider value={session("anonymous")}>
            <LoginScreen returnTo="/passport" />
          </SessionContext.Provider>
        </ApiProvider>
      </ThemeProvider>,
    );
    expect(goAfterLogin).not.toHaveBeenCalled();

    rerender(
      <ThemeProvider>
        <ApiProvider client={api}>
          <SessionContext.Provider value={session("authenticated")}>
            <LoginScreen returnTo="/passport" />
          </SessionContext.Provider>
        </ApiProvider>
      </ThemeProvider>,
    );

    await waitFor(() => expect(goAfterLogin).toHaveBeenCalledTimes(1));
    expect(goAfterLogin).toHaveBeenCalledWith("/passport", "participant");
    rerender(
      <ThemeProvider>
        <ApiProvider client={api}>
          <SessionContext.Provider value={session("authenticated")}>
            <LoginScreen returnTo="/passport" />
          </SessionContext.Provider>
        </ApiProvider>
      </ThemeProvider>,
    );
    expect(goAfterLogin).toHaveBeenCalledTimes(1);
  });
});
