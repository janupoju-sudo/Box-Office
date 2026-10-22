"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ExternalLink, Loader2, Plus, Search, Send, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "@/components/ui/badge";
import { useJobs } from "@/components/jobs/job-store";
import type { SheetRow } from "@/lib/boxoffice/sheet-rows";
import {
  SPONSOR_RANK,
  STATUS_GROUPS,
  samePosting,
  scoreTone,
  sponsorBadge,
  statusGroup,
} from "@/lib/boxoffice/sheet-parse.mjs";

type Sponsor = { found: boolean; tier: string; name: string; lca: number | null; perm: number | null; lastYear: number | null; installed: boolean };
type SortKey = "company" | "role" | "score" | "sponsor" | "status" | "date";

const MAX_PARALLEL_LOOKUPS = 3;
/** Evaluations run on the user's own Claude Code: two at a time keeps the Mac responsive. */
const MAX_PARALLEL_SCORES = 2;

const SPONSOR_DOT: Record<string, string> = {
  strong: "#30d158",
  moderate: "#0a84ff",
  weak: "#ff9f0a",
  "staffing-shop": "#ff9f0a",
  none: "#ff453a",
};

/** Lazily fetch the H-1B sponsorship tier for each distinct company. */
function useSponsors(companies: string[]) {
  const [map, setMap] = useState<Record<string, Sponsor | "loading">>({});
  const started = useRef(new Set<string>());
  useEffect(() => {
    const queue = companies.filter((c) => c && !started.current.has(c.toLowerCase()));
    if (queue.length === 0) return;
    queue.forEach((c) => started.current.add(c.toLowerCase()));
    setMap((m) => ({ ...m, ...Object.fromEntries(queue.map((c) => [c.toLowerCase(), "loading" as const])) }));
    let cancelled = false;
    const work = async () => {
      while (queue.length && !cancelled) {
        const company = queue.shift()!;
        try {
          const res = await fetch(`/api/boxoffice/sponsor?company=${encodeURIComponent(company)}`);
          const data = (await res.json()) as Sponsor;
          if (!cancelled) setMap((m) => ({ ...m, [company.toLowerCase()]: data }));
        } catch {
          if (!cancelled) setMap((m) => ({ ...m, [company.toLowerCase()]: { found: false, tier: "unknown", name: company, lca: null, perm: null, lastYear: null, installed: true } }));
        }
      }
    };
    for (let i = 0; i < MAX_PARALLEL_LOOKUPS; i++) void work();
    return () => {
      cancelled = true;
    };
  }, [companies]);
  return map;
}

