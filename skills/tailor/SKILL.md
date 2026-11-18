---
name: tailor
description: Tailor an application for one job in jobs/<id>/ — writes requirements.md (if missing), a fit score, variant.json + overlay.md (tailored CV), answers.md (written questions), cover-letter.md (only if the application takes one) and review.md, then builds and lints until clean and sets the job to drafted. Use when the user says "tailor", "draft the application", "write the CV/answers for <job>", or names a job id to prepare. Never submits anything.
---

# Tailor an application

**Tools.** `jp` in this skill means `node "${CLAUDE_PLUGIN_ROOT}/src/jp.js"`: run it with that full
path, from the workspace (the folder with `profile/`). If there's no `profile/` folder, stop and
suggest `/job-pipeline:setup`. CV format rules: `${CLAUDE_PLUGIN_ROOT}/CONTENT.md`.

Input: a job id (`jobs/<id>/job.md` must exist; create it with `jp add <url>`).
For sites without an adapter, create `job.md` by hand (copy an existing one's frontmatter), and
fetch any linked job description or person specification PDF into the job folder; the person
spec is usually what shortlisting is scored against.
Output: everything needed to apply, passing build + lint, with the job at status `drafted`.
The user reviews and sends. **Never submit, email or fill in a form.**

## Sources of truth (read all of these first)

1. `profile/facts.md`: settled facts and the never-claim list. **Overrides everything below.**
2. `profile/cv.md`: the master CV. Current wording, ids for variant/overlay.
3. `profile/stories.md`: situation → action → result stories for written answers.
4. `profile/evidence.md`: the detailed fact bank. It is older than cv.md; where they disagree, cv.md and facts.md win.
5. `profile/preferences.md`: how the user wants things written and framed. Follow it.
6. `jobs/<id>/job.md`: listing, application form, closing date.
7. Other jobs' `overlay.md`, `answers.md` and `cover-letter.md` for similar roles. Only jobs at
   status `approved` or `applied` count as reviewed examples: reuse their wording and structure,
   re-checking every fact against 1–4. Drafts at `drafted` are unreviewed; don't copy them.

**Every claim must trace to 1–4.** No new numbers, dates, technologies, titles or outcomes.
If an answer would be stronger with a fact you don't have, write the answer without it and add
the question to `review.md` → "Questions for you". Never guess personal details (notice period,
salary, right to work, commute, availability); those go to the user.

## Steps

### 1. Requirements: `jobs/<id>/requirements.md` (skip if it exists)

```markdown
# <Company>: <Title>

## How to apply
- Via: <Greenhouse / Applied / email …>. Closes: <date or "not stated">.
- Cover letter: requested / optional / not requested.
- Anonymised: yes/no. Word limits: <per question, or "not stated">.

## Criteria
| Requirement (from the listing) | Essential? | Evidence (cv/story id) | Match |
| --- | --- | --- | --- |
| … | essential / desirable | `story-id`, `cv-entry-id` | strong / partial / gap |

## Written questions
1. <question> → stories: `…`, `…`

## Gaps
- <requirement>: what's true instead (e.g. "no Java; TypeScript/Python, typed languages, learns fast"), or "none to offer".

## Do not claim
- <technologies or experience from the listing with no evidence>
```

Match criteria against **evidence, not keywords**. "Document-based storage (e.g. MongoDB)" is a
partial match with DynamoDB. It is not a match with "databases" in general.

### 2. Fit score in `job.md`

Replace "Not scored yet." under `## Fit` with: score /5, a one-line verdict, strengths and
gaps (3–5 bullets each), and anything the user must know before applying (location, salary, hybrid
days, sponsorship, a deadline within 7 days). Set `score:` in the frontmatter.
If the score is 2 or lower, stop after this step and tell the user why.

### 3. CV: `variant.json` + `overlay.md`

- `variant.json`: leave out `template`, `theme` and `fonts`, so the CV and letter take the
  user's house style from `variants/main.json` (see the cv-style skill). Set them only if this
  job needs a different look and say why in `description`. Exclude entries that don't serve this
  role. **The CV must fit two pages.**
  `description` says what the pitch is and what was dropped.
- `overlay.md` starts with an HTML comment: the role, what it asks for, the gaps, a "Do not
  claim" list, and pointers to `answers.md`. Then only what changes, by id (see
  `${CLAUDE_PLUGIN_ROOT}/README.md` → "Tailoring a CV by hand"): a `title:` in frontmatter, the `## Summary`, and reworded entries.
