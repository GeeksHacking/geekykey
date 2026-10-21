import { Info } from "@phosphor-icons/react";

import { dataSourceMessage, isMockData } from "@/api/mode";

/**
 * The notice the Event screens' organiser console carries, copied rather than shared,
 * because the two apps have no component package in common. It says where the data on
 * the screen came from, so a person testing on a phone is not left believing that a
 * claim on the token page reached the service.
 */
export function DataSourceNotice() {
  if (!isMockData()) return null;

  return (
    <div
      role="status"
      className="mt-6 mb-6 flex items-start gap-2 rounded-lg border border-status-cooldown/40 bg-status-cooldown/10 px-4 py-3 text-sm"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-status-cooldown" aria-hidden />
      <span>{dataSourceMessage()}</span>
    </div>
  );
}
