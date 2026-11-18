---
name: setup
description: Set up a new job search workspace, or fill in an incomplete one, by interviewing the user — imports their existing CV into profile/cv.md, builds the evidence and story banks, records settled facts and a never-claim list, sets search criteria (roles, salary, location, work pattern, interests), configures job board API keys, and builds a first CV to check. Use when the user says "set up", "get started", "/setup", installs the job-pipeline plugin, or when another job-pipeline skill finds no profile/ folder.
---

# Set up a job search workspace

**Tools.** `jp` in this skill means `node "${CLAUDE_PLUGIN_ROOT}/src/jp.js"`. CV format rules:
`${CLAUDE_PLUGIN_ROOT}/CONTENT.md` (read it before writing `cv.md`).

The workspace is a folder (ideally a private git repo) holding one person's profile and every
job. Everything later depends on `profile/` being accurate, so this is an interview, not a form:
ask, listen, write it down in their words, and **never invent** a fact, number, date or skill.

Work through the stages in order. After each one, show what you wrote in a few lines and let the
user correct it before moving on. If they stop part-way, everything so far is saved; running
setup again picks up from the first stage that's still a template.

## 1. Workspace

- Run `jp where`. If it already shows a workspace with `profile/`, this is a resume: read
  `profile/` and skip to the first stage still holding template text ("(none yet)", "Leeds", empty lists).
- Otherwise ask where to create it (default: the current folder if it's empty, else a new
  `job-search/` folder here). Run `jp init <folder>`, then `git init` there if it isn't a repo.
- Explain once: the workspace holds personal data; keep it private (a private GitHub repo is
  fine and lets scheduled cloud runs use it).

## 2. CV → `profile/cv.md` and `profile/evidence.md`

Ask for their current CV (a file path to a PDF, Word or Markdown file, or pasted text) and
LinkedIn-style extras if they have them.

- Extract text (PDF: the Read tool or `pdftotext`; .docx: `unzip -p <file> word/document.xml`
  and strip tags, or pandoc if installed).
- Write `profile/cv.md` following CONTENT.md exactly: frontmatter (name, headline title, email,
  phone, location, links), `## Summary`, `## Experience` with one `### Role {#stable-id}` entry
  per job (`org`, `location`, `dates`, `tech` meta, then bullets), `## Projects` if any,
  `## Skills` grouped into a few `###` entries, `## Education`. Give every entry an explicit
  `{#id}` (short, lowercase: `acme-senior`, `uni-leeds`).
- Keep their wording; fix only obvious typos. Don't upgrade claims.
- Then go role by role and ask for **evidence** the CV leaves out: scale (users, revenue, team
  size), outcomes with numbers, tools, what they personally did vs the team. Write it to
  `profile/evidence.md`, one `##` per role or project. Two or three questions per role is
  plenty; tell them they can add more any time.
- **Pick a look.** Build the CV in each built-in template (`jp build --variant=main
  --template=modern-single-column`, `…=modern`, `…=classic`) and give them the PDF paths:
  single column is the safest for applicant tracking systems; `modern` has a sidebar; `classic`
  is serif and traditional. Ask about an accent colour or font too. Save the choice in
  `variants/main.json` (`template`, `theme`, `fonts`; the cv-style skill,
  `${CLAUDE_PLUGIN_ROOT}/skills/cv-style/SKILL.md`, has the details and can build a custom
  layout). Every tailored CV and cover letter uses this house style.
- Build it: `jp build` and tell them where the PDF is. If it runs past two pages, offer to
  exclude older entries in `variants/main.json`.

## 3. Facts and limits → `profile/facts.md`

Ask:
- Technologies or experience recruiters might assume but they **don't** have (these become
  `never_claim`; drafts mentioning them fail the lint).
- Things that must always be described a certain way (exact job titles, "led" vs "contributed",
  dates of launches, anything a past application got wrong). Write each as a bullet under
  "Settled facts", and add a `rules:` regex when a pattern can catch the wrong version.
- Right to work, notice period and salary expectations are **not** stored unless they ask; forms
  always mark those "You fill in".

## 4. Stories → `profile/stories.md`

Ask for their 3–5 proudest pieces of work. For each, draw out situation → action → result with
real numbers, and what it shows (skills, values). Write them in the file's format with an
`{#id}`. These power written answers and cover letters, so depth beats breadth.

## 5. What to look for → `profile/criteria.yaml`

Ask, then edit the template in place (keep its comments):
- target roles and seniority → `roles.titles`, `queries` (4–8 search phrases), `exclude_titles`
- minimum salary (full-time equivalent) → `salary_floor`
- home town or city, how far they'll commute, which places count → `location.home`,
  `radius_miles`, `commutable`; remote UK OK? → `location.remote`; relocation
- full-time, part-time, four-day week: "ok", "very interested" or "no" → `work_pattern`
- sectors or kinds of work they'd love → `interests` (these steer broad search)
- technologies they'd rather avoid as essentials → `roles.weak_spots`
- companies they'd like to watch: find each one's Greenhouse, Lever or Ashby board token
  (check `https://boards-api.greenhouse.io/v1/boards/<token>/jobs`,
  `https://api.lever.co/v0/postings/<token>?mode=json` or
  `https://api.ashbyhq.com/posting-api/job-board/<token>`) and add them to `profile/watchlist.yaml`.

The feeds are UK job boards (Reed, Adzuna) plus company boards worldwide. If they're outside the
UK, say the UK feeds won't help yet and set `reed`/`adzuna` to `enabled: false`; company boards
and broad research still work.

## 6. Job board keys → `.env`

Optional but recommended: free keys for Reed (reed.co.uk/developers) and Adzuna
(developer.adzuna.com). JobsPipe is paid after one-time free credits; leave it disabled unless they
want it. Have them paste keys into `.env` themselves (copy `.env.example`); never echo keys back,
never commit `.env` (it's gitignored). For scheduled cloud runs the same names go in the cloud
environment's variables instead.

## 7. Finish

- `jp lint` should pass on the generic CV.
- Commit everything (`git add -A && git commit -m "Set up job search workspace"`), excluding `.env`.
- Tell them what's next, in a few lines: `/job-pipeline:find-jobs` to search (add `broad` for the
  research agents), `/job-pipeline:tailor <id>` to draft an application, `/job-pipeline:review <id>`
  for the review page, `/job-pipeline:cv-style` to change the look, and that feedback in chat is remembered in `profile/preferences.md`.
- Offer scheduled daily searches: `/job-pipeline:schedule` walks them through it.
