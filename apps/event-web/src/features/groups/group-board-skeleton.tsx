import { Skeleton } from "@/components/ui/skeleton";

/** The same panels as the board, so the page doesn't jump when data lands. */
export function GroupBoardSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2" role="status" aria-label="Loading groups">
      {Array.from({ length: 2 }, (_, index) => (
        <div key={index} className="space-y-3 rounded-lg border p-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-4 w-44" />
        </div>
      ))}
    </div>
  );
}
