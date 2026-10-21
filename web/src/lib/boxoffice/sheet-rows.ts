// Box Office: one spreadsheet-style row per job, merging the two places
// career-ops keeps jobs — the inbox (data/pipeline.md, not yet evaluated) and
// the tracker (data/applications.md, evaluated, with a report). Read-only.
import { pipelineSummary, readReport, type Application, type InboxJob } from "@/lib/career-ops";
import { parseReport } from "@/lib/format";
import { pendingInbox } from "@/lib/inbox-pending.mjs";
import { resolvePostingUrl } from "@/lib/posting-url.mjs";
import { reportFieldValue, payFromReport, scoreNumber, normalizeUrlKey } from "@/lib/boxoffice/sheet-parse.mjs";

export type SheetRow = {
  /** Stable React key. */
  key: string;
  /** "new" = in the inbox, not evaluated yet. "tracked" = evaluated, has a tracker row. */
  kind: "new" | "tracked";
  /** Tracker number for tracked rows, null for new ones. */
  n: string | null;
  company: string;
  role: string;
  location: string;
  pay: string;
  score: number | null;
  status: string;
  date: string;
  url: string;
  pdfReady: boolean;
  notes: string;
};

function trackedRow(app: Application): SheetRow {
  const report = readReport(app.n);
  const content = report?.content ?? "";
  const fields = content ? parseReport(content).fields : [];
  const url = resolvePostingUrl(app.url || app.applyLink, reportFieldValue(fields, "URL"));
  return {
    key: `t-${app.n}`,
    kind: "tracked",
    n: app.n,
    company: app.company,
    role: app.role,
    location: app.location || reportFieldValue(fields, "Location") || reportFieldValue(fields, "Remote"),
    pay: payFromReport(content),
    score: scoreNumber(app.score),
    status: app.status || "Evaluated",
    date: app.date,
    url,
    pdfReady: (app.pdf ?? "").includes("✅"),
    notes: app.notes,
  };
}

function newRow(job: InboxJob, i: number): SheetRow {
  return {
    key: `n-${i}-${job.url}`,
    kind: "new",
    n: null,
    company: job.company || "",
    role: job.role || "",
    location: job.location || "",
    pay: job.compensation || "",
    score: null,
    status: "New",
    date: job.postedAt || "",
    url: job.url,
    pdfReady: false,
    notes: "",
  };
}

export function sheetRows(): SheetRow[] {
  const { inbox, applications } = pipelineSummary();
  const tracked = applications.map(trackedRow);
  // A posting that has been evaluated shows once, as its tracked row.
  const trackedUrls = new Set(tracked.map((r) => normalizeUrlKey(r.url)).filter(Boolean));
  const fresh = pendingInbox(inbox)
    .filter((j) => !trackedUrls.has(normalizeUrlKey(j.url)))
    .map(newRow);
  return [...fresh, ...tracked];
}
