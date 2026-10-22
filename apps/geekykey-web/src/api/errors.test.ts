import { describe, expect, it } from "vitest";

import { ApiError, describeError, isApiErrorCode, NetworkError } from "@/api/errors";
import type { ErrorCode } from "@/api/types";

/** Every code in the union, so a new one cannot be added without a message. */
const CODES: ErrorCode[] = [
  "validation_failed",
  "unauthenticated",
  "invalid_token",
  "forbidden",
  "not_found",
  "token_taken",
  "token_limit_reached",
  "rate_limited",
  "claims_unavailable",
  "login_unavailable",
  "service_unavailable",
  "internal_error",
];

describe("describeError", () => {
  it("gives every error code its own plain-language text", () => {
    for (const code of CODES) {
      const text = describeError(new ApiError(400, code));
      expect(text, `${code} had no text`).toBeTruthy();
      expect(text, `${code} had no text`).not.toContain(code);
      // No em-dash or en-dash in visible text, per the app's copy rules.
      expect(text, `${code} used a dash`).not.toMatch(/[\u2014\u2013]/);
    }
  });

  it("uses the agreement's wording for claims_unavailable", () => {
    // Section 13 names the exact string for the token page, the claim form and My tokens.
    expect(describeError(new ApiError(503, "claims_unavailable"))).toBe(
      "Couldn't reach GeeksHacking. Try again.",
    );
  });

  it("uses the agreement's wording for login_unavailable", () => {
    // Section 13: on login_unavailable, both logins say exactly this.
    expect(describeError(new ApiError(503, "login_unavailable"))).toBe(
      "Couldn't log you in. Try again.",
    );
  });

  it("uses the agreement's wording for invalid_token, the same sentence as login_unavailable", () => {
    // FRO-33 gives both login errors one sentence, so a refused token and an unverifiable
    // one read the same. Ethan approved it on 20 Oct, and BAC-55's pull request adds
    // invalid_token to section 13's login line to match.
    expect(describeError(new ApiError(401, "invalid_token"))).toBe(
      "Couldn't log you in. Try again.",
    );
  });

  it("uses the agreement's wording for token_limit_reached", () => {
    expect(describeError(new ApiError(409, "token_limit_reached"))).toBe(
      "You already have 3 tokens. Release one on My tokens first.",
    );
  });

  it("says a required service is unavailable for the Worker's service_unavailable", () => {
    // Ethan settled the wording on 21 Oct: the Event screens' sentence, which fits these
    // screens too. Section 13 sets no wording for it.
    expect(describeError(new ApiError(503, "service_unavailable"))).toBe(
      "A required service is unavailable. Try again shortly.",
    );
  });

  it("handles a network failure and an unknown error", () => {
    expect(describeError(new NetworkError())).toContain("Could not reach the server");
    expect(describeError(new Error("boom"))).toBe("Something went wrong. Try again.");
    expect(describeError(undefined)).toBe("Something went wrong. Try again.");
  });
});

describe("isApiErrorCode", () => {
  it("matches the code, and only that code", () => {
    const error = new ApiError(503, "claims_unavailable");
    expect(isApiErrorCode(error, "claims_unavailable")).toBe(true);
    expect(isApiErrorCode(error, "rate_limited")).toBe(false);
    expect(isApiErrorCode(new NetworkError(), "claims_unavailable")).toBe(false);
  });
});

describe("ApiError", () => {
  it("carries the status, code and issues", () => {
    const error = new ApiError(400, "validation_failed", [{ path: ["uid"], message: "bad uid" }]);
    expect(error.status).toBe(400);
    expect(error.code).toBe("validation_failed");
    expect(error.issues).toHaveLength(1);
    expect(error.issues[0]?.path).toEqual(["uid"]);
  });
});
