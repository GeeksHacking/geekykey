import type { ReactNode } from "react";

/**
 * A screen's h1, with the short yellow underline Token kinds introduced (FRO-159). The
 * underline has the charcoal edge every yellow fill takes on the light theme, and sits
 * outside the h1, so the heading's name stays the title. `tabIndex={-1}` lets a route
 * change move focus to the heading.
 */
export function PageTitle({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <h1 tabIndex={-1} className="type-title outline-hidden">
        {children}
      </h1>
      <span
        aria-hidden
        data-title-underline
        className="mt-2 h-1 w-12 rounded-full border border-primary-edge bg-primary"
      />
    </div>
  );
}
