// applydesk: H-1B sponsorship signal for one employer, from the bundled
// h1b-sponsor plugin's LOCAL index of US Department of Labor filings
// (plugins/h1b-sponsor). Nothing leaves the machine. The plugin keeps its own
// disk cache; this adds an in-process one so a sheet reload is instant.
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { resolveCodeRoot } from "@/lib/core/code-root.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Sponsor = {
  found: boolean;
  tier: string;
  name: string;
  lca: number | null;
  perm: number | null;
  lastYear: number | null;
  installed: boolean;
};

const memo = new Map<string, Sponsor>();

function codeRoot(): string {
  return resolveCodeRoot(process.cwd(), process.env);
}

function pluginScript(): string {
  return path.join(/* turbopackIgnore: true */ codeRoot(), "plugins", "h1b-sponsor", "check.mjs");
}

function indexInstalled(): boolean {
  return fs.existsSync(path.join(/* turbopackIgnore: true */ codeRoot(), "data", "h1b", "index.ndjson.gz"));
}

function cleanName(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (s.length < 2 || s.length > 120) return null;
  return s;
}

function lookup(name: string): Promise<Sponsor> {
  const installed = indexInstalled();
  if (!installed) {
    return Promise.resolve({ found: false, tier: "unknown", name, lca: null, perm: null, lastYear: null, installed });
  }
  return new Promise((resolve) => {
    // execFile, no shell: the company name is an argv element, never parsed.
    execFile(
      process.execPath,
      [pluginScript(), name, "--json"],
      { cwd: codeRoot(), timeout: 20_000, maxBuffer: 1024 * 1024 },
      (_err, stdout) => {
        try {
          const j = JSON.parse(String(stdout || "{}"));
          resolve({
            found: !!j.found,
            tier: typeof j.friendlinessTier === "string" ? j.friendlinessTier : "unknown",
            name: typeof j.displayName === "string" ? j.displayName : name,
            lca: typeof j.totals?.n_lca === "number" ? j.totals.n_lca : null,
            perm: typeof j.totals?.n_perm === "number" ? j.totals.n_perm : null,
            lastYear: typeof j.totals?.last_year === "number" ? j.totals.last_year : null,
            installed,
          });
        } catch {
          resolve({ found: false, tier: "unknown", name, lca: null, perm: null, lastYear: null, installed });
        }
      },
    );
  });
}

export async function GET(req: Request) {
  const name = cleanName(new URL(req.url).searchParams.get("company"));
  if (!name) return Response.json({ error: "company required" }, { status: 400 });
  const key = name.toLowerCase();
  const hit = memo.get(key);
  if (hit) return Response.json(hit);
  const result = await lookup(name);
  if (result.installed) memo.set(key, result);
  return Response.json(result);
}
