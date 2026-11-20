---
name: find-jobs
description: Find and screen new jobs against profile/criteria.yaml. Runs the API/RSS/watchlist feeds (jp search), reads Indeed alert emails if Gmail is connected, and with "broad" fans out parallel research agents across job boards and niches the APIs miss. Then verifies each lead on the employer's own listing, scores it, and promotes good ones into jobs/<id>/ (status shortlisted) or rejects them with a reason. Use when the user says "find jobs", "search for jobs", "any new jobs?", "/find-jobs" or "/find-jobs broad". Never tailors or applies.
---

# find-jobs (job-pipeline)

This is a pointer to the job-pipeline plugin's `find-jobs` skill, so it works where the plugin isn't
installed (claude.ai cloud sessions). If `/job-pipeline:find-jobs` is available in this session, use
that instead and ignore this file.

1. Get the plugin (cloned fresh in each cloud session; updated if already there):

   ```bash
   P="$HOME/job-pipeline-plugin"
   if [ -d "$P/.git" ]; then git -C "$P" pull -q --ff-only; else git clone -q --depth 1 https://github.com/louisjmorgan/job-pipeline-plugin "$P"; fi
   echo "$P"
   ```

2. Read `$P/skills/find-jobs/SKILL.md` and follow it exactly, for the user's request. Wherever it says
   `${CLAUDE_PLUGIN_ROOT}`, use `$P` (the full path printed above). `jp` means `node $P/src/jp.js`,
   run from this workspace.
