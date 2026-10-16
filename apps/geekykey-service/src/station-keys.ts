/**
 * A station key's SHA-256, as 64 lower-case hex characters: how each Event
 * Service lists its registered stations (the API agreement's 11.1), so the
 * key itself never leaves the station.
 */
export async function hashStationKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
