import { Info } from "@phosphor-icons/react";

import { LIVE_API } from "@/api/create-client";

/**
 * The notice the Event screens' organiser console carries, copied rather than shared,
 * because the two apps have no component package in common. A mock build answers from
 * sample data, so a person testing on a phone is not left believing that a claim on the
 * token page reached the service. A live build sends every call to the service, so it
 * has nothing to say. The wording is section 13's.
 */
export function DataSourceNotice({ live = LIVE_API }: { live?: boolean }) {
  if (live) return null;

  return (
    <div
      role="status"
      className="mt-6 mb-6 flex items-start gap-2 rounded-lg border border-status-cooldown/40 bg-status-cooldown/10 px-4 py-3 text-sm"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-status-cooldown" aria-hidden />
      <span>Demo data. This screen shows sample data.</span>
    </div>
  );
}
