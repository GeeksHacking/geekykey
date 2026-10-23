import { DownloadSimple } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";

import { useApi } from "@/api/context";
import { describeError } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { escapeSpreadsheetFormulas } from "@/lib/csv";
import { formatFileStamp } from "@/lib/format";

/** Section 13 sets both sentences, and the screens use them as they are written there. */
const ESCAPING_RULE =
  "A name that a spreadsheet could run as a formula gets an apostrophe, so it stays text.";
const REWRITTEN_NOTICE = "Some names were escaped, so this file is not the service's own.";

/** GET /admin/export.csv. The raw tap feed for the Sprint 2 analysis, so it must never be cut. */
export function ExportButton() {
  const api = useApi();
  const [pending, setPending] = useState(false);
  const [rewritten, setRewritten] = useState(false);

  async function download() {
    setPending(true);
    setRewritten(false);
    let anchor: HTMLAnchorElement | null = null;
    let objectUrl: string | null = null;
    try {
      const source = await api.exportCsv();
      const { csv, rewritten: fileWasChanged } = escapeSpreadsheetFormulas(await source.text());
      // The service's own file, unless a name had to be escaped.
      const blob = fileWasChanged
        ? new Blob([csv], { type: source.type || "text/csv;charset=utf-8" })
        : source;
      setRewritten(fileWasChanged);
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
    <div className="flex flex-col items-end gap-1.5 text-right">
      <Button variant="outline" onClick={() => void download()} disabled={pending}>
        <DownloadSimple aria-hidden />
        {pending ? "Preparing" : "Download CSV"}
      </Button>
      <p className="max-w-[36ch] text-xs text-muted-foreground">{ESCAPING_RULE}</p>
      <p role="status" className="max-w-[36ch] text-xs text-foreground">
        {rewritten ? REWRITTEN_NOTICE : null}
      </p>
    </div>
  );
}
