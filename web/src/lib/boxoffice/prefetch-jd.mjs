// Box Office: read a posting's job description from its job board's public API
// (the core's fetch-jd.mjs) BEFORE handing the evaluation to the user's AI.
//
// Why: a headless evaluation otherwise reads the posting with WebFetch, which a
// user's own Claude Code hooks or plugins can block (for example a plugin that
// reroutes WebFetch to an MCP tool the worker doesn't load), and which returns
// an empty shell for JS-rendered boards. The API read costs no plan usage and
// returns the real text, or nothing at all, never a guess.
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";

export const MIN_JD_CHARS = 300;
const TIMEOUT_MS = 20_000;

/**
 * @param {string} url
 * @param {{ codeRoot: string, cwd: string, env?: NodeJS.ProcessEnv, run?: typeof execFile }} opts
 * @returns {Promise<string | null>} the JD text, or null when the board isn't supported or answered thinly
 */
export function prefetchJd(url, { codeRoot, cwd, env = process.env, run = execFile }) {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return Promise.resolve(null);
  const script = path.join(/* turbopackIgnore: true */ codeRoot, "fetch-jd.mjs");
  return new Promise((resolve) => {
    try {
      run(process.execPath, [script, url], { cwd, env, timeout: TIMEOUT_MS, maxBuffer: 2 * 1024 * 1024 }, (err, stdout) => {
        const text = String(stdout || "").trim();
        resolve(!err && text.length >= MIN_JD_CHARS ? text : null);
      });
    } catch {
      resolve(null);
    }
  });
}

/**
 * Wrap untrusted posting text between nonce markers so instructions inside it
 * can't pose as the prompt's own.
 * @param {string} text
 * @param {() => string} [makeNonce]
 */
export function fenceJd(text, makeNonce = () => randomBytes(6).toString("hex")) {
  const nonce = makeNonce();
  const body = String(text).replaceAll(`JD-${nonce}`, "");
  return { nonce, block: `<<<JD-${nonce}\n${body}\nJD-${nonce}>>>` };
}
