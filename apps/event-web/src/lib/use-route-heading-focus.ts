import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

export function useRouteHeadingFocus(): void {
  // The resolved location, not the location itself: a navigation updates the location one
  // render before the outlet swaps screens, so the plain one focused the heading of the
  // screen being left, and its unmount dropped the focus to the body.
  const pathname = useRouterState({
    select: (state) => state.resolvedLocation?.pathname ?? state.location.pathname,
  });
  const initialRender = useRef(true);

  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false;
      return;
    }
    document.querySelector<HTMLElement>("[data-page-heading]")?.focus({ preventScroll: true });
  }, [pathname]);
}
