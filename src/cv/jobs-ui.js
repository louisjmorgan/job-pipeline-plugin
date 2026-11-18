// Read-only review pages for jobs, served by the preview server:
//   /jobs                 -> jobs still in play (?all=1 includes rejected and closed)
//   /jobs/<id>?tab=…      -> one job: job | cv | letter | questions
// The CV and cover letter tabs embed the existing /?job= and /letter?job= pages. Editing happens
// in files (or by asking Claude Code); the page reloads when anything in jobs/ or profile/ changes.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { marked } from 'marked';
import { readAllJobs, readJob, sortJobs, daysUntil, DONE } from '../jobs/job.js';
import { jobDir } from '../paths.js';

const escape = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Listings are scraped from employers' sites, so drop anything active before rendering.
const md = (source) =>
  marked
    .parse(source)
    .replace(/<(script|style|iframe|object|embed)\b[\s\S]*?(<\/\1>|$)/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

const readOptional = (id, file) => readFile(path.join(jobDir(id), file), 'utf8').catch(() => null);

/** Splits markdown into its preamble and `## ` sections: [{ heading, text }]. */
function sections(source) {
  const parts = source.split(/^(?=## )/m);
  return parts.map((text) => ({ heading: text.match(/^## (.*)/)?.[1].trim() ?? '', text }));
}

function closesLabel(meta) {
  if (!meta.closes) return '';
  const closes = String(meta.closes);
  if (DONE.has(meta.status) || meta.status === 'applied') return escape(closes);
  const d = daysUntil(closes);
  const note = d < 0 ? 'passed' : d <= 7 ? `${d}d left` : '';
  return `${escape(closes)}${note ? ` <span class="urgent">${note}</span>` : ''}`;
}

const STYLE = `<style>
  :root { --bg: #fafaf8; --fg: #1d1d1f; --muted: #6b6b70; --line: #e2e2de; --card: #fff; --accent: #0f7a6c; --urgent: #b3261e; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #18181a; --fg: #e8e8e6; --muted: #9a9aa0; --line: #333336; --card: #222225; --accent: #4fc1ae; --urgent: #ff8a80; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.55 system-ui, sans-serif; }
  a { color: var(--accent); }
  main { max-width: 960px; margin: 0 auto; padding: 24px 16px 64px; }
  h1 { font-size: 1.4rem; margin: 0 0 4px; }
  h2 { font-size: 1.1rem; margin: 28px 0 8px; }
  h3 { font-size: 1rem; }
  .muted { color: var(--muted); }
  .urgent { color: var(--urgent); font-weight: 600; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); font-weight: 600; }
  tr.row:hover { background: var(--card); }
  .status { display: inline-block; padding: 1px 8px; border-radius: 99px; font-size: 12px; border: 1px solid var(--line); background: var(--card); }
  .status.drafted { border-color: var(--accent); color: var(--accent); }
  .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); margin: 20px 0 0; flex-wrap: wrap; }
  .tabs a { padding: 8px 14px; text-decoration: none; color: var(--muted); border: 1px solid transparent; border-bottom: none; border-radius: 6px 6px 0 0; }
  .tabs a.on { color: var(--fg); background: var(--card); border-color: var(--line); margin-bottom: -1px; }
  .panel { background: var(--card); border: 1px solid var(--line); border-top: none; padding: 8px 24px 24px; border-radius: 0 0 8px 8px; overflow-wrap: anywhere; }
  .panel.frame { padding: 0; }
  .panel.frame .bar { margin: 0; padding: 10px 16px; border-bottom: 1px solid var(--line); }
  .panel iframe { display: block; width: 100%; height: calc(100vh - 230px); min-height: 600px; border: 0; background: #fff; border-radius: 0 0 8px 8px; }
  .facts { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 16px 0; }
  .facts dt { color: var(--muted); }
  .facts dd { margin: 0; }
  .callout { border-left: 3px solid var(--accent); padding: 4px 16px; margin: 16px 0; background: var(--bg); }
  details { margin: 16px 0; }
  summary { cursor: pointer; font-weight: 600; }
  .bar { display: flex; gap: 16px; flex-wrap: wrap; margin: 12px 0; font-size: 14px; }
  ul.contains-task-list, li:has(> input[type=checkbox]) { list-style: none; }
  li > input[type=checkbox] { margin-left: -1.4em; }
</style>`;

const LIVE_RELOAD = `<script>
(() => {
  let connected = false;
  const es = new EventSource('/events');
  es.onopen = () => { if (connected) location.reload(); connected = true; };
  es.onmessage = () => location.reload();
})();
</script>`;

const page = (title, body) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>${STYLE}</head><body><main>${body}</main>${LIVE_RELOAD}</body></html>`;

export async function jobsListPage({ all = false } = {}) {
  let jobs = sortJobs(await readAllJobs());
  if (!all) jobs = jobs.filter((j) => !DONE.has(j.meta.status));
  const rows = jobs
    .map(
      ({ id, meta }) => `<tr class="row">
  <td><span class="status ${escape(meta.status)}">${escape(meta.status ?? '?')}</span></td>
  <td>${escape(meta.score ?? '')}</td>
  <td><a href="/jobs/${escape(id)}">${escape(meta.company)}</a><br><span class="muted">${escape(meta.title)}</span></td>
  <td>${escape(meta.salary ?? '')}</td>
  <td>${closesLabel(meta)}</td>
</tr>`,
    )
    .join('');
  return page(
    'Jobs',
    `<h1>Jobs</h1>
<p class="muted">${jobs.length} ${all ? 'jobs' : 'still in play'} · <a href="/jobs${all ? '' : '?all=1'}">${all ? 'hide' : 'show'} rejected and closed</a></p>
<table><thead><tr><th>Status</th><th>Score</th><th>Role</th><th>Salary</th><th>Closes</th></tr></thead><tbody>${rows}</tbody></table>`,
  );
}

const TABS = [
  ['job', 'Job'],
  ['cv', 'CV'],
  ['letter', 'Cover letter'],
  ['questions', 'Questions'],
];

export async function jobPage(id, tab = 'job') {
  const [job, review, answers, requirements, letter] = await Promise.all([
    readJob(id),
    readOptional(id, 'review.md'),
    readOptional(id, 'answers.md'),
    readOptional(id, 'requirements.md'),
    readOptional(id, 'cover-letter.md'),
  ]);
  const { meta } = job;
  const reviewParts = review ? sections(review) : [];
  const isQuestions = (s) => /^questions for you/i.test(s.heading);
  const questionsForYou = reviewParts.find(isQuestions);

  const tabs = TABS.filter(([key]) => key !== 'letter' || letter);
  if (!tabs.some(([key]) => key === tab)) tab = 'job';
  const count = questionsForYou ? (questionsForYou.text.match(/^\s*- \[ \]/gm) ?? []).length : 0;
  const tabLinks = tabs
    .map(
      ([key, label]) =>
        `<a href="?tab=${key}"${key === tab ? ' class="on"' : ''}>${label}${key === 'questions' && count ? ` (${count})` : ''}</a>`,
    )
    .join('');

  let panel;
  if (tab === 'cv') {
    panel = `<div class="bar"><a href="/pdf?job=${escape(id)}" target="_blank">Open PDF</a><a href="/?job=${escape(id)}" target="_blank">Open full page</a></div>
<iframe src="/?job=${escape(id)}&embed=1" title="CV"></iframe>`;
  } else if (tab === 'letter') {
    panel = `<div class="bar"><a href="/letter.pdf?job=${escape(id)}" target="_blank">Open PDF</a><a href="/letter?job=${escape(id)}" target="_blank">Open full page</a></div>
<iframe src="/letter?job=${escape(id)}" title="Cover letter"></iframe>`;
  } else if (tab === 'questions') {
    panel =
      (questionsForYou
        ? `<div class="callout">${md(questionsForYou.text.replace(/^## .*/, '## Questions for you (from review.md)'))}</div>`
        : '') +
      (answers ? md(answers) : '<p class="muted">No answers.md yet.</p>');
  } else {
    const fact = (label, value) => (value ? `<dt>${label}</dt><dd>${value}</dd>` : '');
    const link = (url, text) => (url ? `<a href="${escape(url)}" target="_blank" rel="noreferrer">${escape(text ?? url)}</a>` : '');
    panel = `<dl class="facts">
  ${fact('Status', escape(meta.status))}${fact('Score', escape(meta.score))}${fact('Location', escape(meta.location))}
  ${fact('Salary', escape(meta.salary))}${fact('Closes', closesLabel(meta))}${fact('Posted', escape(meta.posted))}
  ${fact('Found', escape(meta.found))}${fact('Applied', escape(meta.applied))}
  ${fact('Apply', link(meta.apply_url, meta.apply_via ? `via ${meta.apply_via}` : meta.apply_url))}
  ${fact('Listing', link(meta.url))}
</dl>
${reviewParts.filter((s) => !isQuestions(s) && s.heading).map((s) => md(s.text)).join('')}
${md(job.body)}
${requirements ? `<details><summary>Requirements (requirements.md)</summary>${md(requirements)}</details>` : ''}`;
  }

  return page(
    `${meta.company}: ${meta.title}`,
    `<p><a href="/jobs">← Jobs</a></p>
<h1>${escape(meta.company)}: ${escape(meta.title)}</h1>
<p class="muted"><span class="status ${escape(meta.status)}">${escape(meta.status)}</span> · ${escape(id)}</p>
<nav class="tabs">${tabLinks}</nav>
<div class="panel${tab === 'cv' || tab === 'letter' ? ' frame' : ''}">${panel}</div>`,
  );
}
