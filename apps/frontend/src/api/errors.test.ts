import { describe, expect, it } from "vitest";

import { ApiError, describeError } from "@/api/errors";

describe("API error messages", () => {
  it("explains service and rate-limit errors", () => {
    expect(describeError(new ApiError(429, "rate_limited"))).toContain("Too many requests");
    expect(describeError(new ApiError(503, "event_service_unavailable"))).toContain("service");
    expect(describeError(new ApiError(503, "portal_unavailable"))).toContain("service");
  });
});
