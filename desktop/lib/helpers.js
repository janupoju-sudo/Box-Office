// Box Office desktop: pure helpers (no Electron imports) so they can be unit
// tested under plain Node.
"use strict";

const path = require("node:path");

const PATH_MARK = "__BOX_OFFICE_PATH__";

/** Extract $PATH from a login shell's output, ignoring anything a dotfile prints. */
function parseShellPath(output) {
  const s = String(output || "");
  const a = s.indexOf(PATH_MARK);
  const b = s.indexOf(PATH_MARK, a + PATH_MARK.length);
  if (a < 0 || b < 0) return "";
  return s.slice(a + PATH_MARK.length, b).trim();
}

/**
 * Apps opened from Finder get a bare PATH (/usr/bin:/bin:/usr/sbin:/sbin), so
 * Node, npm and the claude CLI installed by Homebrew, nvm or the Claude
 * installer are invisible. Merge the login shell's PATH with the usual install
 * locations, keeping order and dropping duplicates.
 */
function mergePath(shellPath, currentPath, home) {
  const extras = [
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    home && path.join(home, ".local", "bin"),
    home && path.join(home, ".claude", "local"),
    home && path.join(home, ".npm-global", "bin"),
    home && path.join(home, ".volta", "bin"),
    home && path.join(home, ".bun", "bin"),
  ];
  const seen = new Set();
  const out = [];
  for (const part of [...String(shellPath || "").split(":"), ...String(currentPath || "").split(":"), ...extras]) {
    if (!part || seen.has(part)) continue;
    seen.add(part);
    out.push(part);
  }
  return out.join(":");
}

/** "v22.6.0" → true when >= 22.6 (the web app's minimum). */
function nodeVersionOk(version, min = [22, 6]) {
  const m = String(version || "").trim().match(/^v?(\d+)\.(\d+)/);
  if (!m) return false;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  return major > min[0] || (major === min[0] && minor >= min[1]);
}

/**
 * Which first-launch / update steps are needed, from what exists on disk.
 * @param {{rootModules: boolean, webModules: boolean, buildId: boolean, builtHead: string, head: string, h1bIndex: boolean}} s
 * @returns {string[]} step ids in run order
 */
function setupSteps(s) {
  const steps = [];
  if (!s.rootModules) steps.push("install-core");
  if (!s.webModules) steps.push("install-web");
  const stale = !s.buildId || (s.head && s.builtHead !== s.head);
  if (stale || steps.includes("install-web")) steps.push("build-web");
  if (!s.h1bIndex) steps.push("install-h1b");
  return steps;
}

/** A folder looks like a Box Office checkout when it has the web app and the core. */
function looksLikeRepo(exists, dir) {
  if (!dir) return false;
  return exists(path.join(dir, "web", "package.json")) && exists(path.join(dir, "scan.mjs"));
}

/** Only our own local server may be shown inside the app window. */
function isAppUrl(url, port) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost") && Number(u.port) === Number(port);
  } catch {
    return false;
  }
}

/** Links that may be handed to the default browser. */
function isExternalWebUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" || u.protocol === "mailto:";
  } catch {
    return false;
  }
}

module.exports = { PATH_MARK, parseShellPath, mergePath, nodeVersionOk, setupSteps, looksLikeRepo, isAppUrl, isExternalWebUrl };
