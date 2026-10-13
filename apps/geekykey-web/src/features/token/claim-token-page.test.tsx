import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useParams,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiProvider } from "@/api/provider";
import { NetworkError } from "@/api/errors";
import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { SEEDED_PARTICIPANT_ID } from "@/api/mock/fixtures";
import { RequireSession } from "@/features/auth/require-session";
import { TokenPage } from "@/features/token/token-page";

import { SessionProvider } from "@/lib/session-provider";
import { ThemeProvider } from "@/lib/theme-provider";

/**
 * Claim on the token page, agreement 8.2 and section 13. One test per acceptance case:
 * a new claim, already yours, token_taken, token_limit_reached, rate_limited and
 * claims_unavailable.
 *
 * Every failure is driven by spying on claimToken rather than failNext, because
 * SessionProvider fetches /me on mount and would spend the queued failure first.
 */

const UNCLAIMED = "04E5F7091B3D";
const OWNED_BY_PARTICIPANT = "04A1B2C3D4E5F6";
/** The fixtures give the participant two tokens, so claiming a third reaches the cap. */
const OWNED_BY_SOMEONE_ELSE = "04C3D5F70912";

let api: MockApiClient;

beforeEach(() => {
  api = createMockClient({ latencyMs: [0, 0], storage: null });
  api.mock.setSession(SEEDED_PARTICIPANT_ID);
});

function GatedTokenPage() {
  const { uid = "" } = useParams({ strict: false });
  return (
    <RequireSession>
      <TokenPage uid={uid} />
    </RequireSession>
  );
}

