You are running a scheduled job search (mode: {{MODE}}) for the user's job-search workspace: the checked-out repo that has a profile/ folder. Then you tailor drafts for up to {{TAILOR_MAX}} shortlisted jobs. Nobody is watching; the user reads the results later. All git work happens in the workspace repo.

0. Plugin. The workspace uses the job-pipeline plugin. Its repo (job-pipeline-plugin) is also checked out here: find it with `find / -maxdepth 4 -name plugin.json -path '*job-pipeline-plugin/.claude-plugin/*' 2>/dev/null`; its parent folder is the plugin root. Follow the plugin's skills by reading <plugin root>/skills/<name>/SKILL.md, reading ${CLAUDE_PLUGIN_ROOT} as the plugin root. `jp` means `node <plugin root>/src/jp.js`; it installs its own npm dependencies on first run. Job board API keys come from the environment variables. Never write them into any file.

1. Search. Follow the find-jobs skill: {{MODE}} mode ("broad" includes the research-agent fan-out, with subagents on model sonnet; "normal" does not), then screen the whole inbox. Run `jp search` exactly once in this run, even if an earlier run today already searched. Gmail isn't connected, so skip the email step.

2. Save the search. Make sure leads/runs/<today>.md has the Screening section, noting missing keys or failed sources. Run `git add leads jobs profile/watchlist.yaml`, commit `find-jobs <today>: <n> screened, <m> shortlisted`, then `git pull --rebase --autostash origin main` and push to main. If the rebase conflicts on leads/seen.json, keep both sides' entries (it's a map of lead key to verdict) and continue.

3. Tailor (skip this step if {{TAILOR_MAX}} is 0). List jobs at status shortlisted (`jp jobs --status=shortlisted`). Take at most {{TAILOR_MAX}}, highest score first, then soonest closing date. Launch one subagent per job in parallel (Agent tool, a single message), each told:
"In the workspace at <path>, run the job-pipeline tailor skill (<plugin root>/skills/tailor/SKILL.md; jp = node <plugin root>/src/jp.js) for job <id> only, following the workspace CLAUDE.md. Never invent facts. Anything only the user can answer goes in review.md under Questions for you. Don't touch other jobs, don't commit, and don't apply or contact anyone. Publish the review page as the skill says if an Artifact tool is available, and record review_url. If the PDF build can't run, still run jp lint, and note in review.md: 'PDF not built in the cloud: run jp build --job=<id> and check it is two pages.' Report the score, the pitch in one line, gaps, questions for the user, the build and lint result, and the review page link."
A job the skill stops on (score 2 or lower) stays as the skill leaves it.

4. When they finish, for each job: check that `jp lint <id>` is clean, then run `git add jobs/<id>` and commit `tailor <id>: drafted (<n>/5)`. Then run `git pull --rebase --autostash origin main` and push to main. Never commit .env, node_modules or out/ folders.

5. Refresh the jobs board, following section 4 of <plugin root>/skills/review/SKILL.md, if an Artifact tool is available. Then append a `### Tailored` section to leads/runs/<today>.md, with one line per job: id, score, pitch, review page link and questions for the user. Add any shortlisted jobs left for the next run. Commit and push it.

6. End with a short summary:
- the new shortlist (score, salary, location and work pattern, closing date)
- what was drafted, with its review page links and open questions
- anything closing within 7 days
- companies added to the watchlist
- failed sources
