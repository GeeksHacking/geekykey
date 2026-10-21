import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuth, signInWithPopup, signOut, GoogleAuthProvider, OAuthProvider } = vi.hoisted(() => ({
  getAuth: vi.fn(() => ({ name: "auth" })),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  OAuthProvider: vi.fn(),
}));

vi.mock("firebase/app", () => ({ initializeApp: vi.fn(() => ({ name: "app" })) }));
vi.mock("firebase/auth", () => ({
  getAuth,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
  OAuthProvider,
}));

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
});
