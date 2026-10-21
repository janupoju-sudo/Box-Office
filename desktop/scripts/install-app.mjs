#!/usr/bin/env node
// Box Office: build the Mac app and put it in /Applications.
//
//   cd box-office/desktop && npm install && npm run install-app
//
// Builds with electron-builder, signs it ad hoc (required for Apple silicon to
// run it; this is a personal build, not a notarized release), copies it into
// /Applications (or ~/Applications if that isn't writable), and records where
// this Box Office folder lives so the app finds it.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(here, "..");
const repo = path.resolve(desktop, "..");
const APP = "Box Office.app";

function step(msg) {
  console.log(`\n▸ ${msg}`);
}
function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) {
    console.error(`\n✗ ${cmd} ${args.join(" ")} failed.`);
    process.exit(r.status ?? 1);
  }
}

if (process.platform !== "darwin") {
  console.error("This builds the macOS app, so run it on your Mac.");
  process.exit(1);
}

step("Building Box Office.app");
sh("npx", ["electron-builder", "--mac", "dir"], { cwd: desktop });

const built = ["mac-arm64", "mac", "mac-universal", "mac-x64"]
  .map((d) => path.join(desktop, "dist", d, APP))
  .find((p) => fs.existsSync(p));
if (!built) {
  console.error("✗ Couldn't find the built app under desktop/dist.");
  process.exit(1);
}

step("Signing it for this Mac (ad hoc)");
sh("codesign", ["--force", "--deep", "--sign", "-", built]);

step("Installing into Applications");
let destDir = "/Applications";
try {
  fs.accessSync(destDir, fs.constants.W_OK);
} catch {
  destDir = path.join(os.homedir(), "Applications");
  fs.mkdirSync(destDir, { recursive: true });
}
const dest = path.join(destDir, APP);
if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
sh("ditto", [built, dest]);
try {
  execFileSync("xattr", ["-dr", "com.apple.quarantine", dest], { stdio: "ignore" });
} catch {
  // not quarantined: nothing to clear
}

step("Pointing the app at this folder");
const cfgDir = path.join(os.homedir(), "Library", "Application Support", "Box Office");
fs.mkdirSync(cfgDir, { recursive: true });
const cfgFile = path.join(cfgDir, "config.json");
let cfg = {};
try {
  cfg = JSON.parse(fs.readFileSync(cfgFile, "utf8"));
} catch {
  cfg = {};
}
fs.writeFileSync(cfgFile, JSON.stringify({ ...cfg, repoPath: repo }, null, 2));

console.log(`\n✓ Installed ${dest}`);
console.log("  Open it from Launchpad, Spotlight (\"Box Office\"), or the Applications folder.");
console.log("  The first launch installs and builds everything, which takes a few minutes.\n");
spawnSync("open", [dest], { stdio: "ignore" });
