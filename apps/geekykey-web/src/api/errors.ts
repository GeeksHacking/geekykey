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

/** Plain-language fallback text for a generic error state. Screens override for specific codes. */
export function describeError(error: unknown): string {
  if (isApiError(error)) {
    switch (error.code) {
      case "validation_failed":
        return "Some of the details are not valid. Check the form and try again.";
      case "unauthenticated":
        return "You are signed out. Sign in again to continue.";
      case "forbidden":
        return "Your account is not allowed to do that.";
      case "not_found":
        return "That was not found. It may have been removed.";
      case "token_taken":
        return "Someone else already claimed this token.";
      case "token_limit_reached":
        return "You already have 3 tokens. Release one on My tokens first.";
      case "rate_limited":
        return "Too many tries. Wait a minute and try again.";
      case "claims_unavailable":
        // Agreement section 13: the token page, the claim form and My tokens say this.
        return "Couldn't reach GeeksHacking. Try again.";
      case "internal_error":
        return "Something went wrong on the server. Try again in a moment.";
    }
  }
  if (error instanceof NetworkError) {
    return "Could not reach the server. Check the Wi-Fi and try again.";
  }
  return "Something went wrong. Try again.";
}
