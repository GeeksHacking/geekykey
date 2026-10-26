import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

/*
  Moves the focus to the new page's heading after a route change, so a screen-reader or
  keyboard user hears which page they are on. It waits for the router's `onRendered`: the
  path changes before the new screen renders, so a focus moved on the path alone lands on
  the old screen's heading, which is then removed, and the focus falls to the body. The page
  the shell opened on keeps the focus where it is.
*/
export function useRouteHeadingFocus(): void {
  const router = useRouter();

  useEffect(() => {
    let shownPath = router.state.location.pathname;
    return router.subscribe("onRendered", ({ toLocation }) => {
      if (toLocation.pathname === shownPath) return;
      shownPath = toLocation.pathname;
      document.querySelector<HTMLElement>("[data-page-heading]")?.focus({ preventScroll: true });
    });
  }, [router]);
}
