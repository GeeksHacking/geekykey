import { CaretDown } from "@phosphor-icons/react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { ClaimByCodeForm } from "@/features/home/claim-by-code-form";
import { cn } from "@/lib/utils";

/**
 * My tokens' manual claim, closed when the page loads (FRO-155). Most people claim by tapping
 * a token with their phone, so the page leads with their tokens and the event, and the UID
 * form waits here for a token the phone cannot read.
 *
 * The control is a plain button with aria-expanded, as the Event screens' "Show what we
 * share" is, plus aria-controls naming the part it opens, so Enter and Space work and a
 * screen reader hears whether it is open. It is an outline button, never the yellow fill,
 * so the event's button stays the one primary action on the page.
 *
 * The form mounts only while the part is open, and opening it puts the cursor in the
 * field. It stays open after a failed claim, so the typed UID and the error stay where
 * they were.
 */
export function ManualClaim() {
  const [open, setOpen] = useState(false);
  const regionId = useId();

  return (
    <section className="border-t pt-6">
      <Button
        type="button"
        variant="outline"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((shown) => !shown)}
      >
        Claim a token manually
        <CaretDown
          weight="bold"
          className={cn("transition-transform duration-150", open && "rotate-180")}
          aria-hidden
        />
      </Button>
      {open ? null : (
        <p className="mt-2 text-sm text-muted-foreground">For a token your phone can't read.</p>
      )}
      <div id={regionId}>{open ? <ClaimByCodeForm autoFocus /> : null}</div>
    </section>
  );
}
