import fs from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";
import { careerOpsRoot, findApplication, pdfPathStatusForReport, readReport } from "@/lib/career-ops";
import { parseReport } from "@/lib/format";
import { resolvePostingUrl } from "@/lib/posting-url.mjs";
import { reportFieldValue, scoreNumber, tableValue } from "@/lib/boxoffice/sheet-parse.mjs";
import { docFileName } from "@/lib/boxoffice/doc-names.mjs";
import { ApplyReview } from "@/components/boxoffice/apply-review";

export const dynamic = "force-dynamic";

export default async function SheetApplyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const app = findApplication(id);
  if (!app) notFound();
  const n = app.n;
  const content = readReport(n)?.content ?? "";
  const fields = content ? parseReport(content).fields : [];
  const postingUrl = resolvePostingUrl(app.url || app.applyLink, reportFieldValue(fields, "URL"));

  const cv = await pdfPathStatusForReport(n, "cv");
  const cover = await pdfPathStatusForReport(n, "cover");

  const root = careerOpsRoot();
  const savedCv = fs.existsSync(path.join(root, "Applications", "CVs", docFileName(app.company, app.role, "CV")));
  const coverBase = path.join(root, "Applications", "Cover Letters", docFileName(app.company, app.role, "Cover Letter"));
  const savedCover = fs.existsSync(coverBase) || fs.existsSync(coverBase.replace(/\.pdf$/, ".txt"));

  return (
    <ApplyReview
      n={n}
      company={app.company}
      role={app.role}
      location={app.location}
      status={app.status}
      score={scoreNumber(app.score)}
      tldr={tableValue(content, "TL;DR")}
      legitimacy={reportFieldValue(fields, "Legitimacy")}
      postingUrl={postingUrl}
      cvReady={(app.pdf ?? "").includes("✅") || cv.status === "found"}
      coverPdfReady={cover.status === "found"}
      savedCv={savedCv}
      savedCover={savedCover}
    />
  );
}
