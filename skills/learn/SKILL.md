---
name: learn
description: Turn the user's review into lasting improvements. "/job-pipeline:learn <job-id>" finds the user's own edits to that job's drafts (uncommitted changes and commits not co-authored by Claude), works out what each change says about their preferences or facts, and records the general lessons in profile/. "/job-pipeline:learn" with no id tidies profile/preferences.md and facts.md, and learns from rejection reasons and application outcomes. Use when the user says "learn from my edits", "/learn", or after they approve a job they edited by hand.
---

# Learn

**Tools.** `jp` in this skill means `node "${CLAUDE_PLUGIN_ROOT}/src/jp.js"`: run it with that full
path, from the workspace (the folder with `profile/`). If there's no `profile/` folder, stop and
suggest `/job-pipeline:setup`. CV format rules: `${CLAUDE_PLUGIN_ROOT}/CONTENT.md`.

Feedback given in chat is recorded as it happens (the workspace CLAUDE.md → "Learning from feedback"). This
skill covers what that misses: **edits the user made directly in files**, and **periodic tidying**.

Where lessons go (same as the workspace CLAUDE.md):
- what's true → `profile/facts.md` (+ a lint rule if a regex can catch it)
- stories → `profile/stories.md`
- style, tone, emphasis, structure, framing → `profile/preferences.md`
- which jobs are worth it → `profile/preferences.md` → Screening, or `criteria.yaml` for hard filters

## `/learn <job-id>`: learn from the user's edits

1. **Find the user's changes** to `jobs/<id>/` (drafts: `overlay.md`, `variant.json`, `answers.md`,
   `cover-letter.md`):
   ```bash
   git diff HEAD -- jobs/<id>/                       # uncommitted edits
   git log --format='%H%x09%an%x09%s%x09%b' -- jobs/<id>/   # commits; the user's own have no "Co-Authored-By: Claude" trailer
   git show <hash> -- jobs/<id>/                     # each of the user's commits
   ```
   Ignore `job.md` status/date changes and `out/`. If there are no user edits, say so and stop.
2. **Read each change as a before/after pair** and ask what it says:
   - a fact corrected or removed → a facts lesson
   - wording, tone or length changed throughout → a style lesson
   - something moved to the front, cut, or reframed → an emphasis lesson
   - a one-off fix for this job only (a typo, this company's name) → no lesson
   Look for **patterns across the changes**; one rewritten sentence is weaker evidence than five
   rewritten the same way. Compare with the existing rules: a change may confirm, sharpen or
   contradict one.
3. **Propose the lessons before writing them**: a short list, each with the file it would go to
   and the edit that prompted it. Ask about anything ambiguous. Write only what the user accepts.
4. **Record** them (short, specific, dated; merge rather than duplicate; replace contradicted
   rules), commit the user's edits if they're uncommitted, and commit the lessons with them.
5. If the job is now reviewed, suggest `jp set <id> approved`.

## `/learn` (no id): tidy and learn from outcomes

1. **Prune `preferences.md`**: merge near-duplicates, drop rules later ones contradict, sharpen
   vague ones ("be concise" → the concrete version the feedback meant). Keep it short: a long list
   of soft rules makes drafts worse. Same for the prose part of `facts.md`.
2. **Rejection patterns**: read `rejected` reasons in `leads/seen.json` and the statuses in `jobs/`.
   If the user keeps turning down a kind of role, propose a Screening rule or a `criteria.yaml` change.
3. **Outcomes**: for jobs at `interview`, `rejected` (by the employer) or `applied` for over a
   month, note which pitch and stories each used. Only propose a lesson when there's a pattern
   across several applications; one outcome is noise.
4. Propose all changes as a list, apply what the user accepts, commit.
