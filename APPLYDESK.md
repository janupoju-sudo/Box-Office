# applydesk

A local-first job search desk, forked from [career-ops](https://github.com/career-ops-hq/career-ops) (MIT).
It adds a spreadsheet-style **Job Sheet** and a guided **Apply** flow on top of career-ops' web app.
Everything runs on your own computer, through your own Claude Code login.

## What it adds

- **Job Sheet** (`/sheet`): every job in one table, new and evaluated. Columns for company, role,
  location, pay, fit score, H-1B sponsorship signal, status and date. Click a row for the full job
  description and Claude's evaluation. Paste a link to add a job.
- **Sponsorship signal**: each employer's US Department of Labor H-1B and green-card filing history,
  looked up locally from the bundled `h1b-sponsor` plugin's index. Nothing leaves your machine.
- **Apply** (`/sheet/<n>/apply`): one screen per job.
  1. Tailored, ATS-friendly CV (career-ops `pdf` mode, run by your Claude).
  2. Cover letter draft, if the application wants one.
  3. Save copies into `Applications/CVs` and `Applications/Cover Letters`.
  4. Open the application pre-filled in a browser. **It never submits. You review and press Submit.**
     Then mark the job Applied.
- Apply on a job that hasn't been evaluated yet runs the evaluation first, then opens its Apply screen.

## Your data

Your CV, profile, pipeline and tracker live in a separate career-ops folder. The `.career-ops-data`
file in this folder points at it (default: `../career-ops`). Edit that file to point elsewhere.

## Run it

Requires Node.js 22.6+ and Claude Code (signed in with your own account).

```bash
cd applydesk
npm install                         # core scripts + the browser used for PDFs and pre-fill
node plugins/h1b-sponsor/install-h1b-index.mjs   # sponsorship data (~8 MB), once
cd web
npm ci
npm run build
npm start                           # then open http://localhost:3000/sheet
```

The first time, open **Config** in the app and pick Claude Code as your CLI.

## Staying up to date with career-ops

```bash
git fetch upstream
git merge upstream/main
```

## Rules this fork keeps

- Never auto-submits an application.
- Uses your own Claude login through the unmodified Claude Code CLI, or your own API key.
  It never collects or stores Claude credentials.
- Never invents facts on a CV; read every document before you send it.
