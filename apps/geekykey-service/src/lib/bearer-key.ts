/** The key in an `Authorization: Bearer <key>` header, or null when the header isn't one. */
export function bearerKey(header: string | undefined): string | null {
  const [scheme, key, ...rest] = (header ?? "").trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer" || !key || rest.length > 0) return null;
  return key;
}
