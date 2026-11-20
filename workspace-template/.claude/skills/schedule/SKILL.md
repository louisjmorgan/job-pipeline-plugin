---
name: schedule
description: Set up scheduled cloud runs of the job search (and optional tailoring) as claude.ai routines — checks the workspace is on GitHub, walks the user through GitHub access, a cloud environment with their API keys and full network access, then creates the routines with a tested prompt and runs one to check it works. Also changes or pauses existing job-search routines. Use when the user says "schedule the search", "run it every morning", "automate find-jobs", or "/job-pipeline:schedule".
---

# schedule (job-pipeline)

This is a pointer to the job-pipeline plugin's `schedule` skill, so it works where the plugin isn't
installed (claude.ai cloud sessions). If `/job-pipeline:schedule` is available in this session, use
that instead and ignore this file.

1. Get the plugin (cloned fresh in each cloud session; updated if already there):

   ```bash
   P="$HOME/job-pipeline-plugin"
   if [ -d "$P/.git" ]; then git -C "$P" pull -q --ff-only; else git clone -q --depth 1 https://github.com/louisjmorgan/job-pipeline-plugin "$P"; fi
   echo "$P"
   ```

2. Read `$P/skills/schedule/SKILL.md` and follow it exactly, for the user's request. Wherever it says
   `${CLAUDE_PLUGIN_ROOT}`, use `$P` (the full path printed above). `jp` means `node $P/src/jp.js`,
   run from this workspace.
