/*
  Whether this browser's session came from a login link (agreement 7.5). A guest has no Firebase
  sign-in on these screens, so the link is the only thing that says the session is theirs, and a
  sign-out has to warn them and release their tokens (FRO-161). It lives in localStorage because
  the session outlives the page, and it goes when someone signs in here or signs out.

  Without storage nothing is remembered, and the person signs out here as anyone else does.
*/

const ARRIVAL_KEY = "gk-arrived-by-login-link";

export function markArrivedByLoginLink(): void {
  try {
    localStorage.setItem(ARRIVAL_KEY, "1");
  } catch {
    // Nothing can be stored, so a later sign-out can't tell the session came from a link.
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
