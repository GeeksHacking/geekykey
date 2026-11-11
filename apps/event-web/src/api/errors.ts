import type { ApiIssue, ErrorCode } from "@/api/types";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly issues: ApiIssue[];
  /** With `too_few_participants`, how many more must join before Allocate can run. */
  readonly needed: number | null;

  constructor(
    status: number,
    code: ErrorCode,
    issues: ApiIssue[] = [],
    needed: number | null = null,
  ) {
    super(code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.issues = issues;
    this.needed = needed;
  }
}

export class NetworkError extends Error {
  constructor(message = "Could not reach the server") {
    super(message);
    this.name = "NetworkError";
  }
}

export const AUTH_ERROR_EVENT = "geekykey:auth-error";

export function publishAuthError(error: unknown): void {
  // The session provider owns the global reaction; individual forms still receive the same error.
  if (!isApiErrorCode(error, "unauthenticated") && !isApiErrorCode(error, "forbidden")) return;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AUTH_ERROR_EVENT, { detail: error }));
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isApiErrorCode(error: unknown, code: ErrorCode): boolean {
  return isApiError(error) && error.code === code;
}

/** Agreement section 13: what the Event screens say on invalid_login_link. */
export const LOGIN_LINK_EXPIRED = "That link has expired. Tap your token again to get back in.";

/** How many more people too_few_participants needs, as words that fit the count. */
function morePeople(needed: number | null): string {
  if (needed === null) return "more people";
  return needed === 1 ? "1 more person" : `${needed} more people`;
}

/**
 * What too_few_participants says, ending with the button to press again: Allocate under the
 * header, or Split in the Make groups dialog, where pressing Allocate next would find no groups.
 */
export function tooFewParticipantsMessage(needed: number | null, button: "Allocate" | "Split") {
  return `Each group needs at least 2 people. Wait for ${morePeople(needed)} to join, then press ${button} again.`;
}

/** Plain-language fallback text for a generic error state. Screens override for specific codes. */
export function describeError(error: unknown): string {
  if (isApiError(error)) {
    switch (error.code) {
      case "validation_failed":
        return "Some of the details are not valid. Check the form and try again.";
      case "unauthenticated":
        return "You are signed out. Sign in again to continue.";
      case "invalid_token":
        // The token sent to log in cannot be trusted. FRO-33 gives both login errors the
        // same sentence, and BAC-55's pull request adds invalid_token to section 13's login
        // line to match.
        return "Couldn't log you in. Try again.";
      case "invalid_login_link":
        return LOGIN_LINK_EXPIRED;
      case "forbidden":
        return "Your account is not allowed to do that.";
      case "not_found":
        return "That was not found. It may have been removed.";
      case "answers_fixed":
        return "You've connected, so your answers are set.";
      case "name_taken":
        return "Another group has this name. Choose a different one.";
      case "no_groups":
        return "Make groups first, then press Allocate.";
      case "too_few_participants":
        return tooFewParticipantsMessage(error.needed, "Allocate");
      case "groups_exist":
        return "People are in groups already, so nothing changed. Press Reset to empty the groups, then make groups again.";
      // The reaction test reads /me again after either, which shows the play or the miss.
      case "station_has_taps":
        return "Taps here have already counted, so this station's game can't change until the data is cleared.";
      case "already_played":
        return "You've already played this one.";
      case "too_late":
        return "The 2 minutes to play are up.";
      case "rate_limited":
        return "Too many requests. Wait a minute and try again.";
      case "invalid_event_service_key":
        return "The event service key is missing or invalid.";
      // service_unavailable is what the Worker in front of the screens answers when the
      // service behind it gave no answer at all (agreement section 2). Section 13 sets no
      // wording for it, and Ethan settled on this sentence on 21 Oct.
      case "event_service_unavailable":
      case "claims_unavailable":
      case "service_unavailable":
        return "A required service is unavailable. Try again shortly.";
      case "login_unavailable":
        // Agreement section 13: on login_unavailable, both logins say exactly this.
        return "Couldn't log you in. Try again.";
      case "missing_station_key":
      case "invalid_station_key":
        return "The station key is missing or invalid.";
      case "internal_error":
        return "Something went wrong on the server. Try again in a moment.";
    }
  }
  if (error instanceof NetworkError) {
    return "Could not reach the server. Check the Wi-Fi and try again.";
  }
  return "Something went wrong. Try again.";
}
