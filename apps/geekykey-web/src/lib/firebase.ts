import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signOut as signOutOfFirebaseAuth,
  type Auth,
  type UserCredential,
} from "firebase/auth";

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
 * Agreement 7.3: the screens also sign out of Firebase, so a shared device does not stay
 * signed in to Firebase. A build with no config has no Firebase session to end, so there is
 * nothing to do there.
 */
export function signOutOfFirebase(): Promise<void> {
  if (!hasFirebaseConfig()) return Promise.resolve();
  return signOutOfFirebaseAuth(firebaseAuth());
}
