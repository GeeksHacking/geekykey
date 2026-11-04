import { Skeleton } from "@/components/ui/skeleton";

/** The counts, the panels and the waiting list, so the page doesn't jump when data lands. */
export function GroupBoardSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading groups">
      <Skeleton className="h-4 w-40" />
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="space-y-3 rounded-lg border p-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>
      <div className="space-y-3 rounded-lg border p-4">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-4 w-32" />
      </div>
    </div>
  );
}
