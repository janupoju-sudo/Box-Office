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
  normalizeUrlKey,
  scoreTone,
  sponsorBadge,
  statusGroup,
} from "@/lib/boxoffice/sheet-parse.mjs";

type Sponsor = { found: boolean; tier: string; name: string; lca: number | null; perm: number | null; lastYear: number | null; installed: boolean };
type SortKey = "company" | "role" | "score" | "sponsor" | "status" | "date";

const MAX_PARALLEL_LOOKUPS = 3;

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

export function JobSheet({ rows }: { rows: SheetRow[] }) {
  const router = useRouter();
  const { jobs, startJob } = useJobs();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string>("All");
  const [sponsorOnly, setSponsorOnly] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "date", dir: -1 });
  const [selected, setSelected] = useState<SheetRow | null>(null);
  const [applyQueue, setApplyQueue] = useState<string[]>([]);

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
  // row, continue straight to that row's review screen.
  useEffect(() => {
    if (applyQueue.length === 0) return;
    for (const url of applyQueue) {
      const hit = rows.find((r) => r.kind === "tracked" && r.n && normalizeUrlKey(r.url) === normalizeUrlKey(url));
      if (hit) {
        setApplyQueue((q) => q.filter((u) => u !== url));
        router.push(`/sheet/${encodeURIComponent(hit.n!)}/apply`);
        return;
      }
    }
  }, [rows, applyQueue, router]);

  const evaluating = useCallback(
    (url: string) => jobs.some((j) => j.kind === "evaluate" && j.input === url && j.status === "running"),
    [jobs],
  );

  const startEvaluate = (row: SheetRow, thenApply: boolean) => {
    const id = startJob({ title: `Evaluate · ${row.company || "job"}`, subtitle: row.role || row.url, kind: "evaluate", input: row.url, page: "/sheet" });
    if (id && thenApply) setApplyQueue((q) => (q.includes(row.url) ? q : [...q, row.url]));
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: rows.length };
    for (const r of rows) c[statusGroup(r.status)] = (c[statusGroup(r.status)] ?? 0) + 1;
    return c;
  }, [rows]);

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

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-foreground">Job Sheet</h1>
          <p className="text-sm text-muted">
            Every job in one place. Click a row for the full posting and evaluation; Apply prepares everything and you press Submit.
          </p>
        </div>
        <AddJob existing={rows.map((r) => r.url)} onAdded={() => router.refresh()} />
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Status">
          {STATUS_GROUPS.map((g: string) => (
            <button
              key={g}
              role="tab"
              aria-selected={group === g}
              onClick={() => setGroup(g)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors max-sm:min-h-[44px] ${
                group === g ? "bg-brand-soft text-brand-text" : "text-muted hover:bg-surface-hover hover:text-foreground"
              }`}
            >
              {g} <span className="tabular-nums text-faint">{counts[g] ?? 0}</span>
            </button>
          ))}
        </div>
        <label className="ml-auto inline-flex items-center gap-2 text-xs text-muted max-sm:min-h-[44px]">
          <input type="checkbox" checked={sponsorOnly} onChange={(e) => setSponsorOnly(e.target.checked)} className="accent-[var(--color-brand)]" />
          Strong or moderate sponsors only
        </label>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search company, role, location…"
            className="w-full rounded-md border border-border bg-surface py-1.5 pl-8 pr-2 text-sm text-foreground placeholder:text-faint focus:border-brand/50 focus:outline-none max-sm:min-h-[44px]"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[960px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-faint">
              <Th label="Company" k="company" sort={sort} onSort={toggleSort} />
              <Th label="Role" k="role" sort={sort} onSort={toggleSort} />
              <th className="px-3 py-2">Location</th>
              <th className="px-3 py-2">Pay</th>
              <Th label="Fit" k="score" sort={sort} onSort={toggleSort} />
              <Th label="Sponsorship" k="sponsor" sort={sort} onSort={toggleSort} />
              <Th label="Status" k="status" sort={sort} onSort={toggleSort} />
              <Th label="Date" k="date" sort={sort} onSort={toggleSort} />
              <th className="px-3 py-2 text-right">Apply</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-sm text-muted">
                  {rows.length === 0 ? "No jobs yet. Paste a posting link above, or run a scan." : "No jobs match these filters."}
                </td>
              </tr>
            )}
            {visible.map((r) => (
              <tr
                key={r.key}
                onClick={() => setSelected(r)}
                className={`cursor-pointer border-b border-border/70 transition-colors last:border-0 hover:bg-surface-hover ${
                  selected?.key === r.key ? "bg-surface-hover" : ""
                }`}
              >
                <td className="px-3 py-2 font-medium text-foreground">{r.company || <span className="text-faint">Unknown</span>}</td>
                <td className="max-w-[260px] truncate px-3 py-2 text-foreground" title={r.role}>
                  {r.role || <span className="text-faint">—</span>}
                </td>
                <td className="max-w-[180px] truncate px-3 py-2 text-muted" title={r.location}>
                  {r.location || "—"}
                </td>
                <td className="max-w-[160px] truncate px-3 py-2 text-muted" title={r.pay}>
                  {r.pay || "—"}
                </td>
                <td className="px-3 py-2">
                  {r.score == null ? <span className="text-faint">—</span> : <Badge tone={scoreTone(r.score) as "good"}>{r.score.toFixed(1)}</Badge>}
                </td>
                <td className="px-3 py-2">
                  <SponsorCell sponsor={sponsorOf(r.company)} />
                </td>
                <td className="px-3 py-2 text-muted">{r.status}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted">{r.date || "—"}</td>
                <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                  <ApplyCell row={r} evaluating={evaluating(r.url)} queued={applyQueue.includes(r.url)} onEvaluate={startEvaluate} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
      <button onClick={() => onSort(k)} className={`inline-flex items-center gap-1 uppercase hover:text-foreground ${active ? "text-foreground" : ""}`}>
        {label}
        {active && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </th>
  );
}

function SponsorCell({ sponsor }: { sponsor: Sponsor | "loading" | undefined }) {
  if (!sponsor) return <span className="text-faint">—</span>;
  if (sponsor === "loading") return <Loader2 className="size-3.5 animate-spin text-faint" aria-label="Checking" />;
  if (!sponsor.installed) return <span className="text-xs text-faint" title="Install the H-1B data: node plugins/h1b-sponsor/install-h1b-index.mjs">Not set up</span>;
  const b = sponsorBadge(sponsor.tier);
  const title = sponsor.found
    ? `${sponsor.name}: ${sponsor.lca ?? 0} H-1B filings, ${sponsor.perm ?? 0} green-card filings, last ${sponsor.lastYear ?? "?"}`
    : "No matching employer in US Department of Labor filings";
  return (
    <Badge tone={b.tone as "good"} title={title}>
      {b.label}
    </Badge>
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
  onEvaluate: (row: SheetRow, thenApply: boolean) => void;
}) {
  if (row.kind === "tracked" && row.n) {
    const strong = (row.score ?? 0) >= 4;
    return (
      <Link
        href={`/sheet/${encodeURIComponent(row.n)}/apply`}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors max-sm:min-h-[44px] ${
          strong
            ? "bg-brand text-brand-foreground hover:bg-brand-200"
            : "border border-border text-muted hover:border-foreground/20 hover:text-foreground"
        }`}
        title={strong ? "Review documents and apply" : "Below the 4.0 apply line — review before applying"}
      >
        <Send className="size-3.5" /> Apply
      </Link>
    );
  }
  if (evaluating || queued) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand-soft px-3 py-1 text-xs font-medium text-brand-text">
        <Loader2 className="size-3.5 animate-spin" /> Evaluating…
      </span>
    );
  }
  return (
    <button
      onClick={() => onEvaluate(row, true)}
      className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted transition-colors hover:border-brand/40 hover:text-brand-text max-sm:min-h-[44px]"
      title="Evaluates the job with your Claude first (uses tokens), then opens the review screen"
    >
      <Send className="size-3.5" /> Apply
    </button>
  );
}

