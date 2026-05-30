import { Skeleton } from "@/components/ui/skeleton";

/** Full-screen loading placeholder for the person detail view. */
export function PersonDetailSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-4 pt-2" aria-hidden>
      <div className="flex flex-col items-center gap-3 pt-2">
        <Skeleton className="size-20 rounded-full" />
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-28" />
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="size-10 rounded-full" />
          ))}
        </div>
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="space-y-3 rounded-2xl border border-border/70 p-3"
        >
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      ))}
    </div>
  );
}
