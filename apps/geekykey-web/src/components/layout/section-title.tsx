import type { ReactNode } from "react";

/**
 * A section heading, marked with the kit's yellow (FRO-159, first on Token kinds). The
 * marker has the charcoal edge yellow fills take on the light theme, where yellow alone
 * barely shows.
 */
export function SectionTitle({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="type-section flex items-center gap-2">
      <span
        aria-hidden
        data-section-marker
        className="h-5 w-1.5 shrink-0 rounded-full border border-primary-edge bg-primary"
      />
      {children}
    </h2>
  );
}
