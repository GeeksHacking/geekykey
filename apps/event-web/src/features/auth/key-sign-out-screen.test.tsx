import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/errors";
import { createMockClient } from "@/api/mock/client";
import { SEEDED_ORGANIZER_ID, SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import { ApiProvider } from "@/api/provider";
import { GEEKYKEY_SCREENS_URL } from "@/lib/constants";
import { createQueryClient } from "@/lib/query-client";
import { SessionProvider } from "@/lib/session-provider";
import { ThemeProvider } from "@/lib/theme-provider";
import { routeTree } from "@/routeTree.gen";
import { stubLocation } from "@/test/location";

vi.mock("@/lib/firebase", () => ({ signOutOfFirebase: vi.fn() }));

const KEY_LOGIN = `${GEEKYKEY_SCREENS_URL}login`;

let location: ReturnType<typeof stubLocation>;

beforeEach(() => {
  location = stubLocation();
});

afterEach(() => {
  location.restore();
  vi.restoreAllMocks();
});

/** The GeekyKey screens send a guest here once they've signed out there, naming them. */
function arriveFromKey({
  session = SEEDED_PARTICIPANT_ID,
  named = SEEDED_PARTICIPANT_ID,
  api = createMockClient({ latencyMs: [0, 0], storage: null }),
}: {
  session?: string | null;
  named?: string | null;
  api?: ReturnType<typeof createMockClient>;
} = {}) {
  api.mock.setSession(session);
  const hash = named === null ? "" : `#user=${encodeURIComponent(named)}`;
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`/sign-out${hash}`] }),
  });
  render(
    <ApiProvider client={api}>
      <QueryClientProvider client={createQueryClient({ retry: false })}>
        <SessionProvider>
          <ThemeProvider>
            <RouterProvider router={router as never} />
          </ThemeProvider>
        </SessionProvider>
      </QueryClientProvider>
    </ApiProvider>,
  );
  return { api };
}

describe("a guest who signed out on the GeekyKey screens, arriving on the Event screens", () => {
  it("logs out the user the GeekyKey screens named, then goes back to their login", async () => {
    const { api } = arriveFromKey();

    await waitFor(() => expect(window.location.replace).toHaveBeenCalledWith(KEY_LOGIN));
    await expect(api.me()).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("leaves someone else's session alone, so a link can't log anyone out", async () => {
    const { api } = arriveFromKey({ session: SEEDED_ORGANIZER_ID });

    await waitFor(() => expect(window.location.replace).toHaveBeenCalledWith(KEY_LOGIN));
    expect(await api.me()).toMatchObject({ user: { id: SEEDED_ORGANIZER_ID } });
  });

  it("does nothing to a session when the address names nobody", async () => {
    const { api } = arriveFromKey({ named: null });

    await waitFor(() => expect(window.location.replace).toHaveBeenCalledWith(KEY_LOGIN));
    expect(await api.me()).toMatchObject({ user: { id: SEEDED_PARTICIPANT_ID } });
  });

  it("goes straight back when nobody is logged in here", async () => {
    arriveFromKey({ session: null });

    await waitFor(() => expect(window.location.replace).toHaveBeenCalledWith(KEY_LOGIN));
  });

  it("says so and offers to try again when the log out fails, since the session may still be there", async () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    const logout = vi.spyOn(api, "logout");
    logout.mockRejectedValueOnce(new ApiError(503, "service_unavailable"));
    arriveFromKey({ api });
    const user = userEvent.setup();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't log you out of the event");
    expect(window.location.replace).not.toHaveBeenCalled();

    await user.click(within(alert).getByRole("button", { name: /Try again/ }));

    await waitFor(() => expect(window.location.replace).toHaveBeenCalledWith(KEY_LOGIN));
    await expect(api.me()).rejects.toMatchObject({ code: "unauthenticated" });
    expect(logout).toHaveBeenCalledTimes(2);
  });

  it("offers the way back when the log out keeps failing, so nobody is stuck here", async () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    vi.spyOn(api, "logout").mockRejectedValue(new ApiError(503, "service_unavailable"));
    arriveFromKey({ api });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Back to GeekyKey" }));

    expect(window.location.replace).toHaveBeenCalledWith(KEY_LOGIN);
  });

  it("offers to try again and the way back when /me can't be read", async () => {
    const api = createMockClient({ latencyMs: [0, 0], storage: null });
    vi.spyOn(api, "me").mockRejectedValue(new ApiError(503, "service_unavailable"));
    arriveFromKey({ api });
    const user = userEvent.setup();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(window.location.replace).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Back to GeekyKey" }));

    expect(window.location.replace).toHaveBeenCalledWith(KEY_LOGIN);
  });
});
