---
name: review
description: Publish or refresh a job's review page (and the jobs board that links them all) as a claude.ai Artifact — one page with the pitch, the questions for the user, the tailored CV in its real template, the cover letter, the written answers and the listing — so the user can read it on claude.ai and give feedback in chat. Use after tailoring, after any change to a job's drafts or status, or when the user says "review <job>", "show me the <job> application", "publish the review page", "show the board" or "/review <id>".
---

# review (job-pipeline)

This is a pointer to the job-pipeline plugin's `review` skill, so it works where the plugin isn't
installed (claude.ai cloud sessions). If `/job-pipeline:review` is available in this session, use
that instead and ignore this file.

1. Get the plugin (cloned fresh in each cloud session; updated if already there):

   ```bash
   P="$HOME/job-pipeline-plugin"
   if [ -d "$P/.git" ]; then git -C "$P" pull -q --ff-only; else git clone -q --depth 1 https://github.com/louisjmorgan/job-pipeline-plugin "$P"; fi
   echo "$P"
   ```

2. Read `$P/skills/review/SKILL.md` and follow it exactly, for the user's request. Wherever it says
   `${CLAUDE_PLUGIN_ROOT}`, use `$P` (the full path printed above). `jp` means `node $P/src/jp.js`,
   run from this workspace.
