import { CornerBrackets } from "@/components/look/corner-brackets";
import type { RelayView } from "@/features/map/relay";
import { cn } from "@/lib/utils";

/** The one line under the count: what the game is waiting for, or how it ended. */
function relayMessage(view: RelayView) {
  if (view.state === "complete") return "Relay complete";
  if (view.state === "incomplete") return "Game ended";
  const missed = view.events.includes("lost");
  if (view.waiting) {
    return missed
      ? `Missed. Now waiting at ${view.waiting.booth.name}`
      : `Waiting at ${view.waiting.booth.name}`;
  }
  return view.missedAt ? `Missed. Tap again at ${view.missedAt.booth.name}` : "Missed. Tap again";
}

/**
 * The same state as the drawing, built like the connections card beside it so the two read as a
 * pair. The count is the largest thing in the column, since it's read from across the booth, with
 * a pip per transfer so its shape reads before its digits. There's always exactly one line under
 * it, so a missed call doesn't move the cards below.
 */
export function MapRelayStatus({ view }: { view: RelayView }) {
  return (
    <section aria-labelledby="map-relay-heading" className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="map-relay-heading" className="type-section">
          Reactor Relay
        </h2>
        <span className="look-label text-muted-foreground">Two stations</span>
      </div>
      <div className="relative">
        <CornerBrackets />
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="rounded-lg border border-border bg-card px-4 py-3"
        >
          <p className="text-sm text-muted-foreground">
            <span className="font-mono text-4xl font-semibold tabular-nums text-primary-text lg:text-5xl">
              {view.progress}
            </span>{" "}
            transfers
          </p>
          <div aria-hidden className="mt-2 flex gap-1.5" data-relay-pips>
            {Array.from({ length: view.transfers.needed }, (_, index) => (
              <span
                key={index}
                className={cn(
                  "h-2 flex-1 rounded-sm border",
                  index < view.transfers.done
                    ? "border-primary-edge bg-primary"
                    : "border-border bg-muted",
                )}
              />
            ))}
          </div>
          <p
            className={cn(
              "type-lead mt-2 lg:text-2xl 2xl:text-3xl",
              view.state === "complete" && "text-primary-text",
            )}
          >
            {relayMessage(view)}
          </p>
        </div>
      </div>
    </section>
  );
}
