import { describe, expect, it } from "vitest";

import { ApiError, describeError } from "@/api/errors";
import type { ErrorCode } from "@/api/types";

/** Every code in the union, so a new one cannot be added without a message. */
const CODES: ErrorCode[] = [
  "validation_failed",
  "unauthenticated",
  "invalid_token",
  "missing_station_key",
  "invalid_station_key",
  "forbidden",
  "not_found",
  "rate_limited",
  "invalid_event_service_key",
  "event_service_unavailable",
  "claims_unavailable",
  "login_unavailable",
  "service_unavailable",
  "internal_error",
];

describe("API error messages", () => {
  it("explains service and rate-limit errors", () => {
    expect(describeError(new ApiError(429, "rate_limited"))).toContain("Too many requests");
    expect(describeError(new ApiError(503, "event_service_unavailable"))).toContain("service");
    expect(describeError(new ApiError(503, "claims_unavailable"))).toContain("service");
  });

  it("says the same thing for the Worker's service_unavailable", () => {
    // Ethan settled the wording on 21 Oct: this sentence, which the GeekyKey screens
    // use too. Section 13 sets no wording for it.
    expect(describeError(new ApiError(503, "service_unavailable"))).toBe(
      "A required service is unavailable. Try again shortly.",
    );
  });

  it("gives every error code its own plain-language text", () => {
    for (const code of CODES) {
      const text = describeError(new ApiError(400, code));
      expect(text, `${code} had no text`).toBeTruthy();
      expect(text, `${code} had no text`).not.toContain(code);
      // No em-dash or en-dash in visible text, per the app's copy rules.
      expect(text, `${code} used a dash`).not.toMatch(/[\u2014\u2013]/);
    }
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
});
