/*
  A sign-out whose Firebase call fails is remembered here until the next explicit sign-in.
  Firebase keeps its sign-in per browser and remembers a user longer than the service's
  12-hour session, so without this the next page load would answer 401, read a fresh ID
  token and log the person who just left straight back in (FRO-92).

  It is not part of firebase.ts because the returning login checks it before it loads
  Firebase, which keeps Firebase out of the main bundle (FRO-59).
*/

export const FIREBASE_SIGN_OUT_FAILED_KEY = "gk-firebase-sign-out-failed";

/** Remember that Firebase's sign-out did not finish, so a reload cannot undo the sign-out. */
export function markFirebaseSignOutFailed(): void {
  try {
    localStorage.setItem(FIREBASE_SIGN_OUT_FAILED_KEY, "1");
  } catch {
    // Private mode or storage disabled: this page stays signed out, and the next load has
    // no marker to read.
  }
}

/** Someone signed in again, so the marker has done its job. */
export function clearFirebaseSignOutFailed(): void {
  try {
    localStorage.removeItem(FIREBASE_SIGN_OUT_FAILED_KEY);
  } catch {
    // Nothing can be stored, so there is nothing to clear.
  }
}

/** Whether an earlier page load could not sign out of Firebase. */
export function hasFailedFirebaseSignOut(): boolean {
  try {
    return localStorage.getItem(FIREBASE_SIGN_OUT_FAILED_KEY) !== null;
  } catch {
    return false;
  }
}
