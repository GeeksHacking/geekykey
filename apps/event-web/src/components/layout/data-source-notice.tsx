import { Info } from "@phosphor-icons/react";

import { dataSourceMessage, isMockData } from "@/api/mode";

export function DataSourceNotice() {
  if (!isMockData()) return null;

  return (
    <div
      role="status"
      className="mb-6 flex items-start gap-2 rounded-lg border border-status-cooldown/40 bg-status-cooldown/10 px-4 py-3 text-sm"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-status-cooldown" aria-hidden />
      <span>{dataSourceMessage()}</span>
    </div>
  );
}
