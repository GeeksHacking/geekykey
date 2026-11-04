import { useApi } from "@/api/context";
import { CsvDownloadButton } from "@/components/csv-download-button";

/** GET /admin/export.csv. The raw tap feed for the Sprint 2 analysis, so it must never be cut. */
export function ExportButton() {
  const api = useApi();
  return <CsvDownloadButton fetchCsv={() => api.exportCsv()} fileName="geekykey-taps" />;
}
