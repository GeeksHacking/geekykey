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
 * The Event Service's address from EVENT_API_URL, with no `/` at the end. It must start with
 * `https://`, because the session cookie goes with every request. The one exception is
 * this machine, for local development, as the GeekyKey Service allows for its own addresses.
 */
export function eventApiUrl(value: unknown): string {
  return origin("EVENT_API_URL", value);
}

/**
 * Firebase's address from FIREBASE_AUTH_URL, with no `/` at the end, under the same rules as
 * EVENT_API_URL. The sign-in popup's pages go there (firebase.ts).
 */
export function firebaseAuthUrl(value: unknown): string {
  return origin("FIREBASE_AUTH_URL", value);
}

/** An address with no path, from the setting `name`: `https://`, or `http://` to this machine. */
function origin(name: string, value: unknown): string {
  if (typeof value !== "string" || !URL.canParse(value)) {
    throw new ConfigError(`${name} must be a URL`);
  }
  const url = new URL(value);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOOPBACK.has(url.hostname))) {
    throw new ConfigError(`${name} must start with https://, or be http:// to this machine`);
  }
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
    throw new ConfigError(`${name} must be an address with no path, such as https://host`);
  }
  return url.origin;
}
