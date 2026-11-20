---
name: learn
description: Turn the user's review into lasting improvements. "/job-pipeline:learn <job-id>" finds the user's own edits to that job's drafts (uncommitted changes and commits not co-authored by Claude), works out what each change says about their preferences or facts, and records the general lessons in profile/. "/job-pipeline:learn" with no id tidies profile/preferences.md and facts.md, and learns from rejection reasons and application outcomes. Use when the user says "learn from my edits", "/learn", or after they approve a job they edited by hand.
---

# learn (job-pipeline)

This is a pointer to the job-pipeline plugin's `learn` skill, so it works where the plugin isn't
installed (claude.ai cloud sessions). If `/job-pipeline:learn` is available in this session, use
that instead and ignore this file.

1. Get the plugin (cloned fresh in each cloud session; updated if already there):

   ```bash
   P="$HOME/job-pipeline-plugin"
   if [ -d "$P/.git" ]; then git -C "$P" pull -q --ff-only; else git clone -q --depth 1 https://github.com/louisjmorgan/job-pipeline-plugin "$P"; fi
   echo "$P"
   ```

2. Read `$P/skills/learn/SKILL.md` and follow it exactly, for the user's request. Wherever it says
   `${CLAUDE_PLUGIN_ROOT}`, use `$P` (the full path printed above). `jp` means `node $P/src/jp.js`,
   run from this workspace.
