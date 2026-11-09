import type { ReactNode } from "react";

import { PageHeading } from "@/components/layout/page-heading";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/**
 * The short yellow underline lives here rather than in `PageHeading`, so it reaches every screen
 * title but not the dashboard's name over the avatar (FRO-159, after the GeekyKey screens' Token
 * kinds). It has the charcoal edge every yellow fill takes, and sits outside the h1 so the
 * heading's name stays the title.
 */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}
    >
      <div className="min-w-0">
        <PageHeading>{title}</PageHeading>
        <span
          aria-hidden
          data-title-underline
          className="mt-2 block h-1 w-12 rounded-full border border-primary-edge bg-primary"
        />
        {description ? (
          <p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
