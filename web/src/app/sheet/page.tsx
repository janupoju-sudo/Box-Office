import { Suspense } from "react";
import { sheetRows } from "@/lib/boxoffice/sheet-rows";
import { JobSheet } from "@/components/boxoffice/job-sheet";

export const dynamic = "force-dynamic"; // always read fresh local files

export default function SheetPage() {
  return (
    <Suspense>
      <JobSheet rows={sheetRows()} />
    </Suspense>
  );
}
