// Box Office: messages for silent Claude Code exits.
// Run:  node --test tests/lib/boxoffice/cli-failure.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { explainCliFailure, tail } from "../../../src/lib/boxoffice/cli-failure.mjs";

test("not signed in points to /login", () => {
  const m = explainCliFailure({ error: "Not logged in · Please run /login" });
  assert.match(m, /Not logged in/);
  assert.match(m, /type \/login/);
});

test("usage limit says it resets, with a readable time", () => {
  const m = explainCliFailure({ error: "Claude AI usage limit reached|1792663200" });
  assert.match(m, /usage limit was reached/);
  assert.match(m, /\(resets [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2}/);
  assert.doesNotMatch(m, /\|1792663200/);
});

test("low API credit names the key", () => {
  assert.match(explainCliFailure({ error: "Credit balance is too low" }), /ANTHROPIC_API_KEY/);
});

test("falls back to stderr when there is no result error", () => {
  const m = explainCliFailure({ stderr: "spawn claude ENOENT" });
  assert.match(m, /ENOENT/);
  assert.match(m, /claude --version/);
});

test("an unknown reason is shown as-is without a wrong hint", () => {
  const m = explainCliFailure({ error: "error_during_execution" });
  assert.match(m, /error_during_execution/);
  assert.doesNotMatch(m, /login|usage limit|API key/);
});

test("nothing at all gives the exit code and a check", () => {
  const m = explainCliFailure({ code: 1 });
  assert.match(m, /exit code 1/);
  assert.match(m, /claude -p/);
});

test("tail keeps the end of long stderr", () => {
  const t = tail("x".repeat(1000) + "THE END", 20);
  assert.ok(t.endsWith("THE END"));
  assert.ok(t.length <= 21);
});
