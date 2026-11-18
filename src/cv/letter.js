// Renders jobs/<id>/cover-letter.md with templates/_letter/ into a full HTML document.
//
// cover-letter.md: optional frontmatter, then the letter from the salutation to the sign-off
// ("Dear …" … "Best wishes,"). The template adds the header, date, recipient and your name.
//   ---
//   to: Hiring team          # recipient line (default "Hiring team")
//   company: Example Ltd     # default: the job's company from job.md
//   date: 18 November 2026   # default: today
//   heading: Supporting statement  # optional title above the letter (e.g. university applications)
//   max_pages: 2             # default 1; the build warns past this
//   ---
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ejs from 'ejs';
import { marked } from 'marked';
import { parse as parseYaml } from 'yaml';
import { parseCv } from './parse.js';
import { CV_FILE, jobDir, templateDir } from '../paths.js';
import { readJob } from '../jobs/job.js';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const LETTER_TEMPLATE = templateDir('_letter'); // '_' keeps it out of the CV template list

export const letterFile = (job) => path.join(jobDir(job), 'cover-letter.md');

/** Splits cover-letter.md into { meta, body } with HTML comments removed. */
export async function readLetter(job) {
  const source = await readFile(letterFile(job), 'utf8');
  const fm = source.match(FRONTMATTER);
  const meta = (fm && parseYaml(fm[1])) || {};
  const body = (fm ? source.slice(fm[0].length) : source).replace(/<!--[\s\S]*?-->/g, '').trim();
  return { meta, body };
}

/** Plain text for pasting into a form's cover letter box. */
export function letterText(body) {
  return body
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function renderLetter({ job }) {
  const [cvSource, letter, jobFile, css] = await Promise.all([
    readFile(CV_FILE, 'utf8'),
    readLetter(job),
    readJob(job).catch(() => ({ meta: {} })),
    readFile(path.join(LETTER_TEMPLATE, 'style.css'), 'utf8'),
  ]);
  const { meta } = parseCv(cvSource);
  const date =
    letter.meta.date ?? new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const html = await ejs.renderFile(path.join(LETTER_TEMPLATE, 'index.ejs'), {
    meta,
    letter: {
      to: letter.meta.to ?? 'Hiring team',
      company: letter.meta.company ?? jobFile.meta.company ?? '',
      date,
      heading: letter.meta.heading ?? '',
      html: marked.parse(letter.body),
    },
    esc: ejs.escapeXML,
    styles: `<style>\n${css}</style>`,
  });
  return { html, meta, letterMeta: letter.meta, text: letterText(letter.body) };
}