- The summary answers "why this person for this job" in 3–4 sentences, using the listing's own
  priorities in its order. Lead with the strongest *matching* evidence, not the most impressive.
- Rewrite bullets to foreground what this role values. Same facts, different emphasis and order.
- Each metric appears once in the body (plus at most once in the summary).
- Keep the skills section honest: reorder or trim it; never add a listing keyword without evidence.

### 4. Written answers: `answers.md`

For each written question on the form (or, with no form, each essential criterion):

```markdown
## 1. <question, verbatim>

*Limit: <n words / not stated>. Stories: `id`, `id`.*

<answer>
```

- Situation → action → result, ending on impact. Each answer stands alone (panels score them separately).
- Within the word limit. If no limit is stated, aim for 200–300 words.
- Values questions: name the company's value explicitly, use its own wording, and pick one story
  that genuinely shows it. Look the values up on the company's site if the listing doesn't give them.
- To state a gap honestly ("I haven't used Kotlin in production"), end the line with
  `<!-- lint-ok: honest gap -->`.
- End with a `## Form fields` table: every other field on the form, with an answer where the
  profile settles it and **"You fill in"** where it doesn't (right to work, notice, salary, commute…).

### 5. Cover letter: `cover-letter.md` (only if the form requests or allows one, or the user asks)

Frontmatter `to:` / `company:` (optional), then "Dear …," to "Best wishes,". The template adds
the header, date and name. One page, 250–350 words: why this company (specific, from the listing
or their site), two or three matching proofs, one honest line on the main gap if it's essential,
and a close. No restating the CV line by line.

**UK universities and the public sector** usually want a **supporting statement** scored against
the person specification instead: set `heading: "Supporting statement: <title> (<ref>)"` and
`max_pages: 2`, then one `###` section per criterion in the spec's order (essential, then
desirable where there's evidence), 700–900 words. State each gap plainly with the nearest real
evidence; panels score every criterion, so silence scores zero.

### 6. Build and lint until clean

```bash
jp build --job=<id>        # CV (+ letter); ATS check runs automatically
jp lint <id>
```

Fix every ✗. Fix ⚠ repeated metrics unless repeating is deliberate (say so in review.md).
The CV must be ≤ 2 pages (build warns) and the letter 1 page.

### 7. `review.md`

```markdown
# Review: <Company>, <Title>

Closes <date>. Score <n>/5. Apply at <apply_url>.

## The pitch
<2–3 sentences: the angle and why>

## What changed in the CV
- Emphasised: …
- Dropped: … (why)

## Gaps and how they're handled
- <gap>: <how the CV/answers handle it>

## Questions for you
- [ ] <facts that would strengthen it, things only the user knows>

## Before you send
- [ ] Read the CV PDF: jobs/<id>/out/<Name>-CV.pdf
- [ ] Read answers.md and fill the "You fill in" fields
- [ ] (letter) jobs/<id>/out/<Name>-Cover-Letter.pdf
- [ ] When you're happy, tell Claude "approved"; after you've sent it, "applied" (Claude runs `jp set <id> approved|applied`)
```

### 8. Finish

`jp set <id> drafted`, then publish the job's review page by following
`${CLAUDE_PLUGIN_ROOT}/skills/review/SKILL.md` (skip that if no Artifact tool is available, and
say so). Tell the user the score, the pitch, the gaps, the questions for them, and the closing
date, in a few lines, with the review page link.

## Style

UK English. Plain, specific, first person in answers and the letter. Concrete nouns and numbers
over adjectives ("cut builds from ~40 minutes to ~2", not "dramatically improved"). No buzzwords
("passionate", "leverage", "synergy"), and no claims of expertise the evidence doesn't show. Match the tone
of the existing overlays and answers in `jobs/`.
