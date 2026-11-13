import { useApi } from "@/api/context";
import { CsvDownloadButton } from "@/components/csv-download-button";

/** GET /admin/groups/export.csv (agreement 0.14), so each trial's times outlast a reset. */
export function ExportGroupsButton() {
  const api = useApi();
  return <CsvDownloadButton fetchCsv={() => api.exportGroupsCsv()} fileName="geekykey-groups" />;
}
