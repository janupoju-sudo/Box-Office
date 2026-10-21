// applydesk: the job description + evaluation for one tracked job, split out
// of its career-ops report so the Job Sheet's side panel can show both.
import { readReport } from "@/lib/career-ops";
import { splitReport } from "@/lib/applydesk/sheet-parse.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const n = new URL(req.url).searchParams.get("n") ?? "";
  if (!/^\d{1,6}$/.test(n)) return Response.json({ error: "n required" }, { status: 400 });
  const report = readReport(n);
  if (!report) return Response.json({ jd: "", evaluation: "", file: null });
  const { jd, evaluation } = splitReport(report.content);
  return Response.json({ jd, evaluation, file: report.file });
}
