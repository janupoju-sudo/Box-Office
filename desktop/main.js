// Box Office desktop app: a thin macOS shell around the local web app.
//
// It finds your Box Office folder, makes sure it is installed and built (first
// launch, and again after an update), starts the local server on this Mac only
// (127.0.0.1), and shows it in its own window. Quitting the app stops the
// server. Everything still runs through your own Claude Code login; this shell
// never sees or stores credentials.
"use strict";

const { app, BrowserWindow, dialog, shell, Menu, nativeTheme } = require("electron");
const { spawn, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const H = require("./lib/helpers");

const APP_NAME = "Box Office";
const TAGLINE = "Jarvis, find me a job.";

let splash = null;
let win = null;
let server = null;
let port = 0;
let repo = "";
let env = process.env;
let quitting = false;
let logFile = "";
let logStream = null;

app.setName(APP_NAME);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const w = win || splash;
    if (!w) return;
    if (w.isMinimized()) w.restore();
    w.focus();
  });
  app.whenReady().then(boot);
}

// ── small utilities ─────────────────────────────────────────────────────────

const exists = (p) => {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
};

function configPath() {
  return path.join(app.getPath("userData"), "config.json");
}
function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), "utf8"));
  } catch {
    return {};
  }
}
function writeConfig(cfg) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
}

function openLog() {
  const dir = path.join(app.getPath("userData"), "logs");
  fs.mkdirSync(dir, { recursive: true });
  logFile = path.join(dir, "box-office.log");
  logStream = fs.createWriteStream(logFile, { flags: "w" });
}

function log(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim());
  for (const line of lines) {
    logStream?.write(`${new Date().toISOString()} ${line}\n`);
    if (splash && !splash.isDestroyed()) {
      splash.webContents.executeJavaScript(`window.addLine(${JSON.stringify(line.slice(0, 300))})`).catch(() => {});
    }
  }
}

function status(title, detail = "") {
  log(`== ${title}`);
  if (splash && !splash.isDestroyed()) {
    splash.webContents.executeJavaScript(`window.setStatus(${JSON.stringify(title)}, ${JSON.stringify(detail)})`).catch(() => {});
  }
}

