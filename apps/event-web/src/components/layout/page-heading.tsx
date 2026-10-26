import type { ReactNode } from "react";

/*
  The page's h1. `data-page-heading` and `tabIndex={-1}` are what
  `lib/use-route-heading-focus.ts` looks for, so every screen's heading takes the focus
  after a route change. Use this, or `PageHeader`, for a screen's h1.
*/
export function PageHeading({ children }: { children: ReactNode }) {
  return (
    <h1 tabIndex={-1} data-page-heading className="text-2xl font-semibold tracking-heading">
      {children}
    </h1>
  );
}
