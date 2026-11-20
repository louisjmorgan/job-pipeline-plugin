---
name: cv-style
description: Change how the CV and cover letter look — pick a different layout template, change colours, fonts and text size, or create a custom template (from scratch or modelled on a CV the user likes) — for every job at once (the house style) or for one job. Use when the user says "change the CV layout", "different template", "make it look like this", "change the font/colour", "two columns", or "/cv-style".
---

# cv-style (job-pipeline)

This is a pointer to the job-pipeline plugin's `cv-style` skill, so it works where the plugin isn't
installed (claude.ai cloud sessions). If `/job-pipeline:cv-style` is available in this session, use
that instead and ignore this file.

1. Get the plugin (cloned fresh in each cloud session; updated if already there):

   ```bash
   P="$HOME/job-pipeline-plugin"
   if [ -d "$P/.git" ]; then git -C "$P" pull -q --ff-only; else git clone -q --depth 1 https://github.com/louisjmorgan/job-pipeline-plugin "$P"; fi
   echo "$P"
   ```

2. Read `$P/skills/cv-style/SKILL.md` and follow it exactly, for the user's request. Wherever it says
   `${CLAUDE_PLUGIN_ROOT}`, use `$P` (the full path printed above). `jp` means `node $P/src/jp.js`,
   run from this workspace.
