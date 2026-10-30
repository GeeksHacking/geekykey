import { Skeleton } from "@/components/ui/skeleton";

/** Same row rhythm as the board, so the page does not jump when data lands. */
export function StationBoardSkeleton() {
  return (
    <div className="divide-y rounded-lg border" role="status" aria-label="Loading stations">
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          className="grid grid-cols-[1fr_6rem_5rem_10rem_9rem_6rem] items-center gap-4 px-2 py-3"
        >
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-4 w-8" />
          <Skeleton className="ml-auto h-4 w-6" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="ml-auto h-8 w-24" />
        </div>
      ))}
    </div>
  );
}
