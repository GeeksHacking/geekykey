import { vi } from "vitest";

import type { MockApiClient } from "@/api/mock/client";
import type { MeResponse } from "@/api/types";

/**
 * Holds the /me the client answers after `holdTheNextOne()`, so a test can land its answer
 * after a write has finished. `started` resolves once the held read is in flight. Every
 * other /me reaches the mock as usual.
 */
export function holdNextMe(api: MockApiClient) {
  let answer!: (me: MeResponse) => void;
  let refuse!: (reason: unknown) => void;
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const held = new Promise<MeResponse>((resolve, reject) => {
    answer = resolve;
    refuse = reject;
  });
  const realMe = api.me.bind(api);
  let holding = false;
  vi.spyOn(api, "me").mockImplementation(async () => {
    if (!holding) return realMe();
    holding = false;
    markStarted();
    return held;
  });
  return { holdTheNextOne: () => (holding = true), answer, refuse, realMe, started };
}
