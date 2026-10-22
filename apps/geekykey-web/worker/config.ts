/**
 * A setting that's wrong. Thrown as the Worker starts, which stops it starting, so a
 * mistake shows on the first deploy rather than on every request.
 */
export class ConfigError extends Error {
  override name = "ConfigError";
}

/** The hosts `http://` may go to: this machine, in local development. */
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Firebase's address from FIREBASE_AUTH_URL, with no `/` at the end. The sign-in popup's
 * pages go there (firebase.ts). It must start with `https://`, unless it's this machine, as
 * in the Worker's tests.
 */
export function firebaseAuthUrl(value: unknown): string {
  if (typeof value !== "string" || !URL.canParse(value)) {
    throw new ConfigError("FIREBASE_AUTH_URL must be a URL");
  }
  const url = new URL(value);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOOPBACK.has(url.hostname))) {
    throw new ConfigError(
      "FIREBASE_AUTH_URL must start with https://, or be http:// to this machine",
    );
  }
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
    throw new ConfigError(
      "FIREBASE_AUTH_URL must be an address with no path, such as https://host",
    );
  }
  return url.origin;
}
