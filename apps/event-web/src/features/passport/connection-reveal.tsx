import type { MeResponse } from "@/api/types";
import { CornerBrackets } from "@/components/look/corner-brackets";
import { Button } from "@/components/ui/button";
import { useConnectionReveal } from "@/features/passport/use-connection-reveal";

/**
 * The match with a new connection, from agreement 0.13's draft (section 13). The draft's "You're a
 * {match}% match!" reads "a 80%", so PR #235 takes this wording instead. It stays until dismissed.
 */
export function ConnectionReveal({ me }: { me: MeResponse }) {
  const { connection, dismiss } = useConnectionReveal(me);
  if (!connection) return null;
  return (
    <section
      role="status"
      aria-label="New connection"
      className="relative flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <CornerBrackets />
      <div className="min-w-0">
        <p className="look-label text-muted-foreground">New connection</p>
        {connection.match === null ? (
          <p className="mt-1 text-xl font-semibold">You&apos;re connected!</p>
        ) : (
          <>
            <p className="mt-1 text-xl font-semibold">{connection.match}% match!</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Talk to find out which answers you share.
            </p>
          </>
        )}
      </div>
      <Button type="button" variant="ghost" className="self-start sm:self-auto" onClick={dismiss}>
        Dismiss
      </Button>
    </section>
  );
}
