---
name: find-jobs
description: Find and screen new jobs against profile/criteria.yaml. Runs the API/RSS/watchlist feeds (jp search), reads Indeed alert emails if Gmail is connected, and with "broad" fans out parallel research agents across job boards and niches the APIs miss. Then verifies each lead on the employer's own listing, scores it, and promotes good ones into jobs/<id>/ (status shortlisted) or rejects them with a reason. Use when the user says "find jobs", "search for jobs", "any new jobs?", "/find-jobs" or "/find-jobs broad". Never tailors or applies.
---

# Find jobs

**Tools.** `jp` in this skill means `node "${CLAUDE_PLUGIN_ROOT}/src/jp.js"`: run it with that full
path, from the workspace (the folder with `profile/`). If there's no `profile/` folder, stop and
suggest `/job-pipeline:setup`. CV format rules: `${CLAUDE_PLUGIN_ROOT}/CONTENT.md`.

Two modes:
- **`/find-jobs`** (daily, cheap): feeds + email alerts + screening. No research agents.
- **`/find-jobs broad`** (weekly, costs more): adds the agentic discovery fan-out (step 3).

Output: shortlisted jobs in `jobs/`, rejects remembered in `leads/seen.json`, a digest appended
to `leads/runs/<date>.md`, and a short report to the user. **Never tailor, never apply.**

