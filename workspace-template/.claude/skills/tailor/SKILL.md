---
name: tailor
description: Tailor an application for one job in jobs/<id>/ — writes requirements.md (if missing), a fit score, variant.json + overlay.md (tailored CV), answers.md (written questions), cover-letter.md (only if the application takes one) and review.md, then builds and lints until clean and sets the job to drafted. Use when the user says "tailor", "draft the application", "write the CV/answers for <job>", or names a job id to prepare. Never submits anything.
---

# tailor (job-pipeline)

This is a pointer to the job-pipeline plugin's `tailor` skill, so it works where the plugin isn't
installed (claude.ai cloud sessions). If `/job-pipeline:tailor` is available in this session, use
that instead and ignore this file.

1. Get the plugin (cloned fresh in each cloud session; updated if already there):

   ```bash
   P="$HOME/job-pipeline-plugin"
   if [ -d "$P/.git" ]; then git -C "$P" pull -q --ff-only; else git clone -q --depth 1 https://github.com/louisjmorgan/job-pipeline-plugin "$P"; fi
   echo "$P"
   ```

2. Read `$P/skills/tailor/SKILL.md` and follow it exactly, for the user's request. Wherever it says
   `${CLAUDE_PLUGIN_ROOT}`, use `$P` (the full path printed above). `jp` means `node $P/src/jp.js`,
   run from this workspace.
