import { DownloadSimple } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";

import { describeError } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { escapeSpreadsheetFormulas } from "@/lib/csv";
import { formatFileStamp } from "@/lib/format";

/** Section 13 sets both sentences, and the screens use them as they are written there. */
const ESCAPING_RULE =
  "A value that a spreadsheet could run as a formula gets an apostrophe, so it stays text.";
const ESCAPED_NOTICE = "Some values were escaped, so this file is not the service's own.";

interface CsvDownloadButtonProps {
  /** Fetches the service's file. */
  fetchCsv: () => Promise<Blob>;
  /** The saved file's name, before the time and `.csv`. */
  fileName: string;
}

/** Saves a CSV from the service, as section 13 says: its own file, unless a value needs escaping. */
export function CsvDownloadButton({ fetchCsv, fileName }: CsvDownloadButtonProps) {
  const [pending, setPending] = useState(false);
  const [escaped, setEscaped] = useState(false);

  async function download() {
    setPending(true);
    setEscaped(false);
    let anchor: HTMLAnchorElement | null = null;
    let objectUrl: string | null = null;
    try {
      const source = await fetchCsv();
      const result = escapeSpreadsheetFormulas(await source.text());
      // The service's own file, unless a value had to be escaped.
      const blob = result.escaped
        ? new Blob([result.csv], { type: source.type || "text/csv;charset=utf-8" })
        : source;
      setEscaped(result.escaped);
      objectUrl = URL.createObjectURL(blob);
      anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${fileName}-${formatFileStamp(new Date())}.csv`;
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
        {escaped ? ESCAPED_NOTICE : null}
      </p>
    </div>
  );
}
