import { Skeleton } from "@/components/ui/skeleton";

export default function SheetApplyLoading() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-4" aria-label="Loading application review">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-10 w-80 max-w-[80%]" />
      <Skeleton className="h-4 w-64" />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-32 w-full rounded-lg" />
      ))}
    </div>
  );
}
