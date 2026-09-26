import { useLocation } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

export function useRouteHeadingFocus(): void {
  const pathname = useLocation({ select: (location) => location.pathname });
  const initialRender = useRef(true);

  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false;
      return;
    }
    document.querySelector<HTMLElement>("[data-page-heading]")?.focus({ preventScroll: true });
  }, [pathname]);
}
