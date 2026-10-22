/**
 * Takes the login link out of the address, once, before anything reads the session.
 *
 * Agreement 7.4: the GeekyKey screens' event buttons open `/#login=<link>`. The fragment
 * never reaches a server or a log, and it goes from the address straight away, so a
 * reload or a shared screenshot does not carry it. Answers undefined for any other
 * address, which it leaves alone.
 */
export function takeLoginLink(): string | undefined {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const link = fragment.get("login");
  if (link === null) return undefined;

  const { pathname, search } = window.location;
  window.history.replaceState(window.history.state, "", `${pathname}${search}`);
  return link;
}