/** The page in a router, because the limit message links to My tokens. */
function renderAt(uid: string) {
  // A client per render, with no retry delay on queries or mutations. Shared across tests
  // it would carry the first test's claim into the next, and a one-second backoff would
  // outlast the transport test's expect timeout.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0, staleTime: 5_000 },
      mutations: { retryDelay: 0 },
    },
  });
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const token = createRoute({
    getParentRoute: () => rootRoute,
    path: "/t/$uid",
    component: GatedTokenPage,
  });
  const home = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <p>My tokens page</p>,
  });
  const login = createRoute({
    getParentRoute: () => rootRoute,
    path: "/login",
    component: () => <p>Login page</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([token, home, login]),
    history: createMemoryHistory({ initialEntries: [`/t/${uid}`] }),
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
  return { router };
}

describe("claiming a token on the token page", () => {
  it("offers Claim only while nobody owns the token", async () => {
    renderAt(UNCLAIMED);
    expect(await screen.findByRole("button", { name: "Claim" })).toBeInTheDocument();
    expect(screen.getByText("Nobody has claimed this token yet.")).toBeInTheDocument();
  });

  it("claims a free token and shows it as yours, with no owner named", async () => {
    renderAt(UNCLAIMED);
    await userEvent.click(await screen.findByRole("button", { name: "Claim" }));

    expect(await screen.findByText("This is your token.")).toBeInTheDocument();
    expect(screen.getByText(/^Claimed /)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Claim" })).not.toBeInTheDocument();
  });

  it("sends the normalised UID, and refreshes the token lookup and /me", async () => {
    const claimToken = vi.spyOn(api, "claimToken");
    const me = vi.spyOn(api, "me");
    renderAt("04:e5:f7:09:1b:3d");
    await userEvent.click(await screen.findByRole("button", { name: "Claim" }));

    await screen.findByText("This is your token.");
    expect(claimToken).toHaveBeenCalledWith(UNCLAIMED);
    // The ticket asks for both refreshed, since a claim changes what /me holds.
    await waitFor(() => expect(me.mock.calls.length).toBeGreaterThan(1));
  });

  it("shows your own token unchanged when it is already yours", async () => {
    // 8.2 answers 200 for a token already yours. The fixtures give the participant two
    // tokens, so this is under the cap; the at-cap case is the next test.
    const claimedBefore = api.mock.data.tokens.find(
      (token) => token.uid === OWNED_BY_PARTICIPANT,
    )?.claimed_at;

    renderAt(OWNED_BY_PARTICIPANT);
    await screen.findByText("This is your token.");

    // No button on this view, so the only way to exercise 200 is through the client.
    await expect(api.claimToken(OWNED_BY_PARTICIPANT)).resolves.toMatchObject({
      uid: OWNED_BY_PARTICIPANT,
      claimed_at: claimedBefore,
    });
    expect(
      api.mock.data.tokens.find((token) => token.uid === OWNED_BY_PARTICIPANT)?.claimed_at,
    ).toBe(claimedBefore);
  });

  it("answers 200 for a token already yours even at the cap, with no exemption needed", async () => {
    // Agreement 8.2 as amended on 13 Oct: "a token already among them answers 200 as
    // already yours, whatever the count". So the cap check cannot come first, or a full
    // holder could not re-claim what they already hold. Spec 4's "no exemption for anyone"
    // means the cap has no exemption, not that 200 does.
    const claimedBefore = api.mock.data.tokens.find(
      (token) => token.uid === OWNED_BY_PARTICIPANT,
    )?.claimed_at;
    api.mock.data.tokens.push({
      uid: "04AABBCCDDEEFF",
      owner_id: SEEDED_PARTICIPANT_ID,
      claimed_at: null,
    });
    expect(
      api.mock.data.tokens.filter((token) => token.owner_id === SEEDED_PARTICIPANT_ID).length,
    ).toBe(3);

    await expect(api.claimToken(OWNED_BY_PARTICIPANT)).resolves.toMatchObject({
      uid: OWNED_BY_PARTICIPANT,
      claimed_at: claimedBefore,
    });
  });

  it("disables the button while the claim is in flight", async () => {
    const slow = createMockClient({ latencyMs: [150, 150], storage: null });
    slow.mock.setSession(SEEDED_PARTICIPANT_ID);
    api = slow;
    const claimToken = vi.spyOn(api, "claimToken");

    renderAt(UNCLAIMED);
    const button = await screen.findByRole("button", { name: "Claim" });
    await userEvent.click(button);

    const busy = await screen.findByRole("button", { name: "Claiming" });
    expect(busy).toBeDisabled();
    // A second tap must not send a second claim.
    await userEvent.click(busy);
    await screen.findByText("This is your token.");
    expect(claimToken).toHaveBeenCalledTimes(1);
  });

  it("says someone else claimed it, and keeps that sentence over a fresh lookup", async () => {
    // Agreement 13: the error names no owner, so the page shows what 8.5 answers under it.
    // Here the lookup agrees, so both say the same thing.
    vi.spyOn(api, "claimToken").mockRejectedValue(
      new (await import("@/api/errors")).ApiError(409, "token_taken"),
    );
    renderAt(UNCLAIMED);
    await userEvent.click(await screen.findByRole("button", { name: "Claim" }));

    expect(await screen.findByText("Someone else already claimed this token.")).toBeInTheDocument();
    expect(screen.getByText("Nobody has claimed this token yet.")).toBeInTheDocument();
    // The button stays, so a retry is possible once the token is free again.
    expect(screen.getByRole("button", { name: "Claim" })).toBeInTheDocument();
  });

  it("keeps the sentence when the fresh lookup says nobody, so a lost claim is still shown", async () => {
    // The case section 13 calls out: claimed and released between the failure and the
    // lookup, so the two disagree. The sentence wins.
    const { ApiError } = await import("@/api/errors");
    vi.spyOn(api, "claimToken").mockRejectedValue(new ApiError(409, "token_taken"));
    renderAt(UNCLAIMED);
    await userEvent.click(await screen.findByRole("button", { name: "Claim" }));

    await screen.findByText("Someone else already claimed this token.");
    expect(screen.getByText("Nobody has claimed this token yet.")).toBeInTheDocument();

    // Acceptance criterion: the sentence stays *above* the view the lookup produced, so
    // the order is asserted rather than the two merely coexisting.
    const sentence = screen.getByText("Someone else already claimed this token.");
    const claimView = screen.getByText("Nobody has claimed this token yet.");
    const position = sentence.compareDocumentPosition(claimView);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING, "sentence should precede the view").toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    // And Claim is still offered, since the token may be free again.
    expect(screen.getByRole("button", { name: "Claim" })).toBeInTheDocument();
  });

  it("shows the belongs-to-someone-else view when the lookup agrees it was taken", async () => {
    const { ApiError } = await import("@/api/errors");
    const claimToken = vi.spyOn(api, "claimToken");
    // The token is taken at the moment the claim fails, which is what the service does. The
    // hook then refetches 8.5 on token_taken, so this lookup answers someone_else.
    claimToken.mockImplementationOnce(async () => {
      api.mock.data.tokens.find((token) => token.uid === UNCLAIMED)!.owner_id = "p_1041";
      throw new ApiError(409, "token_taken");
    });

    renderAt(UNCLAIMED);
    await userEvent.click(await screen.findByRole("button", { name: "Claim" }));

    expect(await screen.findByText("Someone else already claimed this token.")).toBeInTheDocument();
    expect(await screen.findByText("This token belongs to someone else.")).toBeInTheDocument();
    // The owner's ID must not appear, 8.5 only sends it to a GeekyKey admin.
    expect(document.body.textContent).not.toMatch(/p_1041/);
  });

  it("gives the 3-token cap its fixed wording and a link to My tokens", async () => {
    // Agreement 13 fixes this sentence. The participant holds 2 fixtures, so a third claim
    // reaches the cap and a fourth attempt trips it.
    const { ApiError } = await import("@/api/errors");
    vi.spyOn(api, "claimToken").mockRejectedValue(new ApiError(409, "token_limit_reached"));

    renderAt(UNCLAIMED);
    await userEvent.click(await screen.findByRole("button", { name: "Claim" }));

    expect(await screen.findByText(/You already have 3 tokens\./)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Release one on My tokens" });
    expect(link).toHaveAttribute("href", "/");
  });

  it("lets the cap win over token_taken, in the order 8.2 fixes", async () => {
    // The service checks the limit before the owner, so a user at the cap hears about the
    // cap even for someone else's token. The screen only reflects what it is told.
    const { ApiError } = await import("@/api/errors");
    api.mock.data.tokens.push({
      uid: "04AABBCCDDEEFF",
      owner_id: SEEDED_PARTICIPANT_ID,
      claimed_at: null,
    });
    expect(
      api.mock.data.tokens.filter((token) => token.owner_id === SEEDED_PARTICIPANT_ID).length,
    ).toBe(3);

    // Through the mock, at the cap, on someone else's token.
    await expect(api.claimToken(OWNED_BY_SOMEONE_ELSE)).rejects.toMatchObject({
      code: "token_limit_reached",
    });

    // And the same via the screen, with the service reporting that.
    vi.spyOn(api, "claimToken").mockRejectedValue(new ApiError(409, "token_limit_reached"));
    renderAt(UNCLAIMED);
    await userEvent.click(await screen.findByRole("button", { name: "Claim" }));
    expect(await screen.findByText(/You already have 3 tokens\./)).toBeInTheDocument();
    expect(screen.queryByText("Someone else already claimed this token.")).not.toBeInTheDocument();
  });

  it("uses agreement 13's rate_limited wording, and retries the claim", async () => {
    const { ApiError } = await import("@/api/errors");
    const claimToken = vi.spyOn(api, "claimToken");
    claimToken.mockRejectedValueOnce(new ApiError(429, "rate_limited"));

    renderAt(UNCLAIMED);
    await userEvent.click(await screen.findByRole("button", { name: "Claim" }));

    expect(
      await screen.findByText("Too many tries. Wait a minute and try again."),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByText("This is your token.")).toBeInTheDocument();
  });

  it("uses agreement 13's claims_unavailable wording, and retries", async () => {
    const { ApiError } = await import("@/api/errors");
    const claimToken = vi.spyOn(api, "claimToken");
    claimToken.mockRejectedValueOnce(new ApiError(503, "claims_unavailable"));

    renderAt(UNCLAIMED);
    await userEvent.click(await screen.findByRole("button", { name: "Claim" }));

    expect(await screen.findByText("Couldn't reach GeeksHacking. Try again.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByText("This is your token.")).toBeInTheDocument();
  });

  it("recovers from a transport failure without the user retrying", async () => {
    // Only a NetworkError is retried, and only twice. A phone on venue Wi-Fi drops
    // constantly, so one dropped request should not show an error at all.
    const claimToken = vi.spyOn(api, "claimToken");
    claimToken.mockRejectedValueOnce(new NetworkError("Could not reach the server"));

    renderAt(UNCLAIMED);
    await userEvent.click(await screen.findByRole("button", { name: "Claim" }));

    expect(await screen.findByText("This is your token.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the usual error with a retry for anything else", async () => {
    const { ApiError } = await import("@/api/errors");
    vi.spyOn(api, "claimToken").mockRejectedValue(
      new ApiError(400, "validation_failed", [{ path: ["uid"], message: "bad uid" }]),
    );

    renderAt(UNCLAIMED);
    await userEvent.click(await screen.findByRole("button", { name: "Claim" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't claim this token");
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
