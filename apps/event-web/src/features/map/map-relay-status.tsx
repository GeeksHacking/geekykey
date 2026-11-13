import type { RelayView } from "@/features/map/relay";

/** The same state as the drawing, readable at a distance and announced without motion. */
export function MapRelayStatus({ view }: { view: RelayView }) {
  const message =
    view.state === "complete"
      ? "Relay complete"
      : view.state === "incomplete"
        ? "Game ended"
        : view.waiting
          ? `Waiting at ${view.waiting.booth.name}`
          : "Waiting for a new call";
  return (
    <section aria-label="Reactor Relay" className="rounded-lg border border-border bg-card p-5">
      <h2 className="type-section">Reactor Relay</h2>
      <div role="status" aria-live="polite" aria-atomic="true" className="mt-3 space-y-2">
        <p className="type-title font-mono tabular-nums text-primary-text">{view.progress}</p>
        <p className="type-lead">{message}</p>
        {view.events.includes("lost") ? <p className="text-sm">Transfer missed</p> : null}
      </div>
    </section>
  );
}
