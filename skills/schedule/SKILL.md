---
name: schedule
description: Set up scheduled cloud runs of the job search (and optional tailoring) as claude.ai routines — checks the workspace is on GitHub, walks the user through GitHub access, a cloud environment with their API keys and full network access, then creates the routines with a tested prompt and runs one to check it works. Also changes or pauses existing job-search routines. Use when the user says "schedule the search", "run it every morning", "automate find-jobs", or "/job-pipeline:schedule".
---

# Schedule the job search

Routines run in Anthropic's cloud on a timetable. Each run checks out the user's workspace repo
and this plugin's repo, runs find-jobs (and tailoring if wanted), and pushes the results to the
workspace's `main` branch. The user reads them later (`git pull`, review pages on claude.ai).

The routine is created with the built-in **`schedule`** skill (Skill tool, `schedule`), which
holds the routine API, the user's cloud environments and their ids. This skill prepares
everything that skill needs and fills in the routine prompt.

## 1. Check the workspace

- It must be a git repo with a GitHub remote (`git remote get-url origin`) and everything pushed
  (`git status -sb`). If there's no remote: suggest a **private** repo (`gh repo create <name>
  --private --source=. --push`, with their OK; the workspace holds their CV).
- The plugin repo: `repository` in `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`.

## 2. What the user sets up on claude.ai (they must do these; you can't)

Give these as one checklist and wait until they say they're done:

1. **GitHub connected to Claude**: run `/web-setup`, or https://claude.ai/connect-github.
2. **Repo access**: at https://github.com/settings/installations → Claude → Configure, give the
   app access to the workspace repo, and to the plugin repo too if it's private.
3. **A cloud environment** (claude.ai/code → environment settings), e.g. named "job-search":
   - **Environment variables**: the job board keys from their `.env` (`REED_API_KEY`,
     `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `JOBSPIPE_API_KEY`), as `NAME=value` lines. Name the
     variables; never print their values.
   - **Network access: Full.** Screening opens employers' own sites; a limited list blocks them.

## 3. Choose the schedule

Recommend, then let them change:
- **Daily search**, Tuesday–Friday 07:00 local time: `mode = normal`.
- **Broad search** (research agents, costs more), Monday 07:00: `mode = broad`.
- **Tailoring** after each search: up to 3 shortlisted jobs per run (`tailor_max = 3`), or 0
  for search only. Tailoring is most of the cost.
- Model: Sonnet for both. Cron is in UTC: convert from their time zone and say so.

## 4. Create the routines

Load the `schedule` skill and create one routine per schedule with:
- the environment from step 2 (match it by name in that skill's environment list),
- **two sources**: the workspace repo URL, then the plugin repo URL,
- allowed tools: Bash, Read, Write, Edit, Glob, Grep, WebFetch, WebSearch, Skill, Agent,
- the prompt: `${CLAUDE_PLUGIN_ROOT}/skills/schedule/routine-prompt.md` with `{{MODE}}`
  (`normal` or `broad`) and `{{TAILOR_MAX}}` filled in. Send the filled text as it is; it's
  self-contained and tested.

Name them e.g. "job search: daily" and "job search: broad (Mon)".

## 5. Test

Run one routine now (`schedule` skill → run). A run takes 5–30 minutes. When the user is back,
check it with that skill's `list_runs` and `get_run_log`, then `git pull` and read
`leads/runs/<today>.md`. Common failures: keys missing ("skipped (set … )" in the digest →
step 2.3), 403s from job boards (network not Full), "repository access" errors (step 2.2).

## Changing or stopping

Use the `schedule` skill to update the cron, prompt (regenerate it from routine-prompt.md) or
`enabled: false` to pause. Routines are deleted at https://claude.ai/code/routines.