function AddJob({ existing, onAdded }: { existing: string[]; onAdded: () => void }) {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<{ busy: boolean; msg: string }>({ busy: false, msg: "" });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const u = url.trim();
    if (!/^https?:\/\/\S+$/i.test(u)) {
      setState({ busy: false, msg: "Paste a full link starting with https://" });
      return;
    }
    if (existing.some((e) => normalizeUrlKey(e) === normalizeUrlKey(u))) {
      setState({ busy: false, msg: "Already in your sheet." });
      return;
    }
    setState({ busy: true, msg: "" });
    try {
      const res = await fetch("/api/explore/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offers: [{ url: u, company: "", title: "", location: "", postedAt: "", ats: "", source: "boxoffice" }] }),
      });
      const data = (await res.json()) as { added?: number; error?: string };
      if (data.error || !data.added) {
        setState({ busy: false, msg: data.error || "Already in your list, or could not be added." });
        return;
      }
      setUrl("");
      setState({ busy: false, msg: "Added." });
      onAdded();
    } catch {
      setState({ busy: false, msg: "Could not reach the app server." });
    }
  };
  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-1 sm:w-auto">
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a job posting link"
          aria-label="Job posting link"
          className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-faint focus:border-brand/50 focus:outline-none sm:w-80 max-sm:min-h-[44px]"
        />
        <button
          type="submit"
          disabled={state.busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-foreground hover:bg-brand-200 disabled:opacity-50 max-sm:min-h-[44px]"
        >
          {state.busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add
        </button>
      </div>
      {state.msg && <p className="text-xs text-muted">{state.msg}</p>}
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
  onEvaluate: (row: SheetRow, thenApply: boolean) => void;
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
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-label={`${row.company} ${row.role}`}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-border bg-surface shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-faint">{row.company || "Unknown company"}</p>
            <h2 className="text-lg font-semibold text-foreground">{row.role || "Untitled role"}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
              {row.score != null && <Badge tone={scoreTone(row.score) as "good"}>Fit {row.score.toFixed(1)}/5</Badge>}
              <SponsorCell sponsor={sponsor} />
              <span>{row.status}</span>
              {row.location && <span>· {row.location}</span>}
              {row.pay && <span>· {row.pay}</span>}
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-faint hover:bg-surface-hover hover:text-foreground" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          {row.kind === "tracked" ? (
            <>
              <button onClick={() => setTab("jd")} className={`rounded-md px-2.5 py-1 text-xs font-medium ${tab === "jd" ? "bg-brand-soft text-brand-text" : "text-muted hover:text-foreground"}`}>
                Job description
              </button>
              <button
                onClick={() => setTab("evaluation")}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${tab === "evaluation" ? "bg-brand-soft text-brand-text" : "text-muted hover:text-foreground"}`}
              >
                Evaluation
              </button>
            </>
          ) : (
            <span className="text-xs text-muted">Not evaluated yet</span>
          )}
          <span className="ml-auto flex items-center gap-2">
            {row.url && (
              <a href={row.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground">
                Posting <ExternalLink className="size-3" />
              </a>
            )}
            <ApplyCell row={row} evaluating={evaluating} queued={false} onEvaluate={onEvaluate} />
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {row.kind !== "tracked" ? (
            <div className="space-y-3 text-sm text-muted">
              <p>This job hasn&apos;t been evaluated yet, so its description and fit score aren&apos;t stored.</p>
              <p>
                <strong className="text-foreground">Apply</strong> runs the evaluation with your Claude, then opens the review screen. Or just evaluate it for
                now:
              </p>
              <button
                onClick={() => onEvaluate(row, false)}
                disabled={evaluating}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-hover disabled:opacity-50"
              >
                {evaluating && <Loader2 className="size-4 animate-spin" />} Evaluate only
              </button>
            </div>
          ) : loading ? (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="size-4 animate-spin" /> Loading…
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
