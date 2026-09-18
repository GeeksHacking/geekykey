import { DownloadSimple } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";

import { useApi } from "@/api/context";
import { describeError } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { formatFileStamp } from "@/lib/format";

/** GET /admin/export.csv. The raw tap feed for the Sprint 2 analysis, so it must never be cut. */
export function ExportButton() {
  const api = useApi();
  const [pending, setPending] = useState(false);

  async function download() {
    setPending(true);
    try {
      const blob = await api.exportCsv();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `geekykey-taps-${formatFileStamp(new Date())}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(describeError(error));
    } finally {
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
