import type { MeResponse, User } from "@/api/types";

type MeOverrides = Partial<Omit<MeResponse, "user">> & { user?: Partial<User> };

/**
 * A valid /me for a test, with only what the test cares about changed. When /me gains a field,
 * this is the one place that needs it. `api/schemas.test.ts` keeps a full literal as the contract.
 */
export function makeMe({ user, ...rest }: MeOverrides = {}): MeResponse {
  return {
    user: {
      id: "dev-user-1",
      display_name: "Alex Tan",
      role: "participant",
      has_name: true,
      answers: {},
      ...user,
    },
    questions: null,
    points: 0,
    tapped_you: 0,
    stamps: [],
    recent_taps: [],
    connection_requests: [],
    connections: [],
    ...rest,
  };
}
