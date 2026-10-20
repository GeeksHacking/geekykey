import type { TapStatus } from "@/api/types";
import { TAP_STATUS_META, TAP_STATUSES } from "@/components/tap-status-meta";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StationOption } from "@/features/stations/station-options";
import type { ScanLogFilters as Filters } from "@/features/taps/use-scan-log";

const ALL = "all";

interface ScanLogFiltersProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  stations: StationOption[];
}

export function ScanLogFilters({ filters, onChange, stations }: ScanLogFiltersProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:max-w-xl">
      <div className="grid gap-1.5">
        <Label htmlFor="filter-station">Station</Label>
        <Select
          value={filters.station_id ?? ALL}
          onValueChange={(value) =>
            onChange({ ...filters, station_id: value === ALL ? undefined : value })
          }
        >
          <SelectTrigger id="filter-station">
            <SelectValue placeholder="All stations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All stations</SelectItem>
            {stations.map((station) => (
              <SelectItem key={station.id} value={station.id}>
                {station.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="filter-status">Status</Label>
        <Select
          value={filters.status ?? ALL}
          onValueChange={(value) =>
            onChange({ ...filters, status: value === ALL ? undefined : (value as TapStatus) })
          }
        >
          <SelectTrigger id="filter-status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {TAP_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {TAP_STATUS_META[status].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
