import { Skeleton } from "@/components/ui/skeleton";

export default function SheetLoading() {
  return (
    <div className="mx-auto w-full max-w-[1320px] space-y-4 px-5 pb-12 pt-4 md:px-6" aria-label="Loading Job Sheet">
      <div className="flex flex-wrap gap-2.5">
        <Skeleton className="h-[34px] w-24 rounded-full" />
        <Skeleton className="h-[34px] w-96 max-w-full rounded-full" />
        <Skeleton className="ml-auto h-[34px] w-56 rounded-full" />
      </div>
      <Skeleton className="h-[104px] w-full rounded-[18px]" />
      <div className="space-y-2 rounded-[14px] border border-border bg-surface p-3">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    </div>
  );
}
