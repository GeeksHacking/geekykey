import { initializeApp, type FirebaseApp } from "@firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut as signOutOfFirebaseAuth,
  type Auth,
  type User,
  type UserCredential,
} from "@firebase/auth";

/**
 * Firebase's web config for the showcase (agreement 7.2). It comes from the build, under the
 * four names in the runbook's step 13: VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN,
 * VITE_FIREBASE_PROJECT_ID and VITE_FIREBASE_APP_ID. None of it is secret: the API key only
 * names the project, and Firebase allows sign-in only from localhost,
 * key.geekshacking.com and event.geekshacking.com.
 */
const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/**
 * The GeeksHacking login, an OpenID Connect provider inside Firebase. It is turned on once
 * Qing Guan's client is in the project and Mr Pang has agreed to offer it, and turned off
 * again if he says no (ADR 0004). The provider lives in Firebase, so one line here is all it
 * takes to offer it or to drop it.
 */
export const GEEKSHACKING_PROVIDER_ENABLED = false;

const GEEKSHACKING_PROVIDER_ID = "oidc.geekshacking";

let app: FirebaseApp | undefined;
let auth: Auth | undefined;

/** One Firebase app and one auth instance for the page. */
function firebaseAuth(): Auth {
  app ??= initializeApp(FIREBASE_CONFIG);
  auth ??= getAuth(app);
  return auth;
}

/** The ID token the service checks (agreement 7.2). */
function idTokenFrom(credential: UserCredential): Promise<string> {
  return credential.user.getIdToken();
}

/** Sign in with Google. The popup is Google's window, opened over ours. */
export function signInWithGoogle(): Promise<string> {
  return signInWithPopup(firebaseAuth(), new GoogleAuthProvider()).then(idTokenFrom);
}

/** Sign in with GeeksHacking's own login, inside Firebase as an OIDC provider. */
export function signInWithGeeksHacking(): Promise<string> {
  const provider = new OAuthProvider(GEEKSHACKING_PROVIDER_ID);
  return signInWithPopup(firebaseAuth(), provider).then(idTokenFrom);
}

/**
 * Sign in as a guest, with Firebase's anonymous sign-in: no popup and no account (agreement
 * 7.2). The guest lives in this browser, so the GeekyKey screens sign them back in by
 * themselves rather than make a second guest (see savedUserIdToken).
 */
export function signInAsGuest(): Promise<string> {
  return signInAnonymously(firebaseAuth()).then(idTokenFrom);
}

/**
 * The ID token of the user Firebase remembers in this browser, or null if it remembers
 * nobody. Firebase keeps its sign-in longer than the service's 12-hour session, so the
 * GeekyKey screens use this to log a returning user in again without the login (agreement
 * 7.2). A build with no config has no Firebase to remember anyone.
 */
export async function savedUserIdToken(): Promise<string | null> {
  const user = await savedUser();
  // A fresh token, as 7.2 asks, rather than one Firebase cached an hour ago.
  return user ? user.getIdToken(true) : null;
}

/**
 * Whether the user Firebase remembers in this browser signed in as a guest. A guest who signs
 * out can't sign in as the same guest again, so the GeekyKey screens ask them first (agreement
 * 13). A build with no config has no Firebase, so it has no guests either.
 */
export async function isSignedInAsGuest(): Promise<boolean> {
  const user = await savedUser();
  return user?.isAnonymous ?? false;
}

/** The user Firebase remembers in this browser, or null. */
function savedUser(): Promise<User | null> {
  if (!hasFirebaseConfig()) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    // Firebase reports the saved user once it has read it from the browser, which is why
    // this listens rather than reading `currentUser`, which is null until then.
    const unsubscribe = onAuthStateChanged(
      firebaseAuth(),
      (user) => {
        unsubscribe();
        resolve(user);
      },
      reject,
    );
  });
}

/**
 * Whether the build carries the config Firebase needs. A build without it has no Firebase
 * to sign in to, so there is no Firebase session to end and no sign-in to offer.
 */
export function hasFirebaseConfig(): boolean {
  return Boolean(
    FIREBASE_CONFIG.apiKey &&
    FIREBASE_CONFIG.authDomain &&
    FIREBASE_CONFIG.projectId &&
    FIREBASE_CONFIG.appId,
  );
}

/**
 * The Firebase error codes for a popup the user closed, which is not a failure. Agreement
 * 7.2 names the second one: a second popup cancels the first.
 */
const POPUP_CLOSED_CODES: ReadonlySet<string> = new Set([
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
]);

/** Whether the error is a popup the user closed, so there is nothing to report. */
export function isPopupClosed(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && POPUP_CLOSED_CODES.has(code);
}

/**
 * Agreement 7.3: the screens also sign out of Firebase, so a shared device does not stay
 * signed in to Firebase. A build with no config has no Firebase session to end, so there is
 * nothing to do there.
 */
export function signOutOfFirebase(): Promise<void> {
  if (!hasFirebaseConfig()) return Promise.resolve();
  return signOutOfFirebaseAuth(firebaseAuth());
}
