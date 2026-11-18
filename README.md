# job-pipeline

A Claude Code plugin for running your job search from one master CV:

```
/setup → criteria → /find-jobs → /tailor (CV, answers, cover letter) → /review page → you review → you send
```

Code handles the fixed steps (job board APIs, deduplication, PDF builds, ATS and claims checks).
Skills handle the judgement (scoring jobs, reading requirements, writing). **It never applies,
emails or fills in a form for you.**

## Install

```
/plugin marketplace add louisjmorgan/job-pipeline-plugin
/plugin install job-pipeline@job-pipeline
```

Needs Node 20+. The first command that needs them installs the plugin's dependencies (including
a headless Chromium for PDFs) into `~/.cache/job-pipeline`, once.

## Get started

Open Claude Code in an empty folder (it becomes your **workspace**: keep it private, e.g. a
private GitHub repo) and run:

```
/job-pipeline:setup
```

It interviews you: imports your CV, asks for the evidence and stories behind it, the things you
must never claim, what you're looking for, and job board API keys. Then:

| Command | What it does |
| --- | --- |
| `/job-pipeline:find-jobs` | Runs the job feeds, verifies and scores each lead, shortlists good ones into `jobs/` |
| `/job-pipeline:find-jobs broad` | Also sends research agents across boards the feeds miss (costs more; weekly) |
| `/job-pipeline:tailor <id>` | Requirements, fit score, tailored CV, written answers, cover letter if needed, `review.md` |
| `/job-pipeline:review <id>` | Publishes the job's review page as a claude.ai Artifact: pitch, questions for you, CV, answers |
| `/job-pipeline:learn [<id>]` | Learns from edits you made by hand; tidies your preferences |
| `/job-pipeline:cv-style` | Changes the layout, colours and fonts of your CV and letters, or builds a custom template |
| `/job-pipeline:schedule` | Sets up daily cloud runs: search every morning, tailor what's shortlisted |

