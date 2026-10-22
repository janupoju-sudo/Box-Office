// Box Office: turn a silent Claude Code exit into a message a person can act on.
// Claude Code reports most failures (not signed in, usage limit reached, a bad
// model name) as a terminal `result` event or on stderr, not as reply text, so a
// reader that only collects text would otherwise show "no output".

const HINTS = [
  {
    test: /not logged in|please run \/login|\/login|unauthori[sz]ed|\b401\b|authentication|invalid api key|oauth token|credentials/i,
    hint: "Claude Code isn't signed in for Box Office. Open Terminal, run `claude`, and type /login. Then try again.",
  },
  {
    test: /usage limit|limit reached|rate limit|\b429\b|quota|resets? (at|in)/i,
    hint: "Your Claude plan's usage limit was reached. It resets on its own; the Usage bars in the sidebar show when.",
  },
  {
    test: /credit balance|billing|payment/i,
    hint: "An Anthropic API key is being used and its credit is too low. Remove ANTHROPIC_API_KEY so Claude Code uses your plan instead.",
  },
  {
    test: /model .*(not found|not available|does not exist|invalid)|invalid model/i,
    hint: "The model chosen in Config isn't available on your plan. Pick another one in Config.",
  },
  {
    test: /enoent|command not found|not recognized/i,
    hint: "Box Office couldn't find Claude Code. Check that `claude --version` works in Terminal, then reopen Box Office.",
  },
];

/** Keep the end of a stream, where the reason usually is. */
export function tail(text, max = 600) {
  const s = String(text || "").trim();
  return s.length > max ? `…${s.slice(-max)}` : s;
}

/**
 * @param {{ error?: string | null, stderr?: string, code?: number | null, cliName?: string }} info
 * @returns {string} Markdown shown in place of the reply.
 */
/** "Claude AI usage limit reached|1792680000" → "… (resets Oct 22, 2:40 AM)". */
export function readableReset(text) {
  return String(text || "").replace(/\|(\d{10})\b/, (_m, secs) => {
    const d = new Date(Number(secs) * 1000);
    if (Number.isNaN(d.getTime())) return "";
    return ` (resets ${d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })})`;
  });
}

export function explainCliFailure({ error = null, stderr = "", code = null, cliName = "Claude Code" } = {}) {
  const reason = readableReset(String(error || "").trim() || tail(stderr));
  if (!reason) {
    return `_${cliName} ended without replying${code != null ? ` (exit code ${code})` : ""}. Check that \`claude -p "hi"\` answers in Terminal._`;
  }
  const match = HINTS.find((h) => h.test.test(reason));
  const lines = [`**${cliName} stopped:** ${reason.replace(/\s+/g, " ").slice(0, 600)}`];
  if (match) lines.push("", match.hint);
  return lines.join("\n");
}
