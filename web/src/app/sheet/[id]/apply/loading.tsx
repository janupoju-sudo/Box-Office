import { Skeleton } from "@/components/ui/skeleton";

export default function SheetApplyLoading() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-5 pb-12 pt-4 md:px-6" aria-label="Loading application review">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-[120px] w-full rounded-[18px]" />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-32 w-full rounded-[14px]" />
      ))}
    </div>
  );
}
