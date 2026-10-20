import { Skeleton } from "@/components/ui/skeleton";

export function ScanLogSkeleton() {
  return (
    <div className="divide-y rounded-lg border" role="status" aria-label="Loading scan log">
      {Array.from({ length: 8 }, (_, index) => (
        <div
          key={index}
          className="grid grid-cols-[5rem_1fr_1fr_8rem_7rem] items-center gap-4 px-2 py-3"
        >
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}
