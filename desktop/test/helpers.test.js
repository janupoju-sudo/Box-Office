// Run: npm test
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const H = require("../lib/helpers");

test("parseShellPath ignores dotfile noise around the marked PATH", () => {
  const out = `Welcome!\n${H.PATH_MARK}/opt/homebrew/bin:/usr/bin${H.PATH_MARK}\nbye`;
  assert.equal(H.parseShellPath(out), "/opt/homebrew/bin:/usr/bin");
  assert.equal(H.parseShellPath("no markers"), "");
  assert.equal(H.parseShellPath(""), "");
});

test("mergePath keeps order, drops duplicates and adds install dirs", () => {
  const merged = H.mergePath("/Users/j/.nvm/versions/node/v22/bin:/usr/bin", "/usr/bin:/bin", "/Users/j").split(":");
  assert.equal(merged[0], "/Users/j/.nvm/versions/node/v22/bin");
  assert.equal(merged.filter((p) => p === "/usr/bin").length, 1);
  assert.ok(merged.includes("/opt/homebrew/bin"));
  assert.ok(merged.includes("/Users/j/.claude/local"));
  assert.ok(merged.includes("/bin"));
});

test("nodeVersionOk enforces Node 22.6+", () => {
  assert.equal(H.nodeVersionOk("v22.6.0"), true);
  assert.equal(H.nodeVersionOk("v24.1.0"), true);
  assert.equal(H.nodeVersionOk("v22.5.9"), false);
  assert.equal(H.nodeVersionOk("v20.11.1"), false);
  assert.equal(H.nodeVersionOk(""), false);
});

test("setupSteps: fresh folder needs everything, in order", () => {
  assert.deepEqual(
    H.setupSteps({ rootModules: false, webModules: false, buildId: false, builtHead: "", head: "abc", h1bIndex: false }),
    ["install-core", "install-web", "build-web", "install-h1b"],
  );
});

test("setupSteps: up to date folder needs nothing", () => {
  assert.deepEqual(H.setupSteps({ rootModules: true, webModules: true, buildId: true, builtHead: "abc", head: "abc", h1bIndex: true }), []);
});

test("setupSteps: an update (new git HEAD) rebuilds only the web app", () => {
  assert.deepEqual(H.setupSteps({ rootModules: true, webModules: true, buildId: true, builtHead: "old", head: "new", h1bIndex: true }), ["build-web"]);
});

test("setupSteps: an existing build with no recorded head is rebuilt once", () => {
  assert.deepEqual(H.setupSteps({ rootModules: true, webModules: true, buildId: true, builtHead: "", head: "abc", h1bIndex: true }), ["build-web"]);
});

test("setupSteps: not a git checkout (no head) trusts an existing build", () => {
  assert.deepEqual(H.setupSteps({ rootModules: true, webModules: true, buildId: true, builtHead: "", head: "", h1bIndex: true }), []);
});

test("looksLikeRepo needs both the web app and the core", () => {
  const files = new Set(["/r/web/package.json", "/r/scan.mjs"]);
  const exists = (p) => files.has(p);
  assert.equal(H.looksLikeRepo(exists, "/r"), true);
  assert.equal(H.looksLikeRepo(exists, "/other"), false);
  assert.equal(H.looksLikeRepo(exists, ""), false);
});

test("isAppUrl only admits our own local server", () => {
  assert.equal(H.isAppUrl("http://127.0.0.1:3001/sheet", 3001), true);
  assert.equal(H.isAppUrl("http://localhost:3001/", 3001), true);
  assert.equal(H.isAppUrl("http://127.0.0.1:3002/", 3001), false);
  assert.equal(H.isAppUrl("https://127.0.0.1:3001/", 3001), false);
  assert.equal(H.isAppUrl("https://evil.example/", 3001), false);
  assert.equal(H.isAppUrl("not a url", 3001), false);
});

test("isExternalWebUrl refuses file: and javascript: links", () => {
  assert.equal(H.isExternalWebUrl("https://jobs.lever.co/x"), true);
  assert.equal(H.isExternalWebUrl("mailto:a@b.c"), true);
  assert.equal(H.isExternalWebUrl("file:///etc/passwd"), false);
  assert.equal(H.isExternalWebUrl("javascript:alert(1)"), false);
});
