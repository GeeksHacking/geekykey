const KEY_PREFIX = "gk_sta_";

/** Random station API key. Shown once at creation; only its hash is stored. */
export function generateStationKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return KEY_PREFIX + base64Url(bytes);
}

export async function hashStationKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