/** The PATH your Terminal has, not Finder's bare one. */
function loginEnv() {
  const shellBin = process.env.SHELL || "/bin/zsh";
  let shellPath = "";
  try {
    const out = execFileSync(shellBin, ["-ilc", `printf '%s%s%s' '${H.PATH_MARK}' "$PATH" '${H.PATH_MARK}'`], {
      encoding: "utf8",
      timeout: 15000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    shellPath = H.parseShellPath(out);
  } catch {
    // A slow or broken dotfile must not stop the app; the fallback dirs below still apply.
  }
  return { ...process.env, PATH: H.mergePath(shellPath, process.env.PATH, os.homedir()) };
}

function which(cmd) {
  try {
    return execFileSync("/usr/bin/which", [cmd], { env, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function run(cmd, args, cwd, label) {
  return new Promise((resolve, reject) => {
    log(`$ ${cmd} ${args.join(" ")}`);
    const child = spawn(cmd, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (d) => log(d.toString()));
    child.stderr.on("data", (d) => log(d.toString()));
    child.on("error", (e) => reject(new Error(`${label}: ${e.message}`)));
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${label} failed (exit code ${code}).`))));
  });
}

function freePort(start = 3000, end = 3100) {
  return new Promise((resolve, reject) => {
    const tryPort = (p) => {
      if (p > end) return reject(new Error("No free local port between 3000 and 3100."));
      const s = net.createServer();
      s.once("error", () => tryPort(p + 1));
      s.once("listening", () => s.close(() => resolve(p)));
      s.listen(p, "127.0.0.1");
    };
    tryPort(start);
  });
}

function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) return resolve();
        retry();
      });
      req.on("error", retry);
      req.setTimeout(5000, () => req.destroy());
    };
    const retry = () => {
      if (Date.now() > deadline) return reject(new Error("The local server did not start in time."));
      setTimeout(attempt, 750);
    };
    attempt();
  });
}

// ── boot sequence ───────────────────────────────────────────────────────────

async function boot() {
  openLog();
  buildMenu();
  splash = new BrowserWindow({
    width: 560,
    height: 400,
    resizable: false,
    title: APP_NAME,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#121213" : "#f5f5f7",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  splash.loadFile(path.join(__dirname, "splash.html"));
  splash.once("ready-to-show", () => splash.show());
  await new Promise((r) => splash.webContents.once("did-finish-load", r));

  try {
    status("Getting ready…");
    env = loginEnv();

    repo = await resolveRepo();
    if (!repo) {
      app.quit();
      return;
    }
    log(`Box Office folder: ${repo}`);

    const node = which("node");
    const nodeVersion = node ? execFileSync(node, ["-v"], { env, encoding: "utf8" }).trim() : "";
    if (!H.nodeVersionOk(nodeVersion)) {
      throw Object.assign(
        new Error(nodeVersion ? `Box Office needs Node.js 22.6 or newer (found ${nodeVersion}).` : "Box Office needs Node.js 22.6 or newer, and none was found."),
        { help: "https://nodejs.org" },
      );
    }
    log(`Node ${nodeVersion} at ${node}`);
    const claude = which("claude");
    log(claude ? `Claude Code at ${claude}` : "Claude Code not found on PATH.");

    await setup();

    status("Starting Box Office…");
    await startServer();

    createMainWindow();
    if (!claude) {
      dialog.showMessageBox(win, {
        type: "info",
        message: "Claude Code wasn't found",
        detail:
          "Box Office uses your own Claude Code login to evaluate jobs and write CVs. Install Claude Code, sign in, then open Config in Box Office and choose it. Everything else works without it.",
        buttons: ["OK", "How to install"],
      }).then(({ response }) => response === 1 && shell.openExternal("https://docs.claude.com/en/docs/claude-code/overview"));
    }
  } catch (err) {
    fail(err);
  }
}

async function resolveRepo() {
  const cfg = readConfig();
  const candidates = [
    cfg.repoPath,
    path.join(os.homedir(), "Documents", "box-office"),
    app.isPackaged ? "" : path.resolve(__dirname, ".."),
  ];
  for (const c of candidates) if (H.looksLikeRepo(exists, c)) return c;
  return chooseRepo();
}

async function chooseRepo() {
  const parent = splash && !splash.isDestroyed() ? splash : win;
  for (;;) {
    const { canceled, filePaths } = await dialog.showOpenDialog(parent, {
      title: "Where is your Box Office folder?",
      message: "Choose the box-office folder (the one with web/ and scan.mjs inside).",
      properties: ["openDirectory"],
      defaultPath: path.join(os.homedir(), "Documents"),
    });
    if (canceled || !filePaths[0]) return "";
    if (H.looksLikeRepo(exists, filePaths[0])) {
      writeConfig({ ...readConfig(), repoPath: filePaths[0] });
      return filePaths[0];
    }
    await dialog.showMessageBox(parent, { type: "warning", message: "That folder isn't a Box Office folder.", detail: "Pick the folder that contains web/ and scan.mjs." });
  }
}

function gitHead() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, env, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

// The per-CLI skill links (.claude/skills/…/SKILL.md and friends) are tracked
// symlinks some copy tools can't write. Restore any that are missing from git.
function restoreSkillLinks() {
  const dirs = [".claude", ".qwen", ".kimi", ".grok", ".antigravitycli", ".opencode"];
  const missing = dirs.filter((d) => exists(path.join(repo, d)) && !exists(path.join(repo, d, "skills", "career-ops", "SKILL.md")));
  if (!missing.length || !exists(path.join(repo, ".git"))) return;
  try {
    execFileSync("git", ["checkout", "--", ...missing.map((d) => `${d}/skills/career-ops/SKILL.md`)], { cwd: repo, env, stdio: "ignore" });
    log(`Restored skill links in ${missing.join(", ")}`);
  } catch {
    // Optional: only matters when an AI CLI is opened inside this folder.
  }
}

async function setup() {
  restoreSkillLinks();
  const web = path.join(repo, "web");
  const headFile = path.join(web, ".next", "box-office-head");
  const head = gitHead();
  let builtHead = "";
  try {
    builtHead = fs.readFileSync(headFile, "utf8").trim();
  } catch {
    builtHead = "";
  }
  const steps = H.setupSteps({
    rootModules: exists(path.join(repo, "node_modules")),
    webModules: exists(path.join(web, "node_modules", "next")),
    buildId: exists(path.join(web, ".next", "BUILD_ID")),
    builtHead,
    head,
    h1bIndex: exists(path.join(repo, "data", "h1b", "index.ndjson.gz")),
  });
  if (steps.length) log(`Setup steps: ${steps.join(", ")}`);

  for (const step of steps) {
    if (step === "install-core") {
      status("Installing the engine", "First launch only. This takes a few minutes.");
      await run("npm", ["install", "--no-audit", "--no-fund"], repo, "Installing the engine");
    } else if (step === "install-web") {
      status("Installing the app", "First launch only.");
      await run("npm", ["ci", "--no-audit", "--no-fund"], web, "Installing the app");
    } else if (step === "build-web") {
      status("Building the app", "After first launch, this only happens after an update.");
      await run("npm", ["run", "build"], web, "Building the app");
      if (head) fs.writeFileSync(headFile, head);
    } else if (step === "install-h1b") {
      status("Downloading sponsorship data", "US Department of Labor H-1B filings, about 8 MB.");
      try {
        await run("node", ["plugins/h1b-sponsor/install-h1b-index.mjs"], repo, "Downloading sponsorship data");
      } catch (e) {
        log(`Skipped sponsorship data: ${e.message} The Sponsorship column will say "Not set up".`);
      }
    }
  }
}

async function startServer() {
  port = await freePort();
  const web = path.join(repo, "web");
  log(`Starting server on 127.0.0.1:${port}`);
  // detached → its own process group, so quitting can stop server.mjs AND the
  // next process it spawns.
  server = spawn("node", ["server.mjs", "start", "-p", String(port)], { cwd: web, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", (d) => log(d.toString()));
  server.stderr.on("data", (d) => log(d.toString()));
  server.on("exit", (code) => {
    log(`Server exited (code ${code}).`);
    server = null;
    if (!quitting) fail(new Error("Box Office's local server stopped unexpectedly."));
  });
  await waitForHttp(`http://127.0.0.1:${port}/sheet`, 120000);
}

function stopServer() {
  if (!server || !server.pid) return;
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    try {
      server.kill("SIGTERM");
    } catch {
      // already gone
    }
  }
}

function appUrl(route = "/sheet") {
  return `http://127.0.0.1:${port}${route}`;
}

function windowBackground() {
  return nativeTheme.shouldUseDarkColors ? "#121213" : "#f5f5f7";
}

function createMainWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    title: APP_NAME,
    show: false,
    // Native Mac chrome: no title bar, traffic lights inset into the glass
    // sidebar. The page adds the drag strip and the room for them when it sees
    // the bo-desktop class.
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 22, y: 22 },
    backgroundColor: windowBackground(),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.webContents.on("dom-ready", () => {
    win.webContents.executeJavaScript("document.documentElement.classList.add('bo-desktop')").catch(() => {});
  });
  nativeTheme.on("updated", () => win && !win.isDestroyed() && win.setBackgroundColor(windowBackground()));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (H.isAppUrl(url, port)) return { action: "allow" };
    if (H.isExternalWebUrl(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (H.isAppUrl(url, port)) return;
    e.preventDefault();
    if (H.isExternalWebUrl(url)) shell.openExternal(url);
  });
  win.on("page-title-updated", (e) => e.preventDefault());
  win.once("ready-to-show", () => {
    win.show();
    if (splash && !splash.isDestroyed()) splash.close();
    splash = null;
  });
  win.on("closed", () => {
    win = null;
  });
  win.loadURL(appUrl());
}

function fail(err) {
  log(`ERROR: ${err && err.message ? err.message : err}`);
  const message = err && err.message ? err.message : String(err);
  if (splash && !splash.isDestroyed()) {
    splash.webContents.executeJavaScript(`window.setError(${JSON.stringify(message)})`).catch(() => {});
  }
  const buttons = err && err.help ? ["Quit", "Show log", "Get Node.js"] : ["Quit", "Show log"];
  dialog.showMessageBox({ type: "error", message: "Box Office couldn't start", detail: message, buttons }).then(({ response }) => {
    if (response === 1) shell.openPath(logFile);
    if (response === 2 && err.help) shell.openExternal(err.help);
    app.quit();
  });
}

function buildMenu() {
  const template = [
    {
      label: APP_NAME,
      submenu: [
        { role: "about" },
        { type: "separator" },
        {
          label: "Change Box Office Folder…",
          click: async () => {
            const chosen = await chooseRepo();
            if (chosen) {
              app.relaunch();
              app.quit();
            }
          },
        },
        { label: "Show Log", click: () => logFile && shell.openPath(logFile) },
        { label: "Open in Browser", click: () => port && shell.openExternal(appUrl()) },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { label: "Job Sheet", accelerator: "CmdOrCtrl+1", click: () => win && win.loadURL(appUrl("/sheet")) },
        { label: "Today", accelerator: "CmdOrCtrl+2", click: () => win && win.loadURL(appUrl("/")) },
        { type: "separator" },
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "History",
      submenu: [
        { label: "Back", accelerator: "CmdOrCtrl+[", click: () => win && win.webContents.navigationHistory.canGoBack() && win.webContents.navigationHistory.goBack() },
        { label: "Forward", accelerator: "CmdOrCtrl+]", click: () => win && win.webContents.navigationHistory.canGoForward() && win.webContents.navigationHistory.goForward() },
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  app.setAboutPanelOptions({ applicationName: APP_NAME, credits: `${TAGLINE}\nBuilt on career-ops (MIT).` });
}

app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  quitting = true;
  stopServer();
});
