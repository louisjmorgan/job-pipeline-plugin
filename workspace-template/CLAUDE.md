# Job search workspace

This folder is one person's job search, run with the **job-pipeline** plugin:
criteria → search (`/job-pipeline:find-jobs`) → tailored CV, answers and letters
(`/job-pipeline:tailor`) → review page (`/job-pipeline:review`) → the user reviews → the user applies.

- `profile/` is the source of truth about the user: `facts.md` (settled facts, never-claim list,
  lint rules) > `cv.md` > `stories.md` > `evidence.md`, plus `preferences.md` (style and judgement)
  and `criteria.yaml` (what to look for).
- Never invent facts, numbers or experience. If a fact would help, ask the user.
- Never submit an application, email anyone or fill in a form. The user sends everything.
- Tools: `jp` is the plugin's command line (its full path is given at session start and in each skill). After changing a job's
  drafts: `jp build --job=<id>` and `jp lint <id>`, then republish its review page if it has one
  (`review_url` in job.md), then commit.

## In a claude.ai cloud session (browser)

Cloud sessions don't install plugins, so the `/job-pipeline:*` commands aren't there. Instead,
`.claude/skills/` in this repo holds a pointer skill for each one (`/find-jobs`, `/tailor`,
`/review`, `/learn`, `/cv-style`, `/setup`, `/schedule`). Each clones the plugin to
`~/job-pipeline-plugin` (`git clone --depth 1 https://github.com/louisjmorgan/job-pipeline-plugin`)
and follows its real skill. Then:
- `jp` means `node ~/job-pipeline-plugin/src/jp.js` (full path), run from this workspace. It
  installs its own dependencies on first run.
- Job board API keys come from the environment's variables. Never write them into a file.
- Commit and push to `main` when a piece of work is done (`git pull --rebase origin main` first),
  so scheduled runs and the next session see it.
- The user gets PDFs from the **Download** buttons on each job's review page, so publish or
  republish it after any change to a job's drafts.

## Learning from feedback

The user reviews drafts mostly by giving feedback in chat, often while reading the job's review
page. Every piece of feedback is a chance to make future drafts closer, so in the same turn:

1. **Apply it** to the draft, rebuild, lint and republish the review page.
2. **Decide the scope.** Is it about this job only ("cut answer 2 to 200 words") or a general
   preference ("too formal", "lead with outcomes", "never say X")? Phrased generally, or a repeat
   of earlier feedback: general. Genuinely unclear: ask once ("just here, or always?").
3. **Record general lessons** where future runs will read them:
   - a correction to what's true → `profile/facts.md`, plus a lint rule if a regex can catch it
   - a new or better story, or new detail on one → `profile/stories.md`
   - style, tone, emphasis, structure, what to lead with or leave out → `profile/preferences.md`
   - which jobs are or aren't worth it → `profile/preferences.md` → Screening (or `criteria.yaml` for hard filters like salary or location)
   Keep entries short, specific and dated. Merge with an existing rule rather than adding a
   near-duplicate; replace a rule the feedback contradicts.
4. **Say what was recorded** in one line ("Recorded in preferences.md: lead with outcomes, not
   tools"), so the user can veto it.
5. **Commit** the draft change and the lesson together.

Edits the user makes directly in files are picked up by `/job-pipeline:learn <id>`;
`/job-pipeline:learn` on its own tidies the profile and learns from outcomes.

Treat a job at status `approved` or `applied` as reviewed: its wording is a good example for
future drafts. Drafts at `drafted` haven't been reviewed and shouldn't be copied as examples.
