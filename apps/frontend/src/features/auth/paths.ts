import type { Role } from "@/api/types";

export function homePathFor(role: Role): "/" | "/admin/stations" {
  return role === "organizer" ? "/admin/stations" : "/";
}

/** return_to must be a relative path on this origin, never a full URL or protocol-relative one. */
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
