import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockClient, type MockApiClient } from "@/api/mock/client";
import { FirebaseSignIn } from "@/features/auth/firebase-sign-in";
import { useSession } from "@/lib/session";
import { createTestProviders } from "@/test/providers";

const {
  signInWithGoogle,
  signInWithGeeksHacking,
  signInAsGuest,
  hasFirebaseConfig,
  geekshackingEnabled,
} = vi.hoisted(() => ({
  signInWithGoogle: vi.fn(),
  signInWithGeeksHacking: vi.fn(),
  signInAsGuest: vi.fn(),
  hasFirebaseConfig: vi.fn(),
  geekshackingEnabled: { value: false },
}));

vi.mock("@firebase/app", () => ({ initializeApp: vi.fn(() => ({ name: "app" })) }));
vi.mock("@firebase/auth", () => ({
  getAuth: vi.fn(() => ({ name: "auth" })),
  GoogleAuthProvider: vi.fn(),
  OAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
  signInAnonymously: vi.fn(),
  signOut: vi.fn(),
}));

/*
  The module is the only thing that talks to Firebase, so the test drives the screen
  through it: the SDK is mocked, the module's own rules (isPopupClosed, the provider
  switch) are the real ones.
*/
vi.mock("@/lib/firebase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/firebase")>();
  return {
    ...actual,
    signInWithGoogle,
    signInWithGeeksHacking,
    signInAsGuest,
    hasFirebaseConfig,
    get GEEKSHACKING_PROVIDER_ENABLED() {
      return geekshackingEnabled.value;
    },
  };
});

/** The session's state, so a test can see that the sign-in reached the service. */
function SessionProbe() {
  const session = useSession();
  return <p>session: {session.status}</p>;
}

function renderSignIn() {
  const api: MockApiClient = createMockClient({ latencyMs: [0, 0], storage: null });
  const { Providers } = createTestProviders(api, { session: true });
  render(
    <Providers>
      <FirebaseSignIn />
      <SessionProbe />
    </Providers>,
  );
  return { api };
}

beforeEach(() => {
  signInWithGoogle.mockReset();
  signInWithGeeksHacking.mockReset();
  signInAsGuest.mockReset();
  hasFirebaseConfig.mockReset();
  hasFirebaseConfig.mockReturnValue(true);
  geekshackingEnabled.value = false;
  signInWithGoogle.mockResolvedValue("id-token");
  signInWithGeeksHacking.mockResolvedValue("id-token");
  signInAsGuest.mockResolvedValue("guest-id-token");
});

describe("the Firebase sign-in buttons", () => {
  it("signs in with Google and sends the ID token to the service", async () => {
    const user = userEvent.setup();
    const { api } = renderSignIn();

    await user.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => expect(screen.getByText("session: authenticated")).toBeInTheDocument());
    expect(signInWithGoogle).toHaveBeenCalled();
    // The mock signs in as the seeded participant, and the screens read /me as usual.
    await expect(api.me()).resolves.toMatchObject({ user: { id: "dev-user-1" } });
  });

  it("offers to continue as a guest, with section 13's line under it", () => {
    renderSignIn();

    expect(screen.getByRole("button", { name: "Continue as guest" })).toBeEnabled();
    expect(
      screen.getByText("No account needed. Keep using this phone and browser."),
    ).toBeInTheDocument();
  });

  it("signs in as a guest and sends the ID token to the service", async () => {
    const user = userEvent.setup();
    const { api } = renderSignIn();

    await user.click(screen.getByRole("button", { name: "Continue as guest" }));

    await waitFor(() => expect(screen.getByText("session: authenticated")).toBeInTheDocument());
    expect(signInAsGuest).toHaveBeenCalled();
    // On the mock, a guest is the seeded participant.
    await expect(api.me()).resolves.toMatchObject({ user: { id: "dev-user-1" } });
  });

  it("disables the guest button while a guest sign-in runs", async () => {
    const user = userEvent.setup();
    let release: (token: string) => void = () => {};
    signInAsGuest.mockReturnValue(
      new Promise<string>((resolve) => {
        release = resolve;
      }),
    );
    renderSignIn();

    await user.click(screen.getByRole("button", { name: "Continue as guest" }));

    expect(screen.getByRole("button", { name: "Continue as guest" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeDisabled();
    release("guest-id-token");
  });

  it("shows the agreement's sentence when the service refuses a guest's token", async () => {
    const user = userEvent.setup();
    const { api } = renderSignIn();
    await screen.findByText("session: anonymous");
    api.mock.failNext("invalid_token");

    await user.click(screen.getByRole("button", { name: "Continue as guest" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't log you in. Try again.");
  });

  it("does not offer GeeksHacking's login while its provider is not set up", () => {
    renderSignIn();

    expect(screen.queryByRole("button", { name: "Continue with GeeksHacking" })).toBeNull();
  });

  it("offers GeeksHacking's login once its provider is set up", async () => {
    geekshackingEnabled.value = true;
    const user = userEvent.setup();
    renderSignIn();

    await user.click(screen.getByRole("button", { name: "Continue with GeeksHacking" }));

    await waitFor(() => expect(signInWithGeeksHacking).toHaveBeenCalled());
  });

  it("disables the buttons while a sign-in runs, so a second popup cannot cancel the first", async () => {
    const user = userEvent.setup();
    let release: (token: string) => void = () => {};
    signInWithGoogle.mockReturnValue(
      new Promise<string>((resolve) => {
        release = resolve;
      }),
    );
    renderSignIn();

    await user.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeDisabled();
    release("id-token");
  });

  it("says nothing when the user closes the popup", async () => {
    const user = userEvent.setup();
    let closePopup: (error: unknown) => void = () => {};
    signInWithGoogle.mockReturnValue(
      new Promise<string>((_, reject) => {
        closePopup = reject;
      }),
    );
    renderSignIn();
    const button = screen.getByRole("button", { name: "Continue with Google" });

    await user.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    closePopup({ code: "auth/popup-closed-by-user" });
    await waitFor(() => expect(button).toBeEnabled());

    // A popup the user closed is not a failure, so there is nothing to say about it.
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the agreement's sentence when the service refuses the token", async () => {
    const user = userEvent.setup();
    const { api } = renderSignIn();
    // The session asks /me first, so wait for that to settle before the login is the call
    // that fails.
    await screen.findByText("session: anonymous");
    api.mock.failNext("invalid_token");

    await user.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't log you in. Try again.");
  });

  it("shows the same sentence when Google's keys could not be fetched", async () => {
    const user = userEvent.setup();
    const { api } = renderSignIn();
    await screen.findByText("session: anonymous");
    api.mock.failNext("login_unavailable");

    await user.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't log you in. Try again.");
  });

  it("says the sign-in is not set up in this build, and offers nothing to press", () => {
    hasFirebaseConfig.mockReturnValue(false);
    renderSignIn();

    expect(screen.getByText("Sign-in is not set up in this build.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Continue as guest" })).toBeDisabled();
  });
});
