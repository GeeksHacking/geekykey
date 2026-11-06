/*
  Whether this browser's session came from a login link (agreement 7.4), which only the GeekyKey
  screens know the rest of. A guest has only ever arrived that way, so these screens send that
  person there to sign out, where their tokens can be released (FRO-131). It lives in localStorage
  because the session outlives the page, and it goes when someone logs in here or signs out.

  Without storage nothing is remembered, and the person signs out here as anyone else does.
*/

const ARRIVAL_KEY = "gk-arrived-by-login-link";

export function markArrivedByLoginLink(): void {
  try {
    localStorage.setItem(ARRIVAL_KEY, "1");
  } catch {
    // Nothing can be stored, so the sign-out stays on these screens.
  }
}

export function clearArrivedByLoginLink(): void {
  try {
    localStorage.removeItem(ARRIVAL_KEY);
  } catch {
    // Nothing can be stored, so there is nothing to clear.
  }
}

export function arrivedByLoginLink(): boolean {
  try {
    return localStorage.getItem(ARRIVAL_KEY) !== null;
  } catch {
    return false;
  }
}