Review by chatting: open the review page, then tell Claude what to change ("lead with the
outcome in answer 2", "never call it a platform"). Claude edits the drafts, lints them against your
facts, republishes the page, and records general lessons in `profile/preferences.md` or
`facts.md` so the next draft is closer.

## Workspace layout

```
profile/                 facts about you, shared by every job
  cv.md                  master CV (format: CONTENT.md in this plugin)
  evidence.md            detailed fact bank: the only allowed source of claims
  facts.md               settled facts + never-claim list, machine-checked by `jp lint`
  stories.md             situation → action → result stories for written answers
  preferences.md         style, framing and screening judgements learned from your feedback
  criteria.yaml          what to look for: salary floor, location, roles, interests, sources
  watchlist.yaml         companies whose Greenhouse/Lever/Ashby boards are checked every search
leads/                   search state: inbox.jsonl, seen.json, runs/<date>.md digests, agentic/
jobs/<id>/               one job: job.md, requirements.md, variant.json, overlay.md, answers.md,
                         cover-letter.md, review.md, out/ (built PDFs, gitignored)
variants/<name>.json     generic, non-job CVs
templates/<name>/        optional: your own CV templates (override or add to the plugin's)
CLAUDE.md                how Claude works in this workspace, including learning from feedback
.env                     job board API keys (gitignored)
```

## The `jp` command

The skills call the plugin's command line, `node <plugin>/src/jp.js`. To use it yourself, run
`npm link` in the plugin folder (or a clone of this repo) to get `jp` on your PATH, then from your
workspace:

```bash
jp jobs                       # board of jobs still in play
jp add <greenhouse|lever|ashby url>
jp build --job=<id>           # CV (+ cover letter) PDFs
jp lint <id>                  # check drafts against profile/facts.md
jp search                     # run the feeds into leads/inbox.jsonl
jp preview                    # http://localhost:3000/jobs, live-reloading
jp review <id>                # self-contained review page (what /review publishes)
jp board                      # jobs board page: every job, linking to its review page
jp where                      # which workspace and plugin are in use
```

Run from anywhere inside the workspace, or set `JOB_PIPELINE_HOME`.

## Scheduled runs

`/job-pipeline:schedule` sets up claude.ai routines that run the search (and tailoring) every
morning against your workspace repo, and walks you through what they need: the workspace on
GitHub (private), Claude's GitHub app given access, and a cloud environment with your API keys and
network access set to Full. The routine prompt is `skills/schedule/routine-prompt.md`.

## Jobs

### Status

A job's status lives in the frontmatter of its `job.md`, and nowhere else:

```
new → shortlisted → analysed → drafted → approved → applied → interview
                                          (rejected / closed at any point)
```

```bash
jp jobs                                  # jobs still in play, by status then closing date
jp jobs --all                         # include rejected and closed
jp jobs --status=drafted
jp set acme-platform-engineer applied   # also records the applied date
```

Closing dates within 7 days are flagged on the board.

### Adding a job

```bash
jp add https://job-boards.greenhouse.io/<company>/jobs/<id>
```

This creates `jobs/<company>-<title>/job.md` with the details, the listing as markdown and the
**application form**: Greenhouse's public API returns the real questions, so the written answers
can target them. It also records whether a cover letter is requested. Other sites aren't
supported yet: copy an existing `job.md`'s frontmatter and paste the listing under `## Listing`.

### Tailoring: `/job-pipeline:tailor <id>`

In Claude Code, `/job-pipeline:tailor <id>` runs the skill in `.claude/skills/tailor/SKILL.md`. It:

1. writes `requirements.md` (criteria → evidence, written questions, gaps, do-not-claim)
2. scores fit in `job.md` (stops at 2/5 or below)
3. writes `variant.json` + `overlay.md` (the tailored CV, two pages)
4. writes `answers.md` (each written question + a form-fields table, with "You fill in" for anything personal)
5. writes `cover-letter.md`, only if the application takes one
6. builds and lints until clean
7. writes `review.md` and sets the job to `drafted`

Every claim must trace to `profile/` (`facts.md` > `cv.md` > `stories.md` > `evidence.md`). It never submits anything.

### Cover letters

`jobs/<id>/cover-letter.md` holds optional frontmatter (`to:`, `company:`, `date:`, and for a
university-style supporting statement `heading:` and `max_pages: 2`), then the letter
from "Dear …" to "Best wishes,". The template adds the header, date, recipient and your name.
`jp build --job=<id>` writes `out/<Name>-Cover-Letter.pdf` plus a `.txt` for pasting into
a form, and warns if the letter runs past `max_pages` (default 1). Preview at `/letter?job=<id>`.

### Tailoring a CV by hand

`jobs/<id>/variant.json` picks a template and filters content (see [Variants](#variants)).
`jobs/<id>/overlay.md` swaps tailored wording in where a job needs different text, not just a
different selection. It uses the same format as `cv.md` but only holds what changes, matched by id:

- frontmatter keys replace the master's (handy for a role-specific `title`)
- a section's intro text, if present, replaces the master intro (e.g. a tailored Summary)
- an entry replaces the master entry with the same id: title and body are replaced, and `key: value` meta is merged

Overlays never add or reorder sections or entries. Ids that don't exist in `cv.md` show up as warnings.

### Claims lint

`jp lint` checks what would actually be sent: the rendered CV (after overlay and
filters), `cover-letter.md` and `answers.md`. The rules come from `profile/facts.md`:

- `never_claim` terms (technologies with no evidence) → error
- `rules`: regexes for settled wording, such as "server uptime" or unfilled `[PLACEHOLDERS]` → error, or a warning if `level: warn`
- a metric (£125k, 40,000, 70+…) repeated outside the summary → warning

With no arguments it lints every generic variant and every job not `rejected` or `closed`. The exit code is 1 on any error.
To state a gap on purpose in a cover letter or answers draft, end the line with
`<!-- lint-ok: reason -->`.

## Previewing

`jp preview` starts a local server (set `PORT` to change from 3000).

| URL                                   | Shows                                                    |
| ------------------------------------- | -------------------------------------------------------- |
| `/jobs`                               | jobs still in play (`?all=1` adds rejected and closed)   |
| `/jobs/<id>`                          | one job to review, in tabs: Job (details, pitch, gaps, fit, listing, requirements), CV, Cover letter, Questions (your open questions from `review.md` + `answers.md`) |
| `/?variant=main`                      | generic variant rendered with its own template           |
| `/?job=<id>`                          | a job's tailored CV                                      |
| `/?variant=main&template=classic`     | same content filter, different template                  |
| `/pdf?job=<id>[&template=…]`          | the actual PDF from Playwright, so you can check page breaks |
| `/letter?job=<id>`, `/letter.pdf?job=<id>` | the job's cover letter                               |

The page reloads automatically when you save anything in `profile/`, `jobs/`, `templates/` or
`variants/`. A floating toolbar (hidden when printing) switches CV/template, links to the
PDF, and lists **warnings**, such as a variant that references a section or entry id that doesn't
exist. Parse errors (for example a duplicate id) show in the browser instead of the CV.

## Building PDFs

```bash
jp build                                          # variants/main.json
jp build --variant=concise
jp build --variant=main --template=classic     # override the variant's template
jp build --job=acme-platform-engineer           # jobs/<id>/out/<Name>-CV.pdf (+ cover letter if any)
jp build --all                                      # every generic variant and every job with a variant.json
```

Generic variants go to `output/<template>-<variant>.pdf`. Job CVs go to `jobs/<id>/out/`, named
after the `name` in `cv.md` (`Ada-Lovelace-CV.pdf`), because that's the file you upload. Page size
and margins come from each template's `@page` rule. Warnings print to the console, and the exit
code is non-zero if any build fails.

Templates load Google Fonts, so builds want network access. Offline, they fall back to the
system fonts in each template's font stack.

## ATS compatibility check

Every build extracts the text back out of the generated PDF (the same way an ATS parser would)
and checks it:

- **Content check** — your name, email, phone, location, and every included section/entry title
  must actually be findable in the extracted text. This catches text that silently isn't real
  text anymore — rendered as an image/canvas, or letters spaced apart (e.g. heavy
  `letter-spacing` on a heading) so `SUMMARY` extracts as `S U M M A R Y` and no longer matches
  `summary` as a keyword. These are reported as `✗` errors and **fail the build** (non-zero exit).
- **Column-order simulation** — some ATS software doesn't read a PDF's text in document order;
  it sorts all text on a page by visual position (top-to-bottom, then left-to-right across the
  *full page width*), the way you'd read a page with no columns. The build re-simulates that
  exact algorithm against the real generated PDF (via `pdfjs-dist`, reading each text item's
  actual x/y position) and checks whether any section ends up split into more than one place —
  the concrete signature of two columns' text getting merged line-by-line. This is template- and
  content-specific: it only fires when your real content actually overlaps badly, not just
  because a template happens to use CSS grid. It's a `⚠` warning, not a build failure, because
  most current ATS engines (Workday, Greenhouse, Lever, and similar) read PDFs in document order
  and aren't affected — only parsers that re-sort by position are. `classic` is single-column and
  always clean; `modern` puts Skills/Education in a real side-by-side sidebar on page 1, so it
  will warn. `modern-single-column` has the same look as `modern` with no sidebar, for when you
  want that warning gone.
- **CSS scan** — flags `column-count` (CSS multi-column text flow) and `::before`/`::after`
  content carrying real words (invisible to the PDF text layer, so ATS parsers can't see it).

Run `jp build --skip-ats-check` to skip it.

## Writing the CV

`profile/cv.md` is the master CV. See **[CONTENT.md](CONTENT.md)** for the full rules. In short:

- YAML frontmatter holds `name`, `title`, `email`, `phone`, `location`, `links`.
- `## Section` gives a section with id `slugify(heading)`, or `{#custom-id}`.
- `### Entry {#entry-id}` gives an entry with a stable id, unique across the file.
- Optional `key: value` lines right under an entry heading become metadata
  (`org`, `location`, `dates`, `link`, `tech`).
- Order in the file doesn't matter. Templates decide order.

## Variants

A variant is `variants/<name>.json` (a generic CV) or `jobs/<id>/variant.json` (a job's CV). It
picks a template and filters content. **It never controls order.**

```json
{
  "description": "Frontend roles",
  "template": "modern",
  "sections": {
    "projects":   { "exclude_items": ["queue-pilot"] },
    "experience": { "exclude_items": ["pixelforge-junior"] },
    "education":  { "include": false }
  },
  "theme": { "accent": "#0f7a6c" }
}
```

| key                                  | meaning                                                       |
| ------------------------------------ | ------------------------------------------------------------- |
| `template`                           | required; folder name under `templates/`                      |
| `sections.<id>.include`              | `false` drops the whole section. Default is `true`.           |
| `sections.<id>.exclude_items`        | entry ids to drop from that section                           |
| `theme`                              | optional; each key becomes a CSS custom property (`accent` → `--accent`) that overrides the template's default |
| `fonts`                              | optional; Google Fonts families to load, e.g. `["Lora:ital,wght@0,400;0,600;1,400"]`, used via `theme` (`"font-body": "'Lora', serif"`) |
| `description`                        | optional note, ignored by the renderer                        |

**House style.** `variants/main.json`'s `template`, `theme` and `fonts` are the default look for
every job's CV and cover letter: a job's `variant.json` inherits them unless it sets its own
(theme keys merge, the job's winning). Change the look once there, or ask `/job-pipeline:cv-style`.

Sections a variant doesn't mention are **included**, so `{ "template": "modern" }` alone means
"everything". A template can still leave out sections it doesn't place. To add a variant,
create a new JSON file. It appears in the preview toolbar and in `build:all` automatically.
Tailored wording belongs to a job: put it in `jobs/<id>/overlay.md` (see [Tailoring a CV by hand](#tailoring-a-cv-by-hand)).

## Templates

A template is a folder in `templates/` (folders starting with `_` are ignored):

```
templates/<name>/
  index.ejs      full HTML document (required)
  style.css      styles incl. @page print rules (required; inlined via `styles`)
  *.ejs          optional partials, used with include('section', {...})
```

### Template interface

`index.ejs` is rendered with these locals. Everything is **already filtered by the variant**:

```ts
{
  meta: {                        // cv.md frontmatter, verbatim
    name, title, email, phone, location,
    links?: { label, url }[],
    ...anyOtherKeys
  },
  sections: {                    // keyed by section id; excluded sections are absent
    [id: string]: {
      id: string,                // "experience"
      title: string,             // "Experience" (heading text without {#anchor})
      html: string,              // rendered intro markdown before the first ### ("" if none)
      entries: {                 // source order within the section; excluded entries removed
        id: string,              // "northwind-senior"
        title: string,           // "Senior Software Engineer"
        meta: Record<string,string>,  // { org, location, dates, link, tech, ... } — all optional
        html: string,            // rendered markdown body
      }[]
    }
  },
  others(...ids): Section[],     // sections NOT in `ids`, in source order. Use it to render
                                 // sections your layout doesn't explicitly place.
  styles: string,                // <style> with style.css + variant theme overrides. Put it in <head>.
  esc(str): string,              // HTML-escape helper for building strings in JS blocks
  variant: object,               // the raw variant config (+ name)
  template: string,              // this template's name
  cv: { meta, sections, order }  // same data; `order` = source order (avoid relying on it)
}
```

Use `<%= %>` for text (escaped) and `<%- %>` for the pre-rendered `html` fields and `styles`.

### Adding a template

1. Copy `templates/classic` to `templates/<name>`.
2. In `index.ejs`, choose which section ids go where and in what order, for example:
   ```ejs
   <% const order = ['summary', 'experience', 'skills'];
      const placed = [...order.map(id => sections[id]).filter(Boolean), ...others(...order)]; %>
   ```
   Always guard with `.filter(Boolean)` or `if (sections.x)`, because a variant may have removed the section.
3. Style it in `style.css`. Print guidelines the built-in templates follow:
   - `@page { size: A4; margin: … }` controls the PDF page (use `size: letter` for US).
   - `.entry { break-inside: avoid }` keeps entries whole, and `h2 { break-after: avoid }` keeps
     headings attached to their content.
   - Wrap content in `.page` and give it paper styling only under `@media screen`, so the
     preview looks like a sheet while print uses `@page` margins.
   - Expose colours and fonts as `:root` custom properties so variants can theme them.
4. Preview it at `/?variant=main&template=<name>`.

The server injects its toolbar and reload script before `</body>`, so templates need no
preview-specific code.

## Licence

MIT
