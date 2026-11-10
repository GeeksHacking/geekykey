import { useMutation } from "@tanstack/react-query";
import { useCallback, useMemo, useRef } from "react";

import { useApi } from "@/api/context";
import { GEEKYKEY_SCREENS_URL } from "@/lib/constants";

/**
 * How long a link asked for ahead of the click may wait for it. A link expires 60 seconds
 * after it's made (agreement 8.12), so an older one is dropped and the click asks again,
 * which leaves 15 seconds for the GeekyKey screens to load and send it.
 */
export const EARLY_LINK_FRESH_MS = 45_000;

/** A link asked for ahead of the click, as the address it opens. */
interface EarlyLink {
  askedAt: number;
  /** Never rejects: when no link can be had it's the plain address. */
  address: Promise<string>;
}

/**
 * Opens My tokens on the GeekyKey screens as the user signed in here (agreement 8.12, BAC-157).
 * It asks the Event Service for a login link and opens it in the address's fragment, which never
 * reaches a server or a log, so a guest whose sign-in there is gone still sees their own tokens.
 *
 * When no link can be had, it opens My tokens anyway, where the user's session there, Firebase's
 * saved sign-in or the login takes over, as before.
 *
 * `prepare` runs when the menu that holds My tokens opens, so the click doesn't wait for the
 * request (FRO-162). It asks for the link and starts the connection to the GeekyKey screens.
 * `open` uses that link if it's under 45 seconds old, and asks for one itself otherwise.
 * `discard` runs when the menu closes. The link is held in this hook's memory only, is
 * opened once, and is kept nowhere else.
 */
export function useOpenMyTokens() {
  const api = useApi();
  const early = useRef<EarlyLink | null>(null);

  const ask = useCallback((): EarlyLink => {
    const link: EarlyLink = {
      askedAt: Date.now(),
      address: api.createGeekykeyLoginLink().then(
        ({ login_link }) => `${GEEKYKEY_SCREENS_URL}#login=${login_link}`,
        () => {
          // Dropped, so a click after the failure asks once more. A click already waiting
          // on this request opens the plain address.
          if (early.current === link) early.current = null;
          return GEEKYKEY_SCREENS_URL;
        },
      ),
    };
    return link;
  }, [api]);

  const { mutate, isPending } = useMutation({
    mutationFn: (address: Promise<string>) => address,
    onSuccess: (address) => window.location.assign(address),
  });

  const prepare = useCallback(() => {
    connectEarly();
    if (!isFresh(early.current)) early.current = ask();
  }, [ask]);

  const discard = useCallback(() => {
    early.current = null;
  }, []);

  const open = useCallback(() => {
    // Taken here rather than inside the mutation, which starts a tick later: the click also
    // closes the menu, and that discards the link.
    const link = isFresh(early.current) ? early.current : ask();
    early.current = null;
    mutate(link.address);
  }, [ask, mutate]);

  return useMemo(
    () => ({ prepare, discard, open, isPending }),
    [prepare, discard, open, isPending],
  );
}

function isFresh(link: EarlyLink | null): link is EarlyLink {
  return link !== null && Date.now() - link.askedAt < EARLY_LINK_FRESH_MS;
}

const CONNECT_EARLY_ID = "geekykey-screens-preconnect";

/**
 * Asks the browser to open its connection to the GeekyKey screens now, so the page load that
 * follows a click doesn't start with DNS and TLS. Done when the menu opens rather than in
 * index.html, because a browser closes a connection it hasn't used within seconds.
 */
function connectEarly() {
  document.getElementById(CONNECT_EARLY_ID)?.remove();
  const hint = document.createElement("link");
  hint.id = CONNECT_EARLY_ID;
  hint.rel = "preconnect";
  hint.href = new URL(GEEKYKEY_SCREENS_URL).origin;
  document.head.append(hint);
}
