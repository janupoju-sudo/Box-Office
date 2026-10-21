"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, ExternalLink, FolderDown, Loader2, ShieldAlert, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useJobs } from "@/components/jobs/job-store";
import { GeneratePdfButton } from "@/components/generate-pdf-button";
import { CoverDraftButton } from "@/components/cover-draft-button";
import { ApplyButton } from "@/components/apply-button";
import { scoreTone, sponsorBadge } from "@/lib/boxoffice/sheet-parse.mjs";

type Sponsor = { found: boolean; tier: string; name: string; lca: number | null; perm: number | null; lastYear: number | null; installed: boolean };

type Props = {
  n: string;
  company: string;
  role: string;
  location: string;
  status: string;
  score: number | null;
  tldr: string;
  legitimacy: string;
  postingUrl: string;
  cvReady: boolean;
  coverPdfReady: boolean;
  savedCv: boolean;
  savedCover: boolean;
};

const APPLIED = new Set(["applied", "responded", "assessment", "interview", "offer", "hired"]);

export function ApplyReview(p: Props) {
  const router = useRouter();
  const { jobs } = useJobs();
  const [sponsor, setSponsor] = useState<Sponsor | null>(null);
  const [coverText, setCoverText] = useState("");
  const [save, setSave] = useState<{ busy: boolean; msg: string; ok: boolean }>({ busy: false, msg: "", ok: false });
  const [marking, setMarking] = useState<{ busy: boolean; msg: string }>({ busy: false, msg: "" });

  useEffect(() => {
    if (!p.company) return;
    let cancelled = false;
    fetch(`/api/boxoffice/sponsor?company=${encodeURIComponent(p.company)}`)
      .then((r) => r.json())
      .then((d: Sponsor) => !cancelled && setSponsor(d))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [p.company]);

  // Re-read server props when a CV / cover worker finishes for this job.
  useEffect(() => {
    const onDone = () => router.refresh();
    window.addEventListener("co-job-done", onDone);
    return () => window.removeEventListener("co-job-done", onDone);
  }, [router]);

  const cvReady = p.cvReady || jobs.some((j) => j.kind === "pdf" && j.input === p.n && j.status === "done");
  const coverDraft = useMemo(
    () => jobs.filter((j) => j.kind === "cover" && j.input === p.n && j.status === "done").sort((a, b) => b.startedAt - a.startedAt)[0],
    [jobs, p.n],
  );
  const applied = APPLIED.has(p.status.trim().toLowerCase());
  const below = p.score != null && p.score < 4;
  const sponsorWeak = sponsor && sponsor.installed && ["none", "weak", "staffing-shop"].includes(sponsor.tier);

  const saveDocs = async () => {
    setSave({ busy: true, msg: "", ok: false });
    try {
      const res = await fetch("/api/boxoffice/save-docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ n: p.n, coverText }),
      });
      const d = (await res.json()) as { saved?: { kind: string; file: string }[]; missing?: string[]; error?: string };
      if (d.error) return setSave({ busy: false, msg: d.error, ok: false });
      const saved = d.saved ?? [];
      if (saved.length === 0) return setSave({ busy: false, msg: "Nothing to save yet. Generate the tailored CV first.", ok: false });
      setSave({ busy: false, msg: `Saved: ${saved.map((s) => s.file).join(", ")}`, ok: true });
      router.refresh();
    } catch {
      setSave({ busy: false, msg: "Could not reach the app server.", ok: false });
    }
  };

  const markApplied = async () => {
    setMarking({ busy: true, msg: "" });
    try {
      const res = await fetch("/api/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ n: p.n, status: "Applied" }) });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        return setMarking({ busy: false, msg: d.error || "Could not update the tracker." });
      }
      setMarking({ busy: false, msg: "" });
      router.refresh();
    } catch {
      setMarking({ busy: false, msg: "Could not reach the app server." });
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <Link href="/sheet" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="size-4" /> Job Sheet
      </Link>

      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-faint">{p.company}</p>
        <h1 className="font-display text-3xl text-foreground">{p.role}</h1>
        <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
          {p.score != null && <Badge tone={scoreTone(p.score) as "good"}>Fit {p.score.toFixed(1)}/5</Badge>}
          {sponsor && sponsor.installed && <Badge tone={sponsorBadge(sponsor.tier).tone as "good"}>Sponsorship: {sponsorBadge(sponsor.tier).label}</Badge>}
          {p.legitimacy && <Badge tone="muted">Posting: {p.legitimacy}</Badge>}
          <span>{p.status}</span>
          {p.location && <span>· {p.location}</span>}
          {p.postingUrl && (
            <a href={p.postingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
              · Posting <ExternalLink className="size-3" />
            </a>
          )}
        </div>
        {p.tldr && <p className="text-sm text-foreground">{p.tldr}</p>}
      </header>

      {(below || sponsorWeak) && (
        <div className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
          {below && (
            <p className="flex gap-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" /> This scored below 4.0, career-ops&apos; apply line. Read the evaluation before spending an application on it.
            </p>
          )}
          {sponsorWeak && sponsor && (
            <p className="flex gap-2">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              {sponsor.found
                ? `${sponsor.name} has little recent H-1B filing history (${sponsor.lca ?? 0} filings). Check the posting's sponsorship wording before applying.`
                : "No US Department of Labor sponsorship filings found under this company name. Check the posting's sponsorship wording."}
            </p>
          )}
        </div>
      )}

      <Step num={1} title="Tailored CV" done={cvReady}>
        <p className="text-sm text-muted">An ATS-friendly CV rewritten for this posting from your cv.md. It never invents facts; read it before you send it.</p>
        <GeneratePdfButton n={p.n} company={p.company} pdfReady={cvReady} />
        {cvReady && (
          <iframe
            title="Tailored CV preview"
            src={`/api/cv-pdf?n=${encodeURIComponent(p.n)}&company=${encodeURIComponent(p.company)}`}
            className="h-[560px] w-full rounded-md border border-border bg-white"
          />
        )}
      </Step>

      <Step num={2} title="Cover letter (if the application asks for one)" done={p.coverPdfReady || p.savedCover}>
        {p.coverPdfReady ? (
          <iframe
            title="Cover letter preview"
            src={`/api/cv-pdf?n=${encodeURIComponent(p.n)}&kind=cover`}
            className="h-[480px] w-full rounded-md border border-border bg-white"
          />
        ) : (
          <>
            <p className="text-sm text-muted">
              Answer three quick questions and your Claude drafts a letter for this role. Open the draft, edit it, and paste the final version below to keep it.
            </p>
            <CoverDraftButton n={p.n} company={p.company} />
            {coverDraft && (
              <Link href={`/jobs/${coverDraft.id}`} className="inline-flex items-center gap-1 text-sm text-brand-text hover:underline">
                Open the latest draft <ExternalLink className="size-3" />
              </Link>
            )}
            <textarea
              value={coverText}
              onChange={(e) => setCoverText(e.target.value)}
              rows={8}
              placeholder="Paste your final cover letter here to save it with this application (optional)."
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-faint focus:border-brand/50 focus:outline-none"
            />
          </>
        )}
      </Step>

      <Step num={3} title="Save copies to your Applications folder" done={p.savedCv}>
        <p className="text-sm text-muted">
          Copies the CV into <code>Applications/CVs</code> and the cover letter into <code>Applications/Cover Letters</code>, named after this job.
        </p>
        <button
          onClick={saveDocs}
          disabled={save.busy || (!cvReady && !coverText.trim() && !p.coverPdfReady)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-hover disabled:opacity-50 max-sm:min-h-[44px]"
        >
          {save.busy ? <Loader2 className="size-4 animate-spin" /> : <FolderDown className="size-4" />} Save copies
        </button>
        {save.msg && <p className={`text-xs ${save.ok ? "text-emerald-700 dark:text-emerald-400" : "text-muted"}`}>{save.msg}</p>}
      </Step>

      <Step num={4} title="Apply" done={applied}>
        <p className="text-sm text-muted">
          Opens the application in a browser on your computer and fills in what it can from your CV and evaluation. It stops before Submit. Check every
          answer, especially work authorization and sponsorship questions, then press Submit yourself.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <ApplyButton n={p.n} url={p.postingUrl} company={p.company} pdfReady={cvReady} quiet={below} />
          <Link href={`/pipeline/${encodeURIComponent(p.n)}/apply`} className="text-sm text-muted hover:text-foreground hover:underline">
            Or apply by hand with a copy-paste checklist
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {applied ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-4" /> Marked as {p.status}
            </span>
          ) : (
            <button
              onClick={markApplied}
              disabled={marking.busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-hover disabled:opacity-50 max-sm:min-h-[44px]"
            >
              {marking.busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} I submitted it: mark as Applied
            </button>
          )}
          {marking.msg && <span className="text-xs text-red-700 dark:text-red-400">{marking.msg}</span>}
        </div>
      </Step>
    </div>
  );
}

function Step({ num, title, done, children }: { num: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
        <span
          className={`inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums ${
            done ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-surface-hover text-muted"
          }`}
        >
          {done ? <CheckCircle2 className="size-4" /> : num}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}
