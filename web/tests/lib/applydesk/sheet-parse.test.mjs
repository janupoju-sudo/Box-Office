// applydesk: Job Sheet helpers.
// Run:  node --test tests/lib/applydesk/sheet-parse.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeUrlKey,
  payFromReport,
  reportFieldValue,
  scoreNumber,
  scoreTone,
  splitReport,
  sponsorBadge,
  statusGroup,
  tableValue,
} from "../../../src/lib/applydesk/sheet-parse.mjs";
import { docFileName } from "../../../src/lib/applydesk/doc-names.mjs";

const REPORT = `# Evaluation: Acme -- Data Scientist

**Date:** 2026-10-21
**Score:** 4.3/5
**URL:** https://jobs.example.com/acme/123
**Salary:** $95,000 - $115,000

## A) Role Summary

| Field | Value |
|-------|-------|
| **Remote** | Hybrid, Charlotte |
| **TL;DR** | Entry-level DS on the pricing team |

## Job Description (archived verbatim)

We are hiring a data scientist.
Python and SQL required.

## Verdict

Apply.
`;

test("scoreNumber reads tracker scores and rejects junk", () => {
  assert.equal(scoreNumber("4.2/5"), 4.2);
  assert.equal(scoreNumber("3"), 3);
  assert.equal(scoreNumber(""), null);
  assert.equal(scoreNumber("n/a"), null);
  assert.equal(scoreNumber("12/5"), null);
});

test("payFromReport finds a header pay line or a table row", () => {
  assert.equal(payFromReport(REPORT), "$95,000 - $115,000");
  assert.equal(payFromReport("| **Comp range** | $80k-$100k |\n"), "$80k-$100k");
  assert.equal(payFromReport("| **Compensation** | --- |\n"), "");
  assert.equal(payFromReport("no pay here"), "");
});

test("tableValue reads the TL;DR row", () => {
  assert.equal(tableValue(REPORT, "TL;DR"), "Entry-level DS on the pricing team");
  assert.equal(tableValue(REPORT, "missing"), "");
});

test("splitReport separates the archived JD from the evaluation", () => {
  const { jd, evaluation } = splitReport(REPORT);
  assert.equal(jd, "We are hiring a data scientist.\nPython and SQL required.");
  assert.ok(evaluation.includes("## Verdict"));
  assert.ok(!evaluation.includes("We are hiring"));
  assert.deepEqual(splitReport("# no jd\n\ntext"), { jd: "", evaluation: "# no jd\n\ntext" });
});

test("normalizeUrlKey matches the same posting across query strings and slashes", () => {
  assert.equal(normalizeUrlKey("https://Jobs.Example.com/a/1/?utm_source=x"), normalizeUrlKey("http://jobs.example.com/a/1"));
  assert.equal(normalizeUrlKey(""), "");
});

test("statusGroup maps career-ops statuses to sheet tabs", () => {
  assert.equal(statusGroup("New"), "New");
  assert.equal(statusGroup("Evaluated"), "To apply");
  assert.equal(statusGroup("Interview"), "Applied");
  assert.equal(statusGroup("SKIP"), "Closed");
  assert.equal(statusGroup("Rejected"), "Closed");
});

test("scoreTone follows the 4.0 apply line", () => {
  assert.equal(scoreTone(4.5), "good");
  assert.equal(scoreTone(3.4), "warn");
  assert.equal(scoreTone(2), "bad");
  assert.equal(scoreTone(null), "muted");
});

test("sponsorBadge labels every plugin tier", () => {
  assert.deepEqual(sponsorBadge("strong"), { tone: "good", label: "Strong" });
  assert.equal(sponsorBadge("staffing-shop").label, "Staffing firm");
  assert.equal(sponsorBadge("anything-else").label, "Unknown");
});

test("reportFieldValue is case-insensitive", () => {
  assert.equal(reportFieldValue([{ label: "URL", value: " https://x " }], "url"), "https://x");
  assert.equal(reportFieldValue([], "URL"), "");
});

test("docFileName is filesystem-safe", () => {
  assert.equal(docFileName("Acme/Inc", "Data Scientist: New Grad", "CV"), "Acme-Inc - Data Scientist- New Grad - CV.pdf");
  assert.equal(docFileName("", "", "Cover Letter"), "Company - Cover Letter.pdf");
});
