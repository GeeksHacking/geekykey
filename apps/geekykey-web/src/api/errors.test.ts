import { describe, expect, it } from "vitest";

import { ApiError, describeError, isApiErrorCode, NetworkError } from "@/api/errors";
import type { ErrorCode } from "@/api/types";

/** Every code in the union, so a new one cannot be added without a message. */
const CODES: ErrorCode[] = [
  "validation_failed",
  "unauthenticated",
  "forbidden",
  "not_found",
  "token_taken",
  "token_limit_reached",
  "rate_limited",
  "claims_unavailable",
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

  it("uses the agreement's wording for token_limit_reached", () => {
    expect(describeError(new ApiError(409, "token_limit_reached"))).toBe(
      "You already have 3 tokens. Release one on My tokens first.",
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