function longDate(d = new Date()) {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

export function JobSheet({ rows }: { rows: SheetRow[] }) {
  const router = useRouter();
  const { jobs, startJob } = useJobs();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string>("All");
  const [sponsorOnly, setSponsorOnly] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "date", dir: -1 });
  const [selected, setSelected] = useState<SheetRow | null>(null);
  const [applyQueue, setApplyQueue] = useState<string[]>([]);
  const [scoreQueue, setScoreQueue] = useState<string[]>([]);
  const [scoreBatch, setScoreBatch] = useState<{ id: string; total: number } | null>(null);
  const [notice, setNotice] = useState("");
  const [today, setToday] = useState("");

  useEffect(() => setToday(longDate()), []);

  const companies = useMemo(() => Array.from(new Set(rows.map((r) => r.company).filter(Boolean))), [rows]);
  const sponsors = useSponsors(companies);
  const sponsorOf = useCallback(
    (company: string): Sponsor | "loading" | undefined => (company ? sponsors[company.toLowerCase()] : undefined),
    [sponsors],
  );

  // A finished worker wrote new tracker rows: re-read the files.
  useEffect(() => {
    const onDone = () => router.refresh();
    window.addEventListener("co-job-done", onDone);
    return () => window.removeEventListener("co-job-done", onDone);
  }, [router]);

  // "Apply" on a not-yet-evaluated job: once its evaluation lands as a tracked
  // row, continue straight to that row's review screen. A run that failed, or
  // finished without a row we can find, leaves the queue instead of spinning.
  useEffect(() => {
    if (applyQueue.length === 0) return;
    for (const url of applyQueue) {
      const hit = rows.find((r) => r.kind === "tracked" && r.n && samePosting(r.url, url));
      // Newest first: jobs are prepended, so this is the run Apply started.
      const run = jobs.find((j) => j.kind === "evaluate" && j.input === url);
      const reportN = run?.status === "done" && typeof run.reportN === "number" ? run.reportN : null;
      const n = hit?.n ?? (reportN != null ? rows.find((r) => r.kind === "tracked" && Number(r.n) === reportN)?.n : null);
      if (n) {
        setApplyQueue((q) => q.filter((u) => u !== url));
        router.push(`/sheet/${encodeURIComponent(n)}/apply`);
        return;
      }
      if (run?.status === "error") {
        setApplyQueue((q) => q.filter((u) => u !== url));
        setNotice(`Scoring failed: ${run.steps[run.steps.length - 1]?.label ?? "the run stopped"}. Open its log from the sidebar.`);
        return;
      }
      // Done, and the refreshed rows still have no match: stop waiting.
      if (run?.status === "done" && !rows.some((r) => r.kind === "new" && r.url === url)) {
        setApplyQueue((q) => q.filter((u) => u !== url));
        setNotice("Scored. Find the job in the sheet and press Apply.");
        return;
      }
    }
  }, [rows, jobs, applyQueue, router]);

  const evaluating = useCallback(
    (url: string) => jobs.some((j) => j.kind === "evaluate" && j.input === url && j.status === "running"),
    [jobs],
  );

  const startEvaluate = useCallback(
    (row: SheetRow, thenApply: boolean, batchId?: string) => {
      const id = startJob({ title: `Score · ${row.company || "job"}`, subtitle: row.role || row.url, kind: "evaluate", input: row.url, page: "/sheet", batchId });
      if (id && thenApply) setApplyQueue((q) => (q.includes(row.url) ? q : [...q, row.url]));
      return id;
    },
    [startJob],
  );

  // "Score new jobs": run the queue MAX_PARALLEL_SCORES at a time; stop at the
  // first failure (no AI configured, a crashed run) instead of burning through it.
  useEffect(() => {
    if (!scoreBatch) return;
    const mine = jobs.filter((j) => j.batchId === scoreBatch.id);
    const failed = mine.find((j) => j.status === "error");
    if (failed) {
      setScoreQueue([]);
      setScoreBatch(null);
      setNotice(`Scoring stopped: ${failed.steps[failed.steps.length - 1]?.label ?? "a run failed"}. Open its log from the sidebar.`);
      return;
    }
    const running = jobs.filter((j) => j.kind === "evaluate" && j.status === "running").length;
    if (scoreQueue.length === 0) {
      if (running === 0 && mine.length > 0 && mine.every((j) => j.status === "done")) setScoreBatch(null);
      return;
    }
    if (running >= MAX_PARALLEL_SCORES) return;
    const [next, ...rest] = scoreQueue;
    setScoreQueue(rest);
    const row = rows.find((r) => r.url === next);
    if (row && !evaluating(next)) startEvaluate(row, false, scoreBatch.id);
  }, [jobs, scoreQueue, scoreBatch, rows, evaluating, startEvaluate]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: rows.length };
    for (const r of rows) c[statusGroup(r.status)] = (c[statusGroup(r.status)] ?? 0) + 1;
    return c;
  }, [rows]);

  const newRows = useMemo(() => rows.filter((r) => r.kind === "new"), [rows]);
  const toApply = counts["To apply"] ?? 0;
  const applied = counts["Applied"] ?? 0;
  const scoring = scoreBatch !== null;
  const scoringLeft = scoreQueue.length + jobs.filter((j) => scoreBatch && j.batchId === scoreBatch.id && j.status === "running").length;

  const scoreAll = () => {
    const urls = newRows.filter((r) => !evaluating(r.url)).map((r) => r.url);
    if (urls.length === 0) return;
    setNotice("");
    setScoreBatch({ id: `score-${Date.now()}`, total: urls.length });
    setScoreQueue(urls);
  };
  const stopScoring = () => {
    setScoreQueue([]);
    setScoreBatch(null);
    setNotice("Stopped. Jobs already being scored will finish.");
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (group !== "All" && statusGroup(r.status) !== group) return false;
      if (sponsorOnly) {
        const s = sponsorOf(r.company);
        if (!s || s === "loading" || !["strong", "moderate"].includes(s.tier)) return false;
      }
      if (!q) return true;
      return [r.company, r.role, r.location, r.status, r.notes].some((v) => v.toLowerCase().includes(q));
    });
    const val = (r: SheetRow): string | number => {
      switch (sort.key) {
        case "score":
          return r.score ?? -1;
        case "sponsor": {
          const s = sponsorOf(r.company);
          return s && s !== "loading" ? (SPONSOR_RANK as Record<string, number>)[s.tier] ?? 2 : 2;
        }
        case "date":
          return r.date || "";
        default:
          return (r[sort.key] || "").toLowerCase();
      }
    };
    return [...filtered].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return x < y ? -sort.dir : x > y ? sort.dir : 0;
    });
  }, [rows, query, group, sponsorOnly, sort, sponsorOf]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "company" || key === "role" ? 1 : -1 }));

  const headline =
    newRows.length > 0
      ? `${newRows.length} new job${newRows.length === 1 ? "" : "s"} not scored yet.`
      : toApply > 0
        ? `${toApply} scored job${toApply === 1 ? "" : "s"} ready for you.`
        : rows.length > 0
          ? "Nothing waiting on you."
          : "No jobs yet.";
  const subline = scoring
    ? `Scoring with your Claude Code, ${MAX_PARALLEL_SCORES} at a time. ${scoringLeft} left. Counts toward your Claude plan usage.`
    : newRows.length > 0
      ? "Scoring counts toward your Claude plan usage. Check the Usage bars in the sidebar."
      : "Paste a job link or run a scan to add more.";

  return (
    <div className="mx-auto w-full max-w-[1320px] px-5 pb-12 pt-4 md:px-6">
      <header className="flex flex-wrap items-center gap-2.5">
        <h1 className="mr-2 text-[15px] font-bold text-foreground">Job Sheet</h1>
        <div className="glass-control flex flex-wrap gap-0.5 rounded-full p-[3px]" role="tablist" aria-label="Status">
          {STATUS_GROUPS.map((g: string) => (
            <button
              key={g}
              role="tab"
              aria-selected={group === g}
              onClick={() => setGroup(g)}
              className={`min-h-[28px] rounded-full px-3.5 text-xs transition-colors max-sm:min-h-[44px] ${
                group === g ? "glass-selected font-semibold text-foreground" : "glass-hover text-foreground/80"
              }`}
            >
              {g} <span className="tabular-nums">{counts[g] ?? 0}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={sponsorOnly}
          onClick={() => setSponsorOnly((v) => !v)}
          className={`glass-control min-h-[34px] rounded-full px-3.5 text-xs font-medium transition-colors max-sm:min-h-[44px] ${
            sponsorOnly ? "text-brand-text" : "text-foreground/85"
          }`}
          title="Only show employers with a strong or moderate H-1B sponsorship record"
        >
          {sponsorOnly ? "✓ " : ""}Sponsors only
        </button>
        <label className="glass-control ml-auto flex min-h-[34px] w-full items-center gap-1.5 rounded-full px-3 sm:w-44 max-sm:min-h-[44px]">
          <Search className="size-3.5 shrink-0 text-muted" aria-hidden />
          <span className="sr-only">Search jobs</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="w-full bg-transparent text-[13px] text-foreground placeholder:text-faint focus:outline-none"
          />
        </label>
        <AddJob existing={rows.map((r) => r.url)} onAdded={() => router.refresh()} onMessage={setNotice} />
      </header>

      {notice && (
        <p role="status" className="mt-2 text-xs text-muted">
          {notice}
        </p>
      )}

      <section aria-label="Summary" className="glass mt-4 flex flex-wrap items-center gap-4 rounded-[18px] px-6 py-5">
        <div className="flex min-w-[260px] flex-1 flex-col gap-1">
          <span className="text-xs text-muted">{today}</span>
          <h2 className="text-[22px] font-bold tracking-tight text-foreground">{headline}</h2>
          <span className="text-[13px] text-muted">
            {subline}
            {applied > 0 && ` ${applied} applied so far.`}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {scoring ? (
            <button
              type="button"
              onClick={stopScoring}
              className="glass-control inline-flex min-h-[34px] items-center gap-2 rounded-full px-[18px] text-[13px] font-medium text-foreground max-sm:min-h-[44px]"
            >
              <Loader2 className="size-3.5 animate-spin text-brand-text" aria-hidden /> Stop scoring
            </button>
          ) : (
            newRows.length > 0 && (
              <button
                type="button"
                onClick={scoreAll}
                className="inline-flex min-h-[34px] items-center rounded-full bg-brand px-[18px] text-[13px] font-semibold text-brand-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_4px_14px_rgb(0_0_0/0.25)] hover:bg-brand-200 max-sm:min-h-[44px]"
              >
                Score {newRows.length} new job{newRows.length === 1 ? "" : "s"}
              </button>
            )
          )}
          <Link
            href="/explore"
            className="glass-control inline-flex min-h-[34px] items-center rounded-full px-[18px] text-[13px] font-medium text-foreground max-sm:min-h-[44px]"
          >
            Find jobs
          </Link>
        </div>
      </section>

      <div className="mt-3.5 overflow-x-auto rounded-[14px] border border-border bg-surface shadow-[0_10px_40px_var(--glass-shadow)]">
        <table className="w-full min-w-[1060px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-[11px] font-semibold text-faint">
              <th className="w-10 px-3 py-2"><span className="sr-only">Logo</span></th>
              <Th label="Company" k="company" sort={sort} onSort={toggleSort} />
              <Th label="Role" k="role" sort={sort} onSort={toggleSort} />
              <th className="px-3 py-2">Location</th>
              <th className="px-3 py-2">Pay</th>
              <Th label="Fit" k="score" sort={sort} onSort={toggleSort} />
              <Th label="Sponsorship" k="sponsor" sort={sort} onSort={toggleSort} />
              <Th label="Status" k="status" sort={sort} onSort={toggleSort} />
              <Th label="Added" k="date" sort={sort} onSort={toggleSort} />
              <th className="px-3 py-2 text-right"><span className="sr-only">Apply</span></th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-12 text-center text-sm text-muted">
                  {rows.length === 0 ? "No jobs yet. Paste a posting link above, or find jobs." : "No jobs match these filters."}
                </td>
              </tr>
            )}
            {visible.map((r) => {
              const busy = evaluating(r.url);
              return (
                <tr
                  key={r.key}
                  onClick={() => setSelected(r)}
                  className={`h-[46px] cursor-pointer transition-colors odd:bg-surface even:bg-[var(--zebra)] hover:!bg-surface-hover ${
                    selected?.key === r.key ? "!bg-brand-soft" : ""
                  }`}
                >
                  <td className="px-3">
                    <span aria-hidden className="flex size-6 items-center justify-center rounded-[7px] bg-surface-hover text-[11px] font-bold text-muted">
                      {(r.company || "?").slice(0, 1).toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 font-semibold text-foreground">{r.company || <span className="font-normal text-faint">Unknown</span>}</td>
                  <td className="max-w-[300px] truncate px-3 text-foreground/90" title={r.role}>
                    {r.role || <span className="text-faint">—</span>}
                  </td>
                  <td className="max-w-[180px] truncate px-3 text-muted" title={r.location}>
                    {r.location || "—"}
                  </td>
                  <td className="max-w-[150px] truncate px-3 text-muted" title={r.pay}>
                    {r.pay || <span className="text-faint">—</span>}
                  </td>
                  <td className="px-3">
                    {r.score == null ? <span className="text-faint">—</span> : <Badge tone={scoreTone(r.score) as "good"}>{r.score.toFixed(1)}</Badge>}
                  </td>
                  <td className="px-3">
                    <SponsorCell sponsor={sponsorOf(r.company)} />
                  </td>
                  <td className="px-3">
                    {busy ? (
                      <span className="inline-flex items-center gap-1.5 text-brand-text">
                        <Loader2 className="size-3 animate-spin" aria-hidden /> Scoring…
                      </span>
                    ) : (
                      <span className="text-foreground/85">{r.status}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 tabular-nums text-muted">{r.date || "—"}</td>
                  <td className="px-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <ApplyCell row={r} evaluating={busy} queued={applyQueue.includes(r.url)} onEvaluate={startEvaluate} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="border-t border-border px-4 py-2.5 text-xs text-faint">
          Showing {visible.length} of {rows.length} · Sponsorship is each employer&apos;s H-1B filing history from US Department of Labor records
        </div>
      </div>

      {selected && (
        <DetailPanel
          row={selected}
          sponsor={sponsorOf(selected.company)}
          evaluating={evaluating(selected.url)}
          onEvaluate={startEvaluate}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function Th({ label, k, sort, onSort }: { label: string; k: SortKey; sort: { key: SortKey; dir: 1 | -1 }; onSort: (k: SortKey) => void }) {
  const active = sort.key === k;
  return (
    <th className="px-3 py-2" aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button onClick={() => onSort(k)} className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : ""}`}>
        {label}
        {active && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </th>
  );
}

function SponsorCell({ sponsor }: { sponsor: Sponsor | "loading" | undefined }) {
  if (!sponsor) return <span className="text-faint">—</span>;
  if (sponsor === "loading") return <Loader2 className="size-3.5 animate-spin text-faint" aria-label="Checking" />;
  if (!sponsor.installed)
    return (
      <span className="text-xs text-faint" title="Install the H-1B data: node plugins/h1b-sponsor/install-h1b-index.mjs">
        Not set up
      </span>
    );
  const b = sponsorBadge(sponsor.tier);
  const title = sponsor.found
    ? `${sponsor.name}: ${sponsor.lca ?? 0} H-1B filings, ${sponsor.perm ?? 0} green-card filings, last ${sponsor.lastYear ?? "?"}`
    : "No matching employer in US Department of Labor filings";
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={title}>
      <span aria-hidden className="size-[7px] rounded-full" style={{ background: SPONSOR_DOT[sponsor.tier] ?? "#8e8e93" }} />
      <span className="text-foreground/90">{b.label}</span>
      {sponsor.found && sponsor.lca != null && <span className="tabular-nums text-faint">{sponsor.lca.toLocaleString("en-US")} filings</span>}
    </span>
  );
}

function ApplyCell({
  row,
  evaluating,
  queued,
  onEvaluate,
}: {
  row: SheetRow;
  evaluating: boolean;
  queued: boolean;
  onEvaluate: (row: SheetRow, thenApply: boolean) => string | null;
}) {
  if (row.kind === "tracked" && row.n) {
    const strong = (row.score ?? 0) >= 4;
    return (
      <Link
        href={`/sheet/${encodeURIComponent(row.n)}/apply`}
        className={`inline-flex min-h-[28px] items-center gap-1.5 rounded-full px-3.5 text-xs font-medium transition-colors max-sm:min-h-[44px] ${
          strong ? "bg-brand text-brand-foreground hover:bg-brand-200" : "border border-border bg-surface-hover text-foreground hover:border-foreground/25"
        }`}
        title={strong ? "Review documents and apply" : "Below the 4.0 apply line: review before applying"}
      >
        <Send className="size-3" aria-hidden /> Apply
      </Link>
    );
  }
  if (evaluating || queued) {
    return (
      <span className="inline-flex min-h-[28px] items-center gap-1.5 rounded-full border border-brand/40 bg-brand-soft px-3.5 text-xs font-medium text-brand-text">
        <Loader2 className="size-3 animate-spin" aria-hidden /> Scoring…
      </span>
    );
  }
  return (
    <button
      onClick={() => onEvaluate(row, true)}
      className="inline-flex min-h-[28px] items-center gap-1.5 rounded-full border border-border bg-surface-hover px-3.5 text-xs font-medium text-foreground transition-colors hover:border-foreground/25 max-sm:min-h-[44px]"
      title="Scores the job with your Claude Code first (counts toward your Claude plan usage), then opens the review screen"
    >
      <Send className="size-3" aria-hidden /> Apply
    </button>
  );
}

function AddJob({ existing, onAdded, onMessage }: { existing: string[]; onAdded: () => void; onMessage: (m: string) => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const u = url.trim();
    if (!/^https?:\/\/\S+$/i.test(u)) {
      onMessage("Paste a full job link starting with https://");
      return;
    }
    if (existing.some((x) => samePosting(x, u))) {
      onMessage("That job is already in your sheet.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/explore/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offers: [{ url: u, company: "", title: "", location: "", postedAt: "", ats: "", source: "boxoffice" }] }),
      });
      const data = (await res.json()) as { added?: number; error?: string };
      if (data.error || !data.added) {
        onMessage(data.error || "That link could not be added.");
        return;
      }
      setUrl("");
      onMessage("Added to your sheet.");
      onAdded();
    } catch {
      onMessage("Could not reach Box Office's local server.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="glass-control flex min-h-[34px] w-full items-center gap-1 rounded-full py-[3px] pl-3 pr-[3px] sm:w-[250px] max-sm:min-h-[44px]">
      <label className="sr-only" htmlFor="bo-add-job">
        Job posting link
      </label>
      <input
        id="bo-add-job"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste a job link"
        className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground placeholder:text-faint focus:outline-none"
      />
      <button
        type="submit"
        disabled={busy}
        className="inline-flex min-h-[28px] items-center gap-1 rounded-full bg-brand px-3 text-xs font-semibold text-brand-foreground hover:bg-brand-200 disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Plus className="size-3.5" aria-hidden />} Add
      </button>
    </form>
  );
}

function DetailPanel({
  row,
  sponsor,
  evaluating,
  onEvaluate,
  onClose,
}: {
  row: SheetRow;
  sponsor: Sponsor | "loading" | undefined;
  evaluating: boolean;
  onEvaluate: (row: SheetRow, thenApply: boolean) => string | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"jd" | "evaluation">("jd");
  const [detail, setDetail] = useState<{ jd: string; evaluation: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setTab("jd");
    setDetail(null);
    if (row.kind !== "tracked" || !row.n) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/boxoffice/detail?n=${encodeURIComponent(row.n)}`)
      .then((r) => r.json())
      .then((d: { jd?: string; evaluation?: string }) => {
        if (!cancelled) setDetail({ jd: d.jd ?? "", evaluation: d.evaluation ?? "" });
      })
      .catch(() => {
        if (!cancelled) setDetail({ jd: "", evaluation: "" });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [row.key, row.kind, row.n]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const body = tab === "jd" ? detail?.jd : detail?.evaluation;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/25" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-label={`${row.company} ${row.role}`}
        className="fixed inset-y-2.5 right-2.5 z-50 flex w-[calc(100%-20px)] max-w-2xl flex-col overflow-hidden rounded-[18px] border border-border bg-surface shadow-[0_20px_60px_rgb(0_0_0/0.35)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-5">
          <div className="min-w-0">
            <p className="text-xs text-muted">{row.company || "Unknown company"}</p>
            <h2 className="text-lg font-bold tracking-tight text-foreground">{row.role || "Untitled role"}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              {row.score != null && <Badge tone={scoreTone(row.score) as "good"}>Fit {row.score.toFixed(1)}/5</Badge>}
              <SponsorCell sponsor={sponsor} />
              <span>· {row.status}</span>
              {row.location && <span>· {row.location}</span>}
              {row.pay && <span>· {row.pay}</span>}
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-faint hover:bg-surface-hover hover:text-foreground" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-border px-5 py-2.5">
          {row.kind === "tracked" ? (
            <div className="flex gap-0.5 rounded-full bg-surface-hover p-[3px]" role="tablist" aria-label="Details">
              <button
                role="tab"
                aria-selected={tab === "jd"}
                onClick={() => setTab("jd")}
                className={`min-h-[26px] rounded-full px-3 text-xs ${tab === "jd" ? "bg-surface font-semibold text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
              >
                Job description
              </button>
              <button
                role="tab"
                aria-selected={tab === "evaluation"}
                onClick={() => setTab("evaluation")}
                className={`min-h-[26px] rounded-full px-3 text-xs ${tab === "evaluation" ? "bg-surface font-semibold text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
              >
                Evaluation
              </button>
            </div>
          ) : (
            <span className="text-xs text-muted">Not scored yet</span>
          )}
          <span className="ml-auto flex items-center gap-3">
            {row.url && (
              <a href={row.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground">
                Posting <ExternalLink className="size-3" aria-hidden />
              </a>
            )}
            <ApplyCell row={row} evaluating={evaluating} queued={false} onEvaluate={onEvaluate} />
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {row.kind !== "tracked" ? (
            <div className="space-y-3 text-sm text-muted">
              <p>This job hasn&apos;t been scored yet, so its description and fit score aren&apos;t stored.</p>
              <p>
                <strong className="text-foreground">Apply</strong> scores it with your Claude first, then opens the review screen. Or score it now:
              </p>
              <button
                onClick={() => onEvaluate(row, false)}
                disabled={evaluating}
                className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full border border-border bg-surface-hover px-4 text-[13px] font-medium text-foreground hover:border-foreground/25 disabled:opacity-50"
              >
                {evaluating && <Loader2 className="size-4 animate-spin" aria-hidden />} Score only
              </button>
            </div>
          ) : loading ? (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
            </p>
          ) : body ? (
            <div className="report-prose text-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-muted">
              {tab === "jd" ? "This report has no archived job description. Open the posting link above." : "No evaluation text found for this job."}
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