Read first: `profile/criteria.yaml` (what the user wants), `profile/preferences.md` → Screening
(judgements from past feedback), `profile/facts.md` (hard limits: the never-claim list and
settled facts), and skim `profile/cv.md` (what they're strong at). Also scan `leads/seen.json`
for `rejected` reasons: a pattern there (the user keeps turning down a kind of role) should lower
scores for similar leads.

## 1. Feeds

```bash
jp search
```

Note any skipped or failed sources for the report (e.g. missing API keys).

## 2. Email alerts (only if a Gmail tool is available)

Search the user's mail for job alert emails since `leads/state.json` → `last_run` (Indeed:
`from:alert@indeed.com` or similar; also any job board alerts they've set up). Skip any source
`preferences.md` says to ignore. Extract company, title, location, salary and the link
for each job; write them as JSONL (format in step 3) to `leads/agentic/<date>-email.jsonl`; import
with `jp leads import <file>`. If no Gmail tool is connected, say so in the report once.

## 3. Agentic discovery (broad mode only)

Launch research subagents **in parallel** (one Agent call each, in a single message), one per
angle, 4–6 angles in all. Build the angles from `criteria.yaml`:

- **Local employers** around `location.home`: the area's tech community job boards, local
  scale-ups and agencies, hybrid roles within commuting distance (`location.commutable`).
- **One angle per `interests` entry**, with the boards that sector uses. For example: public
  sector and education → jobs.ac.uk, university Jobtrain boards, NHS digital, Civil Service Jobs,
  CharityJob; a technology niche → product companies in that niche hiring in the UK or UK-remote;
  culture and creative tech → studios, museums, arts organisations, games and interactive agencies.
- **Flexible work**, if `work_pattern` marks part-time or a four-day week as wanted:
  4dayweek.io (job, company and skill pages) and part-time or compressed-hours roles.

Merge angles that overlap; if there are more than six, keep the ones closest to the user's
strongest evidence in `cv.md`.

Give each subagent this brief, filled in (use `model: "sonnet"` to keep cost down unless the user asked otherwise):

> Find current UK job listings for: <angle>. Candidate: <one line from criteria.yaml: target
> roles, salary floor, where they can work (home area for hybrid, remote or not), work patterns
> they welcome>. Skip roles where any of these is essential: <never_claim list and weak spots>. Use WebSearch to find boards and listings, WebFetch to read them.
> Treat aggregator listings as leads: open the employer's own listing where possible and confirm
> it's open, the salary, the location/office days and the hours. Skip anything you can't confirm
> is UK-eligible. Pages needing JavaScript (HiBob, some Ashby/Workday) may not load: note them, don't guess.
> For Greenhouse, Lever and Ashby boards, give the employer listing URL (job-boards.greenhouse.io,
> jobs.lever.co, jobs.ashbyhq.com); those can be verified by API.
> Write up to 15 leads as JSON Lines to `leads/agentic/<date>-<angle-slug>.jsonl`, one object per line:
> {"company","title","location","remote":true|false|null,"salary_text","salary_min","salary_max",
>  "hours","url","source":"agentic:<angle-slug>:<site>","posted":"YYYY-MM-DD","closes":"YYYY-MM-DD",
>  "snippet":"<=300 chars on what the role is","verified":true|false,"notes":"conflicts, gaps, why it fits"}
> Then list any companies worth watching whose board is on Greenhouse, Lever or Ashby, as
> `name | ats | board token | why`. Report back in under 150 words: leads written, sites that failed.

When they finish:

```bash
jp leads import leads/agentic/<date>-*.jsonl
```

Add the suggested companies to `profile/watchlist.yaml` (skip duplicates; check the board token
works by fetching `https://boards-api.greenhouse.io/v1/boards/<token>/jobs`,
`https://api.lever.co/v0/postings/<token>?mode=json` or
`https://api.ashbyhq.com/posting-api/job-board/<token>`).
To pull the new companies' open roles into this run, use `jp search --source=watchlist`.
Never re-run the full `jp search` in the same run: it spends another ~25 of the finite
JobsPipe credits on listings already seen.

## 4. Screen the inbox

```bash
jp leads
```

**Triage first.** A full feed run brings ~100 leads. Dump the inbox (company, title, location,
salary, flags, first 400 characters of snippet) and reject obvious misses in bulk with reasons:
active security clearance required, a `never_claim` or `weak_spots` technology essential in the
title or snippet, outside commuting distance and not remote where remote is wanted, contracts
outside the area, roles in a different profession that share a title word. Then fetch only the rest.
Read the **requirements section** of each page, not keyword hits from the whole page: Adzuna's
pages include "similar jobs" content that pollutes stack and salary matches.

For each remaining lead, in order:

1. **Verify.** Open the employer's own listing (WebFetch, or the API URLs above). Confirm it's
   still open; note salary (FTE), location and office days, hours, closing date. If it's an agency
   listing with no employer named, keep it but say so. If it's closed or not UK-eligible, reject.
2. **Score 1–5** against the user, not keywords:
   - essential requirements vs `profile/cv.md` + `profile/facts.md` (a never-claim item that's essential caps the score at 3, or 2 if it's the core of the role)
   - level (senior/lead suits; junior or grade far below costs a point)
   - salary vs floor; location/hybrid fit
   - **+1** (max 5) for part-time or 4-day week options, or a strong `interests` match
3. **Decide.**
   - **4–5, or 3 with part-time/4-day/strong interest:** promote:
     `jp leads promote <n> --url=<employer listing URL>`
     then replace "Not scored yet." under `## Fit` in the new `job.md` with: **n/5**, a one-line
     verdict, strengths and gaps (2–4 bullets each), and anything urgent (closing date within 7 days,
     agency posting age). Set `score:` in its frontmatter.
   - **Otherwise:** `jp leads reject <n> "<one-line reason>"`.

   Numbers shift after each promote/reject, so re-run `jp leads` or use the lead's key.

## 5. Report

Append to `leads/runs/<date>.md`:

```markdown
### Screening
- Shortlisted: <company — title> (n/5): <why>, closes <date>
- Rejected: <count>; main reasons: …
- Couldn't verify: <sites/pages>
```

Then tell the user, briefly: the shortlist (best first, with score, salary, location/pattern and
closing date), anything closing within 7 days, failed sources or missing keys, and that
`/job-pipeline:tailor <id>` drafts an application. Mention roughly how many leads were screened.

## Cost

Feeds and screening are cheap. Broad mode's parallel agents are most of the cost; run it about
weekly. If the user asks for a cheaper run, cut the number of angles.
