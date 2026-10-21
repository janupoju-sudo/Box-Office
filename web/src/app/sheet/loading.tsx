import { Skeleton } from "@/components/ui/skeleton";

export default function SheetLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-4" aria-label="Loading Job Sheet">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="flex gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="ml-auto h-8 w-64" />
      </div>
      <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    </div>
  );
}
