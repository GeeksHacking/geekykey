import type { ApiIssue, ErrorCode } from "@/api/types";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly issues: ApiIssue[];

  constructor(status: number, code: ErrorCode, issues: ApiIssue[] = []) {
    super(code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.issues = issues;
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
      case "rate_limited":
        return "Too many requests. Wait a minute and try again.";
      case "invalid_event_service_key":
        return "The event service key is missing or invalid.";
      case "event_service_unavailable":
      case "claims_unavailable":
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
