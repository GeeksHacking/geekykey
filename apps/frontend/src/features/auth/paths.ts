import type { Role } from "@/api/types";

export function homePathFor(role: Role): "/" | "/admin/stations" {
  return role === "organizer" ? "/admin/stations" : "/";
}

/** return_to must be a relative path on this origin, never a full URL or protocol-relative one. */
export function isSafeReturnTo(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}
