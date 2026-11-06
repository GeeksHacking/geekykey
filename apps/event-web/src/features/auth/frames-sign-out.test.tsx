import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMockClient } from "@/api/mock/client";
import { SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import { AdminFrame } from "@/features/auth/admin-frame";
import { ParticipantFrame } from "@/features/auth/participant-frame";
import { GEEKYKEY_SCREENS_URL } from "@/lib/constants";
import { useSession } from "@/lib/session";
import { ThemeProvider } from "@/lib/theme-provider";
import { stubLocation } from "@/test/location";
import { createTestProviders } from "@/test/providers";

vi.mock("@/lib/firebase", () => ({ signOutOfFirebase: vi.fn() }));

let location: ReturnType<typeof stubLocation>;

beforeEach(() => {
  localStorage.clear();
  location = stubLocation();
});

afterEach(() => {
  location.restore();
  localStorage.clear();
});

function SignedIn({ children }: { children: ReactNode }) {
  return useSession().me ? children : null;
}

describe("the account menu's Sign out", () => {
  it.each([
    ["participant", ParticipantFrame],
    ["organiser", AdminFrame],
  ])("sends someone who arrived by login link across, from the %s screens", async (_, Frame) => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    const { Providers } = createTestProviders(api, { session: true, loginLink: "mock" });
    const router = createRouter({
      routeTree: createRootRoute({
        component: () => (
          <SignedIn>
            <Frame>
              <p>Screen</p>
            </Frame>
          </SignedIn>
        ),
      }),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    render(
      <ThemeProvider>
        <Providers>
          <RouterProvider router={router as never} />
        </Providers>
      </ThemeProvider>,
    );
    const user = userEvent.setup();

    const [menuButton] = await screen.findAllByRole("button", { name: "Account menu" });
    menuButton!.focus();
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("menuitem", { name: /Sign out/ }));

    await waitFor(() =>
      expect(location.assign).toHaveBeenCalledWith(
        `${GEEKYKEY_SCREENS_URL}sign-out#user=${SEEDED_PARTICIPANT_ID}`,
      ),
    );
  });
});
