---
name: cv-style
description: Change how the CV and cover letter look — pick a different layout template, change colours, fonts and text size, or create a custom template (from scratch or modelled on a CV the user likes) — for every job at once (the house style) or for one job. Use when the user says "change the CV layout", "different template", "make it look like this", "change the font/colour", "two columns", or "/cv-style".
---

# CV style

**Tools.** `jp` in this skill means `node "${CLAUDE_PLUGIN_ROOT}/src/jp.js"`, run from the
workspace. Template rules: `${CLAUDE_PLUGIN_ROOT}/README.md` → "Templates" and "Template
interface"; the built-in templates are in `${CLAUDE_PLUGIN_ROOT}/templates/`.

How the look is decided:
- **House style** = `variants/main.json`: `template`, `theme` and `fonts`. Every job's CV and
  cover letter inherit it unless the job's own `jobs/<id>/variant.json` sets them.
- `template`: a layout folder. Built in: `modern-single-column` (single column, safest for ATS),
  `modern` (sidebar), `classic` (serif, traditional). A workspace `templates/<name>/` with
  `index.ejs` + `style.css` adds a new one or overrides a built-in of the same name.
- `theme`: CSS variables the template exposes, e.g. `accent`, `ink`, `muted`, `rule`, `paper`,
  `base-size` (text size, e.g. `9.6pt`), `font-body`. Read the template's `style.css` `:root` for
  the full list.
- `fonts`: Google Fonts families to load, e.g. `["Lora:ital,wght@0,400;0,600;1,400"]`; use them
  through `theme` (`"font-body": "'Lora', Georgia, serif"`).

## Steps

1. **Ask what they want**, in their words: a different layout, a colour, a font, more or less
   dense, or "like this one" (a PDF or image they share). Ask whether it's for every job (house
   style, the default) or one job.
2. **Show the options before changing anything** when they're choosing a layout: build the CV in
   each template, e.g. `jp build --variant=main --template=modern`, and give them the PDF paths
   (or describe the differences). `jp preview` gives a live page with a template switcher.
3. **Make the change**:
   - Layout, colours, fonts, size → edit `variants/main.json` (or the job's `variant.json`).
     Keep text dark enough to read: body text contrast at least 4.5:1 on the paper colour.
   - A custom design → copy the closest built-in template into the workspace's
     `templates/<new-name>/` and edit `style.css` (and `index.ejs` only if the structure must
     change), then set `"template": "<new-name>"`. For "like this CV": match its column
     structure, section order, type scale, spacing and accent use, not its exact fonts unless
     they're on Google Fonts.
4. **Check it**: `jp build --variant=main` (and one recent job: `jp build --job=<id>`). The build
   runs the ATS check: fix any warning it gives (multi-column text flow, text in images, unusual
   reading order) or tell the user plainly what the trade-off is. The CV must stay at two pages
   or fewer; if it grows, reduce `base-size` slightly or tighten spacing before cutting content.
5. **Show the result** (PDF paths; republish open review pages with the review skill if the job
   has a `review_url`) and commit: `git add variants templates jobs && git commit -m "CV style: …"`.
6. If the change is a preference worth keeping ("always single column", "no colour"), note it in
   `profile/preferences.md` → Writing, so tailoring doesn't undo it.
