import { describe, expect, it } from "vitest";

import { ApiError, describeError } from "@/api/errors";

describe("API error messages", () => {
  it("explains the new service and token errors", () => {
    expect(describeError(new ApiError(409, "token_taken"))).toContain("already paired");
    expect(describeError(new ApiError(409, "token_limit_reached"))).toContain("token limit");
    expect(describeError(new ApiError(429, "rate_limited"))).toContain("Too many requests");
    expect(describeError(new ApiError(503, "event_service_unavailable"))).toContain("service");
  });
});
