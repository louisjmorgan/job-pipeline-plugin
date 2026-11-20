---
name: setup
description: Set up a new job search workspace, or fill in an incomplete one, by interviewing the user — imports their existing CV into profile/cv.md, builds the evidence and story banks, records settled facts and a never-claim list, sets search criteria (roles, salary, location, work pattern, interests), configures job board API keys, and builds a first CV to check. Use when the user says "set up", "get started", "/setup", installs the job-pipeline plugin, or when another job-pipeline skill finds no profile/ folder.
---

# setup (job-pipeline)

This is a pointer to the job-pipeline plugin's `setup` skill, so it works where the plugin isn't
installed (claude.ai cloud sessions). If `/job-pipeline:setup` is available in this session, use
that instead and ignore this file.

1. Get the plugin (cloned fresh in each cloud session; updated if already there):

   ```bash
   P="$HOME/job-pipeline-plugin"
   if [ -d "$P/.git" ]; then git -C "$P" pull -q --ff-only; else git clone -q --depth 1 https://github.com/louisjmorgan/job-pipeline-plugin "$P"; fi
   echo "$P"
   ```

2. Read `$P/skills/setup/SKILL.md` and follow it exactly, for the user's request. Wherever it says
   `${CLAUDE_PLUGIN_ROOT}`, use `$P` (the full path printed above). `jp` means `node $P/src/jp.js`,
   run from this workspace.
