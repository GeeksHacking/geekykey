import { Wordmark } from "@/components/layout/wordmark";
import { Skeleton } from "@/components/ui/skeleton";

export function FullPageLoading() {
  return (
    <div className="grid min-h-[100dvh] place-items-center" role="status">
      <div className="flex flex-col items-center gap-4">
        <Wordmark size="lg" />
        <Skeleton className="h-1.5 w-40" />
        <span className="sr-only">Loading</span>
      </div>
    </div>
  );
}
