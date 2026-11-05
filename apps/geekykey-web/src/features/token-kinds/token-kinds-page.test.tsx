import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/errors";
import { createMockClient, type MockApiClient } from "@/api/mock/client";
import {
  createFixtures,
  SEEDED_ADMIN_ID,
  SEEDED_PARTICIPANT_ID,
  SEEDED_TOKEN_KIND_VIEWER_ID,
} from "@/api/mock/fixtures";
import { ApiProvider } from "@/api/provider";
import { RequireSession } from "@/features/auth/require-session";
import { TokenKindsPage } from "@/features/token-kinds/token-kinds-page";
import { SessionProvider } from "@/lib/session-provider";
import { ThemeProvider } from "@/lib/theme-provider";

/*
  The token kinds screen (BAC-139), rendered behind the real gate and session, as in the
  app. The list is the mock's, so a load shows up in the totals the way it does live.
*/

let api: MockApiClient;

beforeEach(() => {
  api = createMockClient({
    latencyMs: [0, 0],
    storage: null,
    data: {
      ...createFixtures(),
      token_kinds: [
        { uid: "04E45150324189", kind: "E" },
        { uid: "04A1B2C3D4E5F6", kind: "E" },
        { uid: "04C9E1A27B3080", kind: "B" },
      ],
    },
  });
});

