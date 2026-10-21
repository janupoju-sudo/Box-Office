// applydesk: copy this job's tailored CV and cover letter PDFs into the user's
// Applications/CVs and Applications/Cover Letters folders, named after the job,
// so every version sent is kept in one place outside output/.
import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot, findApplication, pdfPathStatusForReport } from "@/lib/career-ops";
import { readJsonObject } from "@/lib/json-body";
import { docFileName } from "@/lib/applydesk/doc-names.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Saved = { kind: "cv" | "cover"; file: string };

export async function POST(req: Request) {
  const body = await readJsonObject<{ n?: string; coverText?: string }>(req);
  const n = body?.n ?? "";
  const coverText = typeof body?.coverText === "string" ? body.coverText.trim() : "";
  if (coverText.length > 20_000) return Response.json({ error: "cover letter text is too long" }, { status: 400 });
  if (!/^\d{1,6}$/.test(n)) return Response.json({ error: "n required" }, { status: 400 });
  const app = findApplication(n);
  if (!app) return Response.json({ error: "no tracker row for this job" }, { status: 404 });

  const root = careerOpsRoot();
  const folders = { cv: path.join(root, "Applications", "CVs"), cover: path.join(root, "Applications", "Cover Letters") };
  const saved: Saved[] = [];
  const missing: string[] = [];
  for (const kind of ["cv", "cover"] as const) {
    const found = await pdfPathStatusForReport(n, kind);
    if (found.status !== "found") {
      missing.push(kind);
      continue;
    }
    fs.mkdirSync(folders[kind], { recursive: true });
    const name = docFileName(app.company, app.role, kind === "cv" ? "CV" : "Cover Letter");
    const dest = path.join(folders[kind], name);
    fs.copyFileSync(found.path, dest);
    saved.push({ kind, file: path.relative(root, dest) });
  }
  // A cover letter the user pasted/edited on the review screen is saved as text
  // (the web cover flow drafts in the run log; it does not render a PDF).
  if (coverText) {
    fs.mkdirSync(folders.cover, { recursive: true });
    const dest = path.join(folders.cover, docFileName(app.company, app.role, "Cover Letter").replace(/\.pdf$/, ".txt"));
    fs.writeFileSync(dest, coverText + "\n", "utf8");
    saved.push({ kind: "cover", file: path.relative(root, dest) });
    const i = missing.indexOf("cover");
    if (i >= 0) missing.splice(i, 1);
  }
  return Response.json({ saved, missing });
}
