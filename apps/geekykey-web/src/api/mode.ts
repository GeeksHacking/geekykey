import type { ApiClient } from "@/api/client";
import { LIVE_API, LIVE_METHODS } from "@/api/create-client";

/**
 * The methods the token page calls besides the session's. While a live build still
 * sends any of them to the mock, the page answers from sample tokens and says so.
 */
const TOKEN_PAGE_METHODS: readonly (keyof ApiClient)[] = ["getToken", "claimToken", "releaseToken"];

/**
 * Whether a live build still sends this method to the mock. A mock build has no service
 * answers to mix it up with, so there the answer is false.
 */
export function isLeftOnMock(
  method: keyof ApiClient,
  live: boolean = LIVE_API,
  liveMethods: ReadonlySet<keyof ApiClient> = LIVE_METHODS,
): boolean {
  return live && !liveMethods.has(method);
}

export function isMockData(
  live: boolean = LIVE_API,
  liveMethods: ReadonlySet<keyof ApiClient> = LIVE_METHODS,
): boolean {
  if (!live) return true;
  return TOKEN_PAGE_METHODS.some((method) => isLeftOnMock(method, live, liveMethods));
}

/** The notice's wording is section 13's. */
export function dataSourceMessage(live: boolean = LIVE_API): string {
  if (!live) return "Demo data. This screen shows sample data.";
  return "Demo data. This page shows sample tokens, so claiming or releasing one changes nothing.";
}
