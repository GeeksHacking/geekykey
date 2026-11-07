import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
    const listKindTokens = vi.spyOn(api, "listKindTokens");

    await renderPage(SEEDED_TOKEN_KIND_VIEWER_ID);

    const list = await screen.findByRole("region", { name: "On the list" });
    await waitFor(() => expect(totalIn(list, "E")).toBe("2"));
    expect(totalIn(list, "B")).toBe("1");
    expect(screen.queryByLabelText("Token writer's log")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load" })).not.toBeInTheDocument();
    expect(loadTokenKinds).not.toHaveBeenCalled();
    expect(listKindTokens).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Every token" })).not.toBeInTheDocument();
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

describe("the admin token list", () => {
  it("shows claims without kinds, searches UIDs and filters by kind", async () => {
    await renderPage();
    const list = await screen.findByRole("region", { name: "Every token" });
    await within(list).findByText("04A1B2C3D4E5F6");
    expect(within(list).getAllByText(SEEDED_PARTICIPANT_ID).length).toBeGreaterThan(0);
    expect(within(list).getAllByText("Unclaimed").length).toBeGreaterThan(0);
    const noKind = within(list).getByText("04B7C9E1F3A5").closest("tr")!;
    expect(within(noKind).getByText("No kind")).toBeInTheDocument();
    expect(within(noKind).getByRole("time")).toHaveAttribute("datetime");
    fireEvent.change(screen.getByLabelText("Search by UID"), { target: { value: "04:a1:b2" } });
    expect(within(list).getByText("04A1B2C3D4E5F6")).toBeInTheDocument();
    expect(within(list).queryByText("04C9E1A27B3080")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search by UID"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Filter by kind"), { target: { value: "kind:B" } });
    expect(within(list).getByText("04C9E1A27B3080")).toBeInTheDocument();
    expect(within(list).queryByText("04A1B2C3D4E5F6")).not.toBeInTheDocument();
  });
});

it("removes only after confirmation, refreshes totals and can load that UID again", async () => {
  const remove = vi.spyOn(api, "removeTokenKind");
  await renderPage();
  await userEvent.click(await screen.findByRole("button", { name: "Remove 04C9E1A27B3080" }));
  let dialog = await screen.findByRole("alertdialog");
  expect(dialog).toHaveTextContent("04C9E1A27B3080");
  expect(remove).not.toHaveBeenCalled();
  await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(remove).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Remove 04C9E1A27B3080" }));
  dialog = await screen.findByRole("alertdialog");
  await userEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  expect(screen.queryByRole("button", { name: "Remove 04C9E1A27B3080" })).not.toBeInTheDocument();
  expect(
    within(screen.getByRole("region", { name: "On the list" })).getByText("2 tokens"),
  ).toBeInTheDocument();
  await paste("04C9E1A27B3080,B");
  await userEvent.click(screen.getByRole("button", { name: "Load" }));
  await screen.findByRole("button", { name: "Remove 04C9E1A27B3080" });
});

it("keeps a claimed token's kind and tells the admin to release it first", async () => {
  await renderPage();
  await userEvent.click(await screen.findByRole("button", { name: "Remove 04A1B2C3D4E5F6" }));
  const dialog = await screen.findByRole("alertdialog");
  await userEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "This token is claimed. Release it first, then remove it from the kinds list.",
  );
  expect(api.mock.data.token_kinds).toContainEqual({ uid: "04A1B2C3D4E5F6", kind: "E" });
});

