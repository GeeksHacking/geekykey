import { useEffect, useLayoutEffect, useState, type RefObject } from "react";

import type { MeResponse } from "@/api/types";
import { playOnDesktop, preloadDesktopMotion } from "@/features/passport/desktop-motion";
import {
  NO_CHANGES,
  passportChanges,
  type PassportChanges,
} from "@/features/passport/passport-changes";

/** Longer than the longest animation, after which the marks are cleared. */
const MARKS_LAST_MS = 2_000;

/*
  What the last poll of /me changed, for the screen to mark with `data-changed`. On a phone
  the marks are all there is: each one plays a short CSS animation (the `phone-change:`
  variant in globals.css). At 1024 px and up, GSAP plays the same marks instead.

  The /me the screen last saw is kept in state, React's pattern for comparing with the
  previous render, and the one copy of cached data the screens keep. TanStack Query hands
  back the same object when a poll changed nothing, so such a poll finds nothing. The marks
  are cleared once they have played, so a tablet turned on its side, which crosses 1024 px,
  doesn't play them again.
*/
export function usePassportChanges(
  scope: RefObject<HTMLElement | null>,
  me: MeResponse,
): PassportChanges {
  const [seen, setSeen] = useState(me);
  const [changes, setChanges] = useState(NO_CHANGES);
  if (seen !== me) {
    setSeen(me);
    setChanges(passportChanges(seen, me));
  }

  useEffect(preloadDesktopMotion, []);

  useEffect(() => {
    if (changes === NO_CHANGES) return;
    const timer = setTimeout(() => setChanges(NO_CHANGES), MARKS_LAST_MS);
    return () => clearTimeout(timer);
  }, [changes]);

  useLayoutEffect(() => {
    if (changes === NO_CHANGES || !scope.current) return;
    return playOnDesktop(scope.current, changes);
  }, [scope, changes]);

  return changes;
}
