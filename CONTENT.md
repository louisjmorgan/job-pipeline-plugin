# Writing `profile/cv.md`

`profile/cv.md` is the single source of truth for CV content. Every PDF is built from it (job overlays only swap wording in by id). Templates decide
**layout and order**; variants decide **what's included**. This file only holds content.

## 1. Frontmatter: identity and contact

YAML between `---` fences at the very top of the file:

```yaml
---
name: Jordan Avery
title: Senior Full-Stack Engineer   # headline under your name
email: jordan@example.com
phone: +44 7700 900123
location: London, UK
links:
  - label: github.com/jordanavery   # text shown
    url: https://github.com/jordanavery
---
```

Any extra keys you add are passed through to templates as `meta.<key>`.

## 2. Sections: `##`

Every `## Heading` starts a top-level section. Its **id** is the slugified heading:

| Heading                      | id                      |
| ---------------------------- | ----------------------- |
| `## Experience`              | `experience`            |
| `## Open Source & Talks`     | `open-source-talks`     |
| `## Work History {#experience}` | `experience` (explicit) |

- **Order in the file doesn't matter.** Templates pick sections by id and place them.
- Section ids must be unique.
- The built-in templates look for `summary`, `experience`, `projects`, `skills`, `education`.
  Any other section still renders, appended after the known ones (main column in `modern`; anything past page 1 continues full-width).
  Keep those ids (use `{#experience}` if you want a different heading).
- Text between the `##` heading and the first `###` is the section's intro (`section.html`).
  A section with no entries, like Summary, is just intro text.

## 3. Entries: `###`

Each `### Heading` inside a section is an **entry** (a job, project, skill group, degree…).

```markdown
### Senior Software Engineer {#northwind-senior}
org: Northwind Labs
location: London (hybrid)
dates: 2022 – Present
tech: TypeScript · React · Node.js

- Bullet points, paragraphs, links, *emphasis*: any markdown.
```

**Entry id**
- `{#some-id}` at the end of the heading sets it explicitly. **Recommended**, because the id then
  stays stable when you reword the title, and variants reference entries by id.
- Without it, the id is the slugified heading (`### Project: Acme` → `project-acme`).
- Ids must be **unique across the whole file**, not just within the section. The build fails on duplicates.
- Letters, digits, `-` and `_` only.

**Entry metadata (optional)**
- `key: value` lines **directly under** the heading (blank lines before them are fine).
- Keys are lowercase (`[a-z][a-z0-9_-]*`). Metadata ends at the first line that isn't a
  `key: value` line. After that everything is normal markdown.
- Conventional keys that the built-in templates understand:

  | key        | used for                                   |
  | ---------- | ------------------------------------------ |
  | `org`      | company / institution                      |
  | `location` | city, remote, etc.                         |
  | `dates`    | free text, e.g. `2019 – 2022`              |
  | `link`     | URL, shown as text (`https://` optional)   |
  | `tech`     | stack, separated by `·`, `,` or `\|`       |
  | `short`    | one-line body used in `modern`'s sidebar    |

  Other keys are allowed and available to templates as `entry.meta.<key>`, but the default
  templates don't display them.
- Because keys must be lowercase, a body line like `Note: …` is never mistaken for metadata.

Only one level of nesting matters: section → entry. `####` headings and bullets inside an
entry are plain content and have no ids.

## 4. Other rules

- `<!-- HTML comments -->` are stripped before parsing. Use them for notes, or to temporarily
  hide an entry for every variant.
- Anything before the first `##` (besides frontmatter) is ignored.
- `##`/`###` inside fenced code blocks are not treated as headings.
