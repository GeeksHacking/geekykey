import * as React from "react";
import { CaretDown } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";

/**
 * The browser's own <select>, styled to match `Input`. It keeps the phone's native picker
 * and the browser's keyboard handling, which a short filter list doesn't need replaced.
 * The browser's arrow is hidden and drawn here instead, with room to its left, because
 * the default one sits against the text at a narrow width (FRO-145).
 */
const NativeSelect = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(
  ({ className, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "block h-10 w-full appearance-none truncate rounded-md border border-input bg-background py-1 pr-10 pl-3 text-base text-foreground transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        {...props}
      />
      <CaretDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  ),
);
NativeSelect.displayName = "NativeSelect";

export { NativeSelect };
