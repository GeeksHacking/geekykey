import { ErrorState } from "@/components/layout/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { FallbackForm } from "@/features/fallback/fallback-form";
import { useFallbackStations } from "@/features/fallback/use-fallback-stations";

export function FallbackScreen() {
  const stations = useFallbackStations();

  let body;
  if (stations.status === "loading") {
    body = (
      <div className="space-y-5" role="status" aria-label="Loading form">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  } else if (stations.status === "error" || !stations.data) {
    body = <ErrorState error={stations.error} onRetry={() => void stations.refetch()} />;
  } else {
    body = <FallbackForm stations={stations.data.stations} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="QR fallback"
        description="Log a tap for a participant when a station is down. It counts exactly like a station tap and is recorded as a fallback so it can be audited."
      />
      <div className="max-w-lg">{body}</div>
    </div>
  );
}
