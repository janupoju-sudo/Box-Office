// applydesk: pure helpers for the Job Sheet (plain .mjs so tests can import
// them directly under Node, like the rest of web/src/lib).

/**
 * Value of a report header field ("**URL:** …"), "" when absent.
 * @param {{label: string, value: string}[]} fields
 * @param {string} label
 */
export function reportFieldValue(fields, label) {
  const want = label.toLowerCase();
  const hit = (fields || []).find((f) => String(f.label || "").toLowerCase() === want);
  return hit ? String(hit.value || "").trim() : "";
}

const PAY_LABEL = /^(comp|compensation|salary|pay|base(?: salary)?|salary range|posted range|comp range)$/i;

/**
 * Best-effort pay line from a report: a "**Salary:** …" style header line, or a
 * table row whose first cell is a pay label. "" when the report states none.
 * @param {string} md
 */
export function payFromReport(md) {
  if (!md) return "";
  for (const line of md.split(/\r?\n/)) {
    const header = line.match(/^\*\*([^*:]{2,40}):\*\*\s*(.+)$/);
    if (header && PAY_LABEL.test(header[1].trim())) return clip(header[2]);
    const cells = line.split("|").map((c) => c.replace(/\*\*/g, "").trim());
    if (cells.length >= 4 && PAY_LABEL.test(cells[1])) {
      const v = cells[2];
      if (v && !/^-+$/.test(v)) return clip(v);
    }
  }
  return "";
}

function clip(s) {
  const t = String(s).replace(/\s+/g, " ").trim();
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
}

/**
 * "4.2/5" → 4.2; anything unparseable → null.
 * @param {string} s
 */
export function scoreNumber(s) {
  const m = String(s || "").match(/(\d+(?:\.\d+)?)\s*(?:\/\s*5)?/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return Number.isFinite(v) && v >= 0 && v <= 5 ? v : null;
}

/**
 * Comparable form of a posting URL: no protocol, no query/hash, no trailing
 * slash, lowercase host. "" for empty input.
 * @param {string} url
 */
export function normalizeUrlKey(url) {
  if (!url) return "";
  try {
    const u = new URL(url);
    return `${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return String(url).trim().replace(/[?#].*$/, "").replace(/\/+$/, "");
  }
}

/**
 * The verbatim job-description section of a report, and the rest (the
 * evaluation). Either may be "".
 * @param {string} md
 * @returns {{ jd: string, evaluation: string }}
 */
export function splitReport(md) {
  if (!md) return { jd: "", evaluation: "" };
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+Job Description\b/i.test(l));
  if (start < 0) return { jd: "", evaluation: md };
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  const jd = lines.slice(start + 1, end).join("\n").trim();
  const evaluation = [...lines.slice(0, start), ...lines.slice(end)].join("\n").trim();
  return { jd, evaluation };
}

/** Sponsorship tiers from the H-1B plugin, worst-to-best ordering for sorting. */
export const SPONSOR_RANK = { none: 0, weak: 1, "staffing-shop": 1, unknown: 2, moderate: 3, strong: 4 };

/**
 * Tone + short label for a sponsorship tier.
 * @param {string} tier
 */
export function sponsorBadge(tier) {
  switch (tier) {
    case "strong":
      return { tone: "good", label: "Strong" };
    case "moderate":
      return { tone: "info", label: "Moderate" };
    case "weak":
      return { tone: "warn", label: "Weak" };
    case "staffing-shop":
      return { tone: "warn", label: "Staffing firm" };
    case "none":
      return { tone: "bad", label: "None" };
    default:
      return { tone: "muted", label: "Unknown" };
  }
}

/** Job Sheet status groups, in tab order. */
export const STATUS_GROUPS = ["All", "New", "To apply", "Applied", "Closed"];

/**
 * Which tab a row's status belongs to.
 * @param {string} status
 * @returns {"New" | "To apply" | "Applied" | "Closed"}
 */
export function statusGroup(status) {
  const s = String(status || "").trim().toLowerCase();
  if (!s || s === "new") return "New";
  if (["rejected", "discarded", "skip", "no aplicar", "closed"].includes(s)) return "Closed";
  if (["applied", "responded", "assessment", "interview", "offer", "hired"].includes(s)) return "Applied";
  return "To apply";
}

/**
 * Tone for a fit score badge (career-ops' apply line is 4.0/5).
 * @param {number | null} score
 */
export function scoreTone(score) {
  if (score == null) return "muted";
  if (score >= 4) return "good";
  if (score >= 3) return "warn";
  return "bad";
}

/**
 * Value of the first markdown table row whose first cell matches `label`
 * (case-insensitive, bold markers ignored), e.g. the report's "TL;DR" row.
 * @param {string} md
 * @param {string} label
 */
export function tableValue(md, label) {
  if (!md) return "";
  const want = label.toLowerCase();
  for (const line of md.split(/\r?\n/)) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.split("|").map((c) => c.replace(/\*\*/g, "").trim());
    if (cells.length >= 4 && cells[1].toLowerCase() === want) return cells[2];
  }
  return "";
}
