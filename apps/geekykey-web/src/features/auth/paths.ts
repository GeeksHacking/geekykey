/**
 * return_to must be a relative path on this origin, never a full URL or a
 * protocol-relative one. Agreement 7.2 says the same: "`return_to` must be a relative
 * path on the screens' hostname."
 *
 * The token page is the reason this matters: it logs in with `return_to=/t/<UID>`, so
 * a UID is attacker-influenced text arriving from a query string.
 */
export function isSafeReturnTo(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return false;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return false;
  }
  if (decoded.startsWith("//") || decoded.includes("\\")) return false;
  if (
    [...decoded].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  )
    return false;
  const pathname = decoded.split(/[?#]/, 1)[0] ?? "";
  return pathname !== "/login" && !pathname.startsWith("/login/");
}