it("pages 500 tokens and searches across all pages", async () => {
  api.mock.data.tokens.length = 0;
  api.mock.data.token_kinds = Array.from({ length: 500 }, (_, i) => ({
    uid: `04${i.toString(16).padStart(12, "0").toUpperCase()}`,
    kind: i % 2 === 0 ? "E" : "B",
  }));
  await renderPage();
  const list = await screen.findByRole("region", { name: "Every token" });
  await within(list).findByText("500 tokens found");
  expect(within(list).getAllByRole("row")).toHaveLength(51);
  expect(within(list).getByText("Page 1 of 10")).toBeInTheDocument();
  await userEvent.click(within(list).getByRole("button", { name: "Next" }));
  expect(within(list).getByText("Page 2 of 10")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Search by UID"), { target: { value: "040000000001F3" } });
  expect(within(list).getByText("040000000001F3")).toBeInTheDocument();
  expect(within(list).getAllByRole("row")).toHaveLength(2);
  expect(within(list).getByText("1 of 500 tokens found")).toBeInTheDocument();
  expect(within(list).queryByRole("navigation", { name: "Token pages" })).not.toBeInTheDocument();
});

it("distinguishes a stored kind named none from tokens without a kind", async () => {
  api.mock.data.token_kinds.push({ uid: "DEADBEEF", kind: "none" });
  await renderPage();
  const list = await screen.findByRole("region", { name: "Every token" });
  await within(list).findByText("DEADBEEF");
  fireEvent.change(screen.getByLabelText("Filter by kind"), { target: { value: "kind:none" } });
  expect(within(list).getByText("DEADBEEF")).toBeInTheDocument();
  expect(within(list).queryByText("04B7C9E1F3A5")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Filter by kind"), { target: { value: "none" } });
  expect(within(list).getByText("04B7C9E1F3A5")).toBeInTheDocument();
  expect(within(list).queryByText("DEADBEEF")).not.toBeInTheDocument();
});

describe("releasing a token", () => {
  async function openRelease(uid: string) {
    await userEvent.click(await screen.findByRole("button", { name: `Release ${uid}` }));
    return screen.findByRole("alertdialog");
  }

  it("confirms with the UID and owner, and Cancel changes nothing", async () => {
    const release = vi.spyOn(api, "releaseToken");
    await renderPage();

    const dialog = await openRelease("04A1B2C3D4E5F6");
    expect(dialog).toHaveTextContent("04A1B2C3D4E5F6");
    expect(dialog).toHaveTextContent(SEEDED_PARTICIPANT_ID);
    expect(dialog).toHaveTextContent("Anyone will be able to claim it again.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(release).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("releases for the confirmed owner and keeps the token's kind", async () => {
    const release = vi.spyOn(api, "releaseToken");
    await renderPage();

    const dialog = await openRelease("04A1B2C3D4E5F6");
    await userEvent.click(within(dialog).getByRole("button", { name: "Release token" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith("04A1B2C3D4E5F6", SEEDED_PARTICIPANT_ID);
    const row = (await screen.findByText("04A1B2C3D4E5F6")).closest("tr")!;
    await waitFor(() => expect(within(row).getByText("Unclaimed")).toBeInTheDocument());
    expect(within(row).getByText("E")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Release 04A1B2C3D4E5F6" }),
    ).not.toBeInTheDocument();
  });

  it("refuses to release a newer owner's claim, and shows who holds it now", async () => {
    const release = vi.spyOn(api, "releaseToken");
    await renderPage();
    const dialog = await openRelease("04A1B2C3D4E5F6");
    api.mock.data.tokens.find((t) => t.uid === "04A1B2C3D4E5F6")!.owner_id = "newer-owner";

    await userEvent.click(within(dialog).getByRole("button", { name: "Release token" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent(
      "Someone else has claimed this token now, or it has already been released.",
    );
    await waitFor(() =>
      expect(alert).toHaveTextContent("The refreshed list shows it claimed by newer-owner."),
    );
    expect(within(dialog).queryByRole("button", { name: "Release token" })).not.toBeInTheDocument();
    expect(release).toHaveBeenCalledTimes(1);
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    const fresh = await openRelease("04A1B2C3D4E5F6");
    expect(fresh).toHaveTextContent("newer-owner");
  });

  it("asks for a new confirmation when the owner changes while it is open", async () => {
    const release = vi.spyOn(api, "releaseToken");
    await renderPage();
    const dialog = await openRelease("04A1B2C3D4E5F6");
    api.mock.data.tokens.find((t) => t.uid === "04A1B2C3D4E5F6")!.owner_id = "newer-owner";

    focusManager.setFocused(false);
    focusManager.setFocused(true);

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "This token's owner has changed since you opened this.",
    );
    expect(within(dialog).queryByRole("button", { name: "Release token" })).not.toBeInTheDocument();
    expect(release).not.toHaveBeenCalled();
    focusManager.setFocused(undefined);
  });

  it("says a release with a lost reply may have gone through, and never retries it", async () => {
    const send = api.releaseToken.bind(api);
    const release = vi.spyOn(api, "releaseToken").mockImplementationOnce(async (uid, owner) => {
      await send(uid, owner);
      throw new ApiError(503, "claims_unavailable");
    });
    await renderPage();

    const dialog = await openRelease("04A1B2C3D4E5F6");
    await userEvent.click(within(dialog).getByRole("button", { name: "Release token" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("The release may have gone through.");
    await waitFor(() => expect(alert).toHaveTextContent("The refreshed list shows it unclaimed."));
    expect(within(dialog).queryByRole("button", { name: "Release token" })).not.toBeInTheDocument();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("shows a refusal without saying it may have gone through", async () => {
    vi.spyOn(api, "releaseToken").mockRejectedValueOnce(new ApiError(429, "rate_limited"));
    await renderPage();

    const dialog = await openRelease("04A1B2C3D4E5F6");
    await userEvent.click(within(dialog).getByRole("button", { name: "Release token" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("Too many tries.");
    expect(alert).not.toHaveTextContent("may have gone through");
    await waitFor(() =>
      expect(alert).toHaveTextContent(
        `The refreshed list shows it claimed by ${SEEDED_PARTICIPANT_ID}.`,
      ),
    );
  });

  it("sends one release however often it is pressed", async () => {
    const release = vi.spyOn(api, "releaseToken");
    await renderPage();

    const dialog = await openRelease("04A1B2C3D4E5F6");
    const confirm = within(dialog).getByRole("button", { name: "Release token" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("reads the user's own tokens again afterwards", async () => {
    const me = vi.spyOn(api, "me");
    await renderPage();
    await screen.findByRole("button", { name: "Release 04A1B2C3D4E5F6" });
    const before = me.mock.calls.length;

    const dialog = await openRelease("04A1B2C3D4E5F6");
    await userEvent.click(within(dialog).getByRole("button", { name: "Release token" }));

    await waitFor(() => expect(me.mock.calls.length).toBeGreaterThan(before));
  });

  it("offers Release for a claimed token with no kind, which then leaves the list", async () => {
    await renderPage();

    const dialog = await openRelease("04B7C9E1F3A5");
    await userEvent.click(within(dialog).getByRole("button", { name: "Release token" }));

    await waitFor(() => expect(screen.queryByText("04B7C9E1F3A5")).not.toBeInTheDocument());
  });
});

describe("finding tokens", () => {
  /** 120 tokens: kinds E and B in turn, every third one claimed. */
  function seed() {
    api.mock.data.tokens.length = 0;
    api.mock.data.token_kinds = [];
    for (let i = 0; i < 120; i++) {
      const uid = `04${i.toString(16).padStart(12, "0").toUpperCase()}`;
      api.mock.data.token_kinds.push({ uid, kind: i % 2 === 0 ? "E" : "B" });
      if (i % 3 === 0) {
        api.mock.data.tokens.push({
          uid,
          owner_id: `owner-${i}`,
          claimed_at: "2026-11-06T09:00:00.000Z",
        });
      }
    }
  }

  const firstUid = (list: HTMLElement) =>
    within(list).getAllByRole("row")[1]!.querySelector("th")!.textContent;

  it("combines ownership, kind and sorting, and starts again on page 1", async () => {
    seed();
    await renderPage();
    const list = await screen.findByRole("region", { name: "Every token" });
    await within(list).findByText("120 tokens found");
    await userEvent.click(within(list).getByRole("button", { name: "Next" }));
    expect(within(list).getByText("Page 2 of 3")).toBeInTheDocument();

    await userEvent.click(within(list).getByRole("radio", { name: "Unclaimed" }));
    expect(within(list).getByText("80 of 120 tokens found")).toBeInTheDocument();
    expect(within(list).getByText("Page 1 of 2")).toBeInTheDocument();

    fireEvent.change(within(list).getByLabelText("Filter by kind"), {
      target: { value: "kind:E" },
    });
    fireEvent.change(within(list).getByLabelText("Sort by"), { target: { value: "uid-desc" } });
    // Even and not a multiple of 3, highest first: 118 is 0x76.
    expect(within(list).getByText("40 of 120 tokens found")).toBeInTheDocument();
    expect(firstUid(list)).toBe("040000000000" + "76");
    expect(within(list).queryByRole("navigation", { name: "Token pages" })).not.toBeInTheDocument();

    await userEvent.click(within(list).getByRole("radio", { name: "Claimed" }));
    fireEvent.change(within(list).getByLabelText("Filter by kind"), { target: { value: "" } });
    fireEvent.change(within(list).getByLabelText("Sort by"), { target: { value: "kind-asc" } });
    // B before E, each by UID: the first claimed B is 3.
    expect(within(list).getByText("40 of 120 tokens found")).toBeInTheDocument();
    expect(firstUid(list)).toBe("04000000000003");
    expect(within(list).getByRole("columnheader", { name: "Kind" })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
  });

  it("says so when the filters together match nothing, and clears them", async () => {
    await renderPage();
    const list = await screen.findByRole("region", { name: "Every token" });
    await within(list).findByText("04C9E1A27B3080");

    fireEvent.change(within(list).getByLabelText("Filter by kind"), { target: { value: "none" } });
    await userEvent.click(within(list).getByRole("radio", { name: "Unclaimed" }));

    expect(within(list).getByText(/^0 of \d+ tokens found$/)).toBeInTheDocument();
    expect(
      within(list).getByText(
        "No tokens match. Clear the search, choose another kind or show all owners.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(within(list).getByRole("button", { name: "Clear filters" }));
    expect(within(list).getByRole("radio", { name: "All" })).toBeChecked();
    expect(within(list).getByText("04C9E1A27B3080")).toBeInTheDocument();
  });

  it("keeps the page valid when a release shortens the list", async () => {
    api.mock.data.token_kinds = [];
    api.mock.data.tokens.length = 0;
    for (let i = 0; i < 51; i++) {
      api.mock.data.tokens.push({
        uid: `04${i.toString(16).padStart(12, "0").toUpperCase()}`,
        owner_id: `owner-${i}`,
        claimed_at: "2026-11-06T09:00:00.000Z",
      });
    }
    await renderPage();
    const list = await screen.findByRole("region", { name: "Every token" });
    await within(list).findByText("51 tokens found");
    await userEvent.click(within(list).getByRole("button", { name: "Next" }));

    await userEvent.click(within(list).getByRole("button", { name: "Release 04000000000032" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Release token" }));

    await within(list).findByText("50 tokens found");
    expect(within(list).getAllByRole("row")).toHaveLength(51);
  });
});
