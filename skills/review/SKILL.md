---
name: review
description: Publish or refresh a job's review page as a claude.ai Artifact — one page with the pitch, the questions for the user, the tailored CV in its real template, the cover letter, the written answers and the listing — so the user can read it on claude.ai and give feedback in chat. Use after tailoring, after any change to a job's drafts, or when the user says "review <job>", "show me the <job> application", "publish the review page" or "/review <id>".
---

# Review page

**Tools.** `jp` in this skill means `node "${CLAUDE_PLUGIN_ROOT}/src/jp.js"`: run it with that full
path, from the workspace (the folder with `profile/`). If there's no `profile/` folder, stop and
suggest `/job-pipeline:setup`.

Input: a job id (`jobs/<id>/`). With no id, use the job the conversation is about; if there's
none, list jobs at `drafted` (`jp jobs --status=drafted`) and ask which.

## 1. Generate the page

```bash
jp review <id> --out=<scratchpad or temp dir>/<id>-review.html
```

It prints the file path. The page is self-contained (the CV and cover letter are embedded in their
real templates) and already follows the Artifact page contract, so publish it as it is. Don't
hand-edit the HTML: to change what it shows, change the job's files and generate it again.

## 2. Publish or update

Read `review_url:` in `jobs/<id>/job.md`.

- **No `review_url`:** publish the file with the Artifact tool (`icon: "briefcase"`, a one-line
  `description`: "<Company> <Title> application: pitch, open questions, tailored CV and answers").
  Then write the returned URL into job.md's frontmatter as `review_url:` and commit it.
- **Has `review_url`:** publish with `url` set to it so the link stays the same. If this
  conversation hasn't read or published that artifact yet, read it first (`action: "read"`) as
  the Artifact tool requires, then publish the new file to the same `url`.

If no Artifact tool is available (for example in a scheduled cloud run), skip publishing and say
so; the user can run this skill later from a session that has one.

## 3. Tell the user

One line with the link, the number of open questions for them, and the closing date. Feedback
they give about the page is handled as the workspace CLAUDE.md says ("Learning from feedback"):
apply it to the files, rebuild and lint, record general lessons, then come back here and
republish to the same URL.
