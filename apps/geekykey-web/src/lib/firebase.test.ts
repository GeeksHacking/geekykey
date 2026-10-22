import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuth,
  signInWithPopup,
  signInAnonymously,
  onAuthStateChanged,
  signOut,
  GoogleAuthProvider,
  OAuthProvider,
} = vi.hoisted(() => ({
  getAuth: vi.fn(() => ({ name: "auth" })),
  signInWithPopup: vi.fn(),
  signInAnonymously: vi.fn(),
  onAuthStateChanged: vi.fn(),
  signOut: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  OAuthProvider: vi.fn(),
}));

vi.mock("firebase/app", () => ({ initializeApp: vi.fn(() => ({ name: "app" })) }));
vi.mock("firebase/auth", () => ({
  getAuth,
  signInWithPopup,
  signInAnonymously,
  onAuthStateChanged,
  signOut,
  GoogleAuthProvider,
  OAuthProvider,
}));

/** Firebase reports the user it remembers once, on a later tick, the way the SDK does. */
function firebaseRemembers(
  user: { getIdToken: (forceRefresh?: boolean) => Promise<string> } | null,
) {
  const unsubscribe = vi.fn();
  onAuthStateChanged.mockImplementation((_auth: unknown, next: (u: typeof user) => void) => {
    queueMicrotask(() => next(user));
    return unsubscribe;
  });
  return unsubscribe;
}

/** The four names the runbook's step 13 gives Julian, with the values of agreement 7.2. */
const CONFIG = {
  VITE_FIREBASE_API_KEY: "api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "geekykey-b035a.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "geekykey-b035a",
  VITE_FIREBASE_APP_ID: "app-id",
};

const NO_CONFIG = {
  VITE_FIREBASE_API_KEY: undefined,
  VITE_FIREBASE_AUTH_DOMAIN: undefined,
  VITE_FIREBASE_PROJECT_ID: undefined,
  VITE_FIREBASE_APP_ID: undefined,
};

/** The module reads the config when it loads, so each case loads its own copy. */
async function loadModule(config: Record<string, string | undefined> = CONFIG) {
  vi.resetModules();
  for (const name of Object.keys(CONFIG)) {
    vi.stubEnv(name, config[name]);
  }
  return await import("@/lib/firebase");
}

beforeEach(() => {
  vi.unstubAllEnvs();
  getAuth.mockClear();
  signInWithPopup.mockReset();
  signInAnonymously.mockReset();
  onAuthStateChanged.mockReset();
  signOut.mockReset();
});

describe("the Firebase module", () => {
  it("says the build has no Firebase when the config is missing", async () => {
    const firebase = await loadModule(NO_CONFIG);
    expect(firebase.hasFirebaseConfig()).toBe(false);
  });

  it("says the build has Firebase when the four variables are there", async () => {
    const firebase = await loadModule();
    expect(firebase.hasFirebaseConfig()).toBe(true);
  });

  it("does not touch Firebase when there is no config to sign out of", async () => {
    const firebase = await loadModule(NO_CONFIG);
    await firebase.signOutOfFirebase();
    // getAuth asserts the API key, so asking for it without one would throw.
    expect(getAuth).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("signs out of Firebase when the build has a config", async () => {
    const firebase = await loadModule();
    await firebase.signOutOfFirebase();
    expect(signOut).toHaveBeenCalled();
  });

  it("signs in with Google and hands back the ID token", async () => {
    const firebase = await loadModule();
    signInWithPopup.mockResolvedValue({
      user: { getIdToken: () => Promise.resolve("id-token") },
    });

    await expect(firebase.signInWithGoogle()).resolves.toBe("id-token");
    expect(GoogleAuthProvider).toHaveBeenCalled();
  });

  it("signs in with GeeksHacking's own login, as an OpenID Connect provider", async () => {
    const firebase = await loadModule();
    signInWithPopup.mockResolvedValue({
      user: { getIdToken: () => Promise.resolve("id-token") },
    });

    await expect(firebase.signInWithGeeksHacking()).resolves.toBe("id-token");
    // The provider's id is Firebase's, and the runbook's step 12 sets it up under it.
    expect(OAuthProvider).toHaveBeenCalledWith("oidc.geekshacking");
  });

  it("signs in as a guest, with Firebase's anonymous sign-in", async () => {
    const firebase = await loadModule();
    signInAnonymously.mockResolvedValue({
      user: { getIdToken: () => Promise.resolve("guest-id-token") },
    });

    await expect(firebase.signInAsGuest()).resolves.toBe("guest-id-token");
    expect(signInWithPopup).not.toHaveBeenCalled();
  });

  it("hands back the ID token of the user Firebase remembers in this browser", async () => {
    const firebase = await loadModule();
    const getIdToken = vi.fn(() => Promise.resolve("saved-id-token"));
    const unsubscribe = firebaseRemembers({ getIdToken });

    await expect(firebase.savedUserIdToken()).resolves.toBe("saved-id-token");
    // Agreement 7.2 asks for a fresh token, not the one Firebase cached.
    expect(getIdToken).toHaveBeenCalledWith(true);
    // One answer is all it needs, so it stops listening.
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("hands back null when Firebase remembers nobody", async () => {
    const firebase = await loadModule();
    firebaseRemembers(null);

    await expect(firebase.savedUserIdToken()).resolves.toBeNull();
  });

  it("hands back null without touching Firebase when there is no config", async () => {
    const firebase = await loadModule(NO_CONFIG);

    await expect(firebase.savedUserIdToken()).resolves.toBeNull();
    expect(getAuth).not.toHaveBeenCalled();
  });

  it("tells a popup the user closed from a failure", async () => {
    const firebase = await loadModule();

    expect(firebase.isPopupClosed({ code: "auth/popup-closed-by-user" })).toBe(true);
    // Agreement 7.2: a second popup cancels the first.
    expect(firebase.isPopupClosed({ code: "auth/cancelled-popup-request" })).toBe(true);
    expect(firebase.isPopupClosed({ code: "auth/popup-blocked" })).toBe(false);
    expect(firebase.isPopupClosed(new Error("boom"))).toBe(false);
    expect(firebase.isPopupClosed(undefined)).toBe(false);
  });
});