async function renderPage(userId: string = SEEDED_ADMIN_ID) {
  api.mock.setSession(userId);
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const page = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => (
      <RequireSession>
        <TokenKindsPage />
      </RequireSession>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([page]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <ApiProvider client={api}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SessionProvider>
            <RouterProvider router={router as never} />
          </SessionProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ApiProvider>,
  );
}

/** Pastes `log` into the box in one go, as a paste does, rather than key by key. */
async function paste(log: string) {
  fireEvent.change(await screen.findByLabelText("Token writer's log"), {
    target: { value: log },
  });
}

/** The total a list shows for one kind, such as "E" giving "2". */
function totalIn(region: HTMLElement, kind: string) {
  return within(region).getByText(kind).nextElementSibling?.textContent;
}

function loadLines(count: number) {
  return Array.from(
    { length: count },
    (_, i) => `04${i.toString(16).padStart(12, "0").toUpperCase()},E`,
  ).join("\n");
}

describe("who can open it", () => {
  it("refuses someone on neither list, and calls nothing", async () => {
    const getTokenKinds = vi.spyOn(api, "getTokenKinds");

    await renderPage(SEEDED_PARTICIPANT_ID);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Only GeekyKey admins and organisers can see token kinds.",
    );
    expect(screen.queryByLabelText("Token writer's log")).not.toBeInTheDocument();
    expect(getTokenKinds).not.toHaveBeenCalled();
  });

  it("shows an organiser the totals, with no way to load", async () => {
    const loadTokenKinds = vi.spyOn(api, "loadTokenKinds");

    await renderPage(SEEDED_TOKEN_KIND_VIEWER_ID);

    const list = await screen.findByRole("region", { name: "On the list" });
    await waitFor(() => expect(totalIn(list, "E")).toBe("2"));
    expect(totalIn(list, "B")).toBe("1");
    expect(screen.queryByLabelText("Token writer's log")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load" })).not.toBeInTheDocument();
    expect(loadTokenKinds).not.toHaveBeenCalled();
  });

  it("doesn't tell an organiser to paste a log when the list is empty", async () => {
    api.mock.data.token_kinds.length = 0;

    await renderPage(SEEDED_TOKEN_KIND_VIEWER_ID);

    expect(await screen.findByText(/A GeekyKey admin loads them/)).toBeInTheDocument();
    expect(screen.queryByText(/Paste the token writer's log/)).not.toBeInTheDocument();
  });

  it("says so when the service refuses someone it no longer lists", async () => {
    vi.spyOn(api, "getTokenKinds").mockRejectedValue(new ApiError(403, "forbidden"));

    await renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your account is not allowed to do that.",
    );
  });
});

describe("the list's totals", () => {
  it("shows the total per kind when it opens", async () => {
    await renderPage();

    const list = await screen.findByRole("region", { name: "On the list" });
    await waitFor(() => expect(totalIn(list, "B")).toBe("1"));
    expect(totalIn(list, "E")).toBe("2");
    expect(within(list).getByText("3 tokens")).toBeInTheDocument();
  });

  it("says what to do when nothing has been loaded", async () => {
    api.mock.data.token_kinds.length = 0;

    await renderPage();

    expect(await screen.findByText(/No tokens on the list yet/)).toBeInTheDocument();
  });

  it("offers another try when they can't be read", async () => {
    const getTokenKinds = vi
      .spyOn(api, "getTokenKinds")
      .mockRejectedValueOnce(new ApiError(503, "claims_unavailable"));

    await renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't reach GeeksHacking. Try again.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(getTokenKinds).toHaveBeenCalledTimes(2));
  });
});

describe("checking a paste before anything is written", () => {
  it("shows the tokens per kind and writes nothing", async () => {
    const loadTokenKinds = vi.spyOn(api, "loadTokenKinds");
    await renderPage();

    await paste("to write kind E\n04E45150324189,E\n04D00D00D00D00,E\n04D00D00D00D01,B\nOK kind E");

    const found = await screen.findByRole("region", { name: "In this log" });
    expect(totalIn(found, "E")).toBe("2");
    expect(totalIn(found, "B")).toBe("1");
    expect(within(found).getByText("3 tokens")).toBeInTheDocument();
    expect(within(found).getByText("Skipped 2 other lines")).toBeInTheDocument();
    expect(loadTokenKinds).not.toHaveBeenCalled();
  });

  it("flags each line with a comma that isn't a list line", async () => {
    await renderPage();

    await paste("04E45150324189,E\n04E4515032418,E\nFAIL AUTH");

    const flagged = await screen.findByRole("list", { name: "Lines to check" });
    expect(
      within(flagged)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["04E4515032418,E"]);
  });

  it("won't load a paste with no list lines, and says why", async () => {
    await renderPage();

    await paste("to write kind E\nOK kind E");

    expect(await screen.findByText(/No list lines in this log/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load" })).toBeDisabled();
  });

  it("loads 500 tokens, but asks for a larger paste to be split", async () => {
    await renderPage();

    await paste(loadLines(500));
    await waitFor(() => expect(screen.getByRole("button", { name: "Load" })).toBeEnabled());
    expect(screen.queryByText(/Split the log/)).not.toBeInTheDocument();

    await paste(loadLines(501));
    expect(await screen.findByText(/Split the log/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load" })).toBeDisabled();
  });

  it("counts tokens rather than lines towards the 500", async () => {
    await renderPage();

    await paste(`${loadLines(500)}\n${loadLines(1)}`);

    await waitFor(() => expect(screen.getByRole("button", { name: "Load" })).toBeEnabled());
  });
});

describe("loading", () => {
  /** Pastes and presses Load once the screen lets it. */
  async function load(log: string) {
    await paste(log);
    const button = screen.getByRole("button", { name: "Load" });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
  }

  it("says how many were new and how many changed kind, and shows the new totals", async () => {
    await renderPage();

    // One new, one changed from E to B, one the same.
    await load("04D00D00D00D00,E\n04E45150324189,B\n04C9E1A27B3080,B");

    const result = await screen.findByRole("region", { name: "Loaded" });
    expect(totalIn(result, "New")).toBe("1");
    expect(totalIn(result, "Changed kind")).toBe("1");
    expect(totalIn(result, "Already had that kind")).toBe("1");

    const list = screen.getByRole("region", { name: "On the list" });
    await waitFor(() => expect(totalIn(list, "B")).toBe("2"));
    expect(totalIn(list, "E")).toBe("2");
    expect(within(list).getByText("4 tokens")).toBeInTheDocument();
  });

  it("says anyone with a kind keeps it, when a kind changed", async () => {
    await renderPage();

    await load("04E45150324189,B");

    expect(
      await screen.findByText(
        "Anyone who already has a kind keeps it, because the Event Service keeps a user's first kind.",
      ),
    ).toBeInTheDocument();
  });

  it("doesn't say that when no kind changed", async () => {
    await renderPage();

    await load("04D00D00D00D00,E");

    await screen.findByRole("region", { name: "Loaded" });
    expect(screen.queryByText(/keeps a user's first kind/)).not.toBeInTheDocument();
  });

  it("sends each UID once with its last kind", async () => {
    const loadTokenKinds = vi.spyOn(api, "loadTokenKinds");
    await renderPage();

    await load("04D00D00D00D00,E\nOK kind E\n04D00D00D00D00,V");

    await screen.findByRole("region", { name: "Loaded" });
    expect(loadTokenKinds).toHaveBeenCalledWith([{ uid: "04D00D00D00D00", kind: "V" }]);
  });

  it("clears the paste once it's loaded, so it isn't loaded twice by accident", async () => {
    await renderPage();

    await load("04D00D00D00D00,E");

    await screen.findByRole("region", { name: "Loaded" });
    expect(screen.getByLabelText("Token writer's log")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Load" })).toBeDisabled();
  });

  it("warns that a load with a lost answer may have gone in", async () => {
    vi.spyOn(api, "loadTokenKinds").mockRejectedValueOnce(new ApiError(503, "claims_unavailable"));
    await renderPage();

    await load("04D00D00D00D00,E");

    expect(await screen.findByRole("alert")).toHaveTextContent("The load may have gone in anyway.");
  });

  it("gives no such warning when the service refused the load", async () => {
    vi.spyOn(api, "loadTokenKinds").mockRejectedValueOnce(new ApiError(429, "rate_limited"));
    await renderPage();

    await load("04D00D00D00D00,E");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Too many tries.");
    expect(alert).not.toHaveTextContent("gone in anyway");
  });

  it("keeps the paste and says so when the load fails", async () => {
    vi.spyOn(api, "loadTokenKinds").mockRejectedValueOnce(new ApiError(503, "claims_unavailable"));
    await renderPage();

    await load("04D00D00D00D00,E");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't reach GeeksHacking. Try again.",
    );
    expect(screen.getByLabelText("Token writer's log")).toHaveValue("04D00D00D00D00,E");
    expect(screen.getByRole("button", { name: "Load" })).toBeEnabled();
  });
});
