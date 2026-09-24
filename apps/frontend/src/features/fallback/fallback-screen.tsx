import { ErrorState } from "@/components/layout/error-state";
import { InlineQueryError } from "@/components/layout/inline-query-error";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { FallbackForm } from "@/features/fallback/fallback-form";
import { useFallbackStations } from "@/features/fallback/use-fallback-stations";

export function FallbackScreen() {
  const stations = useFallbackStations();

  let body;
  if (stations.isPending) {
    body = (
      <div className="space-y-5" role="status" aria-label="Loading form">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  } else if (!stations.data) {
    body = <ErrorState error={stations.error} onRetry={() => void stations.refetch()} />;
  } else {
    body = (
      <div className="space-y-4">
        {stations.isError ? (
          <InlineQueryError
            error={stations.error}
            onRetry={() => void stations.refetch()}
            title="Station list updates are delayed."
          />
        ) : null}
        <FallbackForm stations={stations.data.stations} />
      </div>
    );
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
