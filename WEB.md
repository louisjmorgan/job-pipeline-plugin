# Run your job search in the browser

Everything happens on **claude.ai** and **github.com**. You don't install anything. Claude finds
jobs, tailors your CV, written answers and cover letters, and shows each application on a review
page where you download the PDFs. **It never applies, emails anyone or fills in a form. You do
the sending.**

It takes about 30 minutes to set up, most of it the setup interview about your CV.

## What you need

- A Claude plan that includes Claude Code on the web: Pro, Max, Team or Enterprise.
- A GitHub account (free).
- Your current CV, as text you can paste or as a file you can upload to GitHub.

## 1. GitHub: a private repo for your search

Your search lives in a GitHub repo: your profile, the jobs found, the drafts. It holds your CV,
so keep it **private**.

1. Go to https://github.com/new.
2. Name: `job-search`. Visibility: **Private**. Tick **Add a README file**. Leave *.gitignore*
   and *license* set to none.
3. Click **Create repository**.

The plugin's code (`louisjmorgan/job-pipeline-plugin`) is public. Sessions fetch it themselves,
so you don't need to do anything with it.

## 2. Claude: connect GitHub

1. Go to https://claude.ai/code and sign in.
2. When asked, authorise GitHub, then **install the Claude GitHub App**. When it asks which
   repositories to use, choose **Only select repositories** → `job-search`.
3. To change this later: https://github.com/settings/installations → Claude → Configure.

## 3. Claude: a cloud environment

The environment is the machine your sessions run on. It needs open web access, because Claude
checks every job on the employer's own site.

1. On https://claude.ai/code, open the **environment selector** under the message box →
   add an environment.
2. Name: `job-search`.
3. **Network access: Full.** The default (Limited) blocks employers' sites.
4. **Environment variables**: your job board API keys, one per line (step 4). You can come back
   and add them later.

## 4. Optional: free job board API keys

Without keys, Claude still searches companies' own job boards and the open web. These add more
listings (all UK):

| Key | Where to get it |
| --- | --- |
| `REED_API_KEY` | https://www.reed.co.uk/developers/jobseeker (free) |
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | https://developer.adzuna.com/signup (free) |
| `JOBSPIPE_API_KEY` | https://jobspipe.dev (LinkedIn and Indeed listings; free credits once, then paid) |

Add them to the environment's variables as `NAME=value` lines, e.g. `REED_API_KEY=abc123`.
Don't paste keys into the chat.

## 5. First session: set up your profile

1. On https://claude.ai/code, start a new session with repository **`job-search`** and
   environment **`job-search`**.
2. Send this (the commands don't exist in your repo yet, so the first time you spell it out):

   > Clone https://github.com/louisjmorgan/job-pipeline-plugin to ~/job-pipeline-plugin, then set
   > up my job search by following its skills/setup/SKILL.md (CLAUDE_PLUGIN_ROOT means
   > ~/job-pipeline-plugin; jp means node ~/job-pipeline-plugin/src/jp.js). Make this repo's root
   > the workspace (jp init .). My API keys are in the environment variables, not a .env file.
   > Commit and push to main as we go.

3. Answer its questions. Paste your CV when it asks. It also asks about your evidence and stories,
   anything you must never claim, and what you're looking for: roles, salary floor, location,
   work pattern.
4. It builds a first CV. Check it and ask for changes.

Setup adds the commands to your repo (`.claude/skills/`). From your next session on, `/find-jobs`,
`/tailor`, `/review` and the rest show up as commands, and plain requests like "find jobs" work too.

## 6. Day to day

Start each session the same way, with repository `job-search` and environment `job-search`. Then
just ask, or use the command:

| Say | What happens |
| --- | --- |
| "find jobs" | Searches, checks each lead on the employer's site, scores it, shortlists the good ones |
| "find jobs broad" | Also sends research agents across niche boards (slower, uses more of your plan; weekly) |
| "tailor &lt;job id&gt;" | Tailored CV, answers to the application's questions, cover letter if needed |
| "review &lt;job id&gt;" | Publishes the job's review page on claude.ai |
| "show the board" | One page listing every job, linking to each review page |
| "change the CV layout" | Different template, colours or fonts |

**Reviewing**: open the review page. It shows the pitch, Claude's questions for you, the CV, the
cover letter, the answers and the listing. Tell Claude what to change, e.g. "in answer 2 lead with
the outcome" or "never call it a platform". It edits the drafts, checks them against your facts,
republishes the page, and records general lessons so the next draft is closer.

**Applying**: on the review page, use **Download** to get the CV PDF (and the cover letter, if
there is one). Apply on the employer's site yourself. Then tell Claude "applied &lt;job id&gt;".

## 7. Optional: run it every morning

Routines run the search (and tailoring) on a schedule while you're away. The results are waiting
in the next session and on the board.

1. Go to https://claude.ai/code/routines → new routine.
2. Repository: `job-search`. Environment: `job-search`.
   Model: Sonnet.
3. Prompt: copy
   [skills/schedule/routine-prompt.md](skills/schedule/routine-prompt.md) and replace
   `{{MODE}}` with `normal` and `{{TAILOR_MAX}}` with `3` (or `0` to search without tailoring).
4. Schedule: e.g. weekdays at 07:00. Make a second routine with `broad` for one day a week.
5. Run it once by hand to check, then open the board.

Each run searches, tailors up to 3 shortlisted jobs, publishes their review pages and pushes the
results to `main`.

**Usage**: a broad search and tailoring take a good share of a plan's limits (on one user's runs,
roughly 400k tokens for a broad search and 100k per tailored job). Check Settings → Usage on
claude.ai after the first few runs and cut back if needed.

## If something goes wrong

- **"Repository not found" or access errors**: the Claude GitHub App isn't allowed on
  `job-search` (step 2.3).
- **No `/tailor` etc. commands**: your repo has no `.claude/skills/` folder, e.g. because it was
  set up before they existed. Say: "Clone https://github.com/louisjmorgan/job-pipeline-plugin to
  ~/job-pipeline-plugin, run node ~/job-pipeline-plugin/src/jp.js init . to add the missing files,
  replace the 'In a claude.ai cloud session' section of CLAUDE.md with the one in
  ~/job-pipeline-plugin/workspace-template/CLAUDE.md, then commit and push to main." Then start a
  new session.
- **Jobs fail to load, 403 errors**: the environment's network access isn't Full (step 3).
- **"skipped (set REED_API_KEY)"** in a search summary: the key isn't in the environment (step 4).
- **No Download button, or "No PDF built yet"**: say "build the PDFs for &lt;job id&gt; and
  republish the review page".
- **A session's changes are missing next time**: it didn't push to `main`. Say "commit and push to
  main".
