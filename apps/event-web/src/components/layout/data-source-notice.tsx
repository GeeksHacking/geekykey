import { Info } from "@phosphor-icons/react";

import { LIVE_API } from "@/api/create-client";

/**
 * A mock build answers from sample data, so an organiser trying the console is not left
 * believing that a station they added reached the event. A live build sends every call to
 * the Event Service, so it has nothing to say. The wording is section 13's.
 */
export function DataSourceNotice({ live = LIVE_API }: { live?: boolean }) {
  if (live) return null;

  return (
    <div
      role="status"
      className="mb-6 flex items-start gap-2 rounded-lg border border-status-cooldown/40 bg-status-cooldown/10 px-4 py-3 text-sm"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-status-cooldown" aria-hidden />
      <span>Demo data. This screen shows sample data.</span>
    </div>
  );
}
