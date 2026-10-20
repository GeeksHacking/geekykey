import { DownloadSimple } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";

import { useApi } from "@/api/context";
import { describeError } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { sanitizeSpreadsheetCsv } from "@/lib/csv";
import { formatFileStamp } from "@/lib/format";

/** GET /admin/export.csv. The raw tap feed for the Sprint 2 analysis, so it must never be cut. */
export function ExportButton() {
  const api = useApi();
  const [pending, setPending] = useState(false);

  async function download() {
    setPending(true);
    let anchor: HTMLAnchorElement | null = null;
    let objectUrl: string | null = null;
    try {
      const source = await api.exportCsv();
      const csv = await source.text();
      const blob = new Blob([sanitizeSpreadsheetCsv(csv)], {
        type: source.type || "text/csv;charset=utf-8",
      });
      objectUrl = URL.createObjectURL(blob);
      anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `geekykey-taps-${formatFileStamp(new Date())}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      anchor?.remove();
      if (objectUrl !== null) {
        const url = objectUrl;
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
      }
      setPending(false);
    }
  }

  return (
    <Button variant="outline" onClick={() => void download()} disabled={pending}>
      <DownloadSimple aria-hidden />
      {pending ? "Preparing" : "Download CSV"}
    </Button>
  );
}
