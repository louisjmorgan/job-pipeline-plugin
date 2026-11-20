// A single, self-contained review page for one job, for publishing as a claude.ai Artifact (or
// opening locally). Tabs: Overview (pitch, questions for you, gaps, fit), CV and Cover letter
// (the real templates, embedded), Answers, Listing.
//
//   jp review <id>                -> writes jobs/<id>/out/review.html and prints the path
//   jp review <id> --out=<file>   -> writes there instead
//
// The output follows the Artifact page contract: no <html>/<head>/<body> (the publisher wraps it),
// a <title>, theme tokens for light and dark, Google Fonts only, everything else inline.
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { marked } from 'marked';
import { readJob, daysUntil, DONE } from '../jobs/job.js';
import { jobDir, CV_FILE } from '../paths.js';
import { renderCv } from './render.js';
import { renderLetter } from './letter.js';

const escape = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Listings are scraped from employers' sites: drop anything active, and HTML comments
// (overlay notes, lint-ok markers) that aren't for the reader.
const md = (source) =>
  marked
    .parse(String(source ?? '').replace(/<!--[\s\S]*?-->/g, ''))
    .replace(/<(script|style|iframe|object|embed|form)\b[\s\S]*?(<\/\1>|$)/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/<a href=/g, '<a target="_blank" rel="noreferrer" href=')
    .replace(/<input (checked="" )?disabled="" type="checkbox">/g, (m, c) => `<span class="box${c ? ' done' : ''}" aria-hidden="true"></span>`);

// Built files in jobs/<id>/out/ (CV and letter PDFs, the letter's paste-ready .txt), embedded so
// the page can hand them to the viewer: through the Artifact `downloads` capability on claude.ai,
// or as a plain data: link when the file is opened locally.
async function builtFiles(id) {
  const dir = path.join(jobDir(id), 'out');
  const names = (await readdir(dir).catch(() => [])).filter((n) => /\.(pdf|txt)$/i.test(n)).sort();
  return Promise.all(
    names.map(async (name) => {
      const file = path.join(dir, name);
      const [data, info] = await Promise.all([readFile(file), stat(file)]);
      return { name, type: /\.pdf$/i.test(name) ? 'application/pdf' : 'text/plain', data: data.toString('base64'), built: info.mtime, size: data.length };
    }),
  );
}

const DRAFTS = ['variant.json', 'overlay.md', 'cover-letter.md'];
/** The newest change to anything a build reads for this job (its drafts and the profile CV). */
async function newestDraft(id) {
  const files = [...DRAFTS.map((f) => path.join(jobDir(id), f)), CV_FILE];
  const times = await Promise.all(files.map((f) => stat(f).then((s) => s.mtime.getTime(), () => 0)));
  return Math.max(...times);
}

function downloadsBlock(id, files, newest) {
  if (!files.length)
    return `<div class="dl"><p class="note">No PDF built yet. Ask Claude to build it: “build the PDFs for <code>${escape(id)}</code> and republish the review page”.</p></div>`;
  const kb = (n) => `${Math.max(1, Math.round(n / 1024))} KB`;
  const stale = files.some((f) => /\.pdf$/i.test(f.name) && f.built.getTime() < newest - 1000);
  const links = files
    .map((f) => `<a class="btn" download="${escape(f.name)}" data-file="${escape(f.name)}" href="data:${f.type};base64,${f.data}">${/\.pdf$/i.test(f.name) ? 'Download' : 'Paste-ready text'} <b>${escape(f.name)}</b> <span>${kb(f.size)}</span></a>`)
    .join('');
  const built = new Date(Math.max(...files.map((f) => f.built.getTime()))).toISOString().slice(0, 16).replace('T', ' ');
  return `<div class="dl">${links}<p class="note">Built ${built} UTC.${stale ? ' <b class="stale">The drafts changed after this build: ask Claude to rebuild before you send it.</b>' : ''}</p></div>`;
}

const readOptional = (id, file) => readFile(path.join(jobDir(id), file), 'utf8').catch(() => null);

/** Splits markdown into `## ` sections: [{ heading, body }] (body without the heading line). */
function sections(source) {
  if (!source) return [];
  return source
    .split(/^(?=## )/m)
    .map((text) => ({ heading: text.match(/^## (.*)/)?.[1].trim() ?? '', body: text.replace(/^## .*\n?/, '') }));
}
const find = (parts, re) => parts.find((s) => re.test(s.heading));

/** Embeds a rendered HTML document. Its own <script>s are dropped; its Google Fonts link stays. */
const frame = (html, title) =>
  `<iframe class="doc" title="${escape(title)}" srcdoc="${escape(html.replace(/<script\b[\s\S]*?<\/script>/gi, ''))}"></iframe>`;

const STYLE = `
<style>
  /* Layout: one column of reading width; a sticky tab bar switches between the five views. */
  :root {
    --bg: #f6f7f6; --surface: #ffffff; --fg: #1a1d1c; --muted: #5f6764; --line: #dfe3e1;
    --accent: #0f7a6c; --accent-soft: #e3f1ee; --warn: #a3401a; --warn-soft: #fbece5;
    --sans: "Instrument Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    --mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #141716; --surface: #1c201f; --fg: #e6e9e7; --muted: #9aa39f; --line: #2f3533;
      --accent: #4fc1ae; --accent-soft: #1d3430; --warn: #f0a07c; --warn-soft: #3a241b; color-scheme: dark;
    }
  }
  :root[data-theme="dark"] {
    --bg: #141716; --surface: #1c201f; --fg: #e6e9e7; --muted: #9aa39f; --line: #2f3533;
    --accent: #4fc1ae; --accent-soft: #1d3430; --warn: #f0a07c; --warn-soft: #3a241b; color-scheme: dark;
  }
  * { box-sizing: border-box; }
  body { background: var(--bg); color: var(--fg); font: 15px/1.6 var(--sans); }
  body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--bg); }
  .wrap { max-width: 860px; margin: 0 auto; padding-block: 28px 64px;
    padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
  a { color: var(--accent); }
  a:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  h1 { font-size: 1.6rem; line-height: 1.25; margin: 4px 0 0; text-wrap: balance; font-weight: 650; }
  h2 { font-size: 1.05rem; margin: 28px 0 8px; text-wrap: balance; }
  h3 { font-size: 0.98rem; margin: 22px 0 6px; }
  .company { font-size: 0.8rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
  .meta { display: flex; flex-wrap: wrap; gap: 8px 18px; margin: 14px 0 0; padding: 0; list-style: none; font-size: 0.9rem; color: var(--muted); }
  .meta b { color: var(--fg); font-weight: 600; }
  .pill { display: inline-block; font: 600 0.72rem/1 var(--mono); letter-spacing: 0.04em; text-transform: uppercase;
    padding: 5px 8px; border-radius: 4px; background: var(--accent-soft); color: var(--accent); }
  .pill.urgent { background: var(--warn-soft); color: var(--warn); }
  .score { font: 600 0.9rem var(--mono); color: var(--fg); }
  .tabs { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 5; background: var(--bg); display: flex; gap: 2px;
    margin: 22px 0 0; border-bottom: 1px solid var(--line); overflow-x: auto; }
  .tabs a { padding: 10px 14px; text-decoration: none; color: var(--muted); font-weight: 600; font-size: 0.92rem;
    border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; }
  .tabs a[aria-current="page"] { color: var(--fg); border-bottom-color: var(--accent); }
  .count { font: 600 0.72rem var(--mono); background: var(--warn-soft); color: var(--warn); border-radius: 99px; padding: 1px 6px; margin-left: 4px; }
  .view { padding-top: 6px; min-width: 0; overflow-wrap: anywhere; }
  .view > :first-child { margin-top: 18px; }
  .ask { background: var(--warn-soft); border-radius: 8px; padding: 4px 18px 10px; margin: 20px 0; }
  .ask h2 { color: var(--warn); }
  ul { padding-left: 1.3em; }
  li { margin: 4px 0; }
  li:has(> .box) { list-style: none; margin-left: -1.3em; display: flex; gap: 10px; align-items: baseline; }
  .box { flex: none; width: 13px; height: 13px; border: 1.5px solid currentColor; border-radius: 3px; position: relative; top: 2px; opacity: 0.7; }
  .box.done { background: currentColor; }
  table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
  .table { overflow-x: auto; margin: 12px 0; }
  th, td { text-align: left; padding: 7px 9px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
  code { font: 0.86em var(--mono); background: var(--surface); border: 1px solid var(--line); border-radius: 4px; padding: 0 4px; }
  blockquote { margin: 12px 0; padding: 2px 16px; border-left: 3px solid var(--line); color: var(--muted); }
  details { margin: 22px 0; border-top: 1px solid var(--line); padding-top: 10px; }
  summary { cursor: pointer; font-weight: 600; }
  .paper { margin: 18px 0 0; background: #ffffff; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
  .doc { display: block; width: 100%; height: 1500px; border: 0; background: #ffffff; }
  .dl { display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0 0; }
  .dl .note { flex-basis: 100%; margin: 2px 0 0; }
  .btn { display: inline-flex; gap: 6px; align-items: baseline; padding: 8px 12px; border-radius: 6px; text-decoration: none;
    background: var(--accent); color: var(--bg); font-weight: 600; font-size: 0.9rem; }
  .btn b { font-weight: 500; overflow-wrap: anywhere; }
  .btn span { font: 500 0.75rem var(--mono); opacity: 0.8; }
  .btn[aria-busy="true"] { opacity: 0.6; }
  .stale { color: var(--warn); }
  .note { font-size: 0.85rem; color: var(--muted); margin-top: 10px; }
  footer { margin-top: 40px; padding-top: 14px; border-top: 1px solid var(--line); font-size: 0.85rem; color: var(--muted); }
  @media (max-width: 520px) { h1 { font-size: 1.35rem; } .doc { height: 1100px; } }
</style>`;

const SCRIPT = `
<script>
(() => {
  const views = [...document.querySelectorAll('.view')];
  const show = () => {
    const want = location.hash.slice(1);
    const id = views.some((v) => v.id === want) ? want : views[0].id;
    for (const v of views) v.hidden = v.id !== id;
    for (const a of document.querySelectorAll('.tabs a')) if (a.getAttribute('href') === '#' + id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  };
  addEventListener('hashchange', show);
  show();
  // Downloads: on claude.ai, hand the embedded file to the viewer through the downloads capability
  // (a plain data: link is blocked in the sandbox); opened locally, the link works by itself.
  const links = [...document.querySelectorAll('a[data-file]')];
  if (links.length && window.claude?.use) {
    window.claude.use('downloads').then((downloads) => {
      if (!downloads) return;
      for (const a of links) a.addEventListener('click', async (e) => {
        e.preventDefault();
        if (a.getAttribute('aria-busy') === 'true') return;
        a.setAttribute('aria-busy', 'true');
        try {
          const blob = await (await fetch(a.href)).blob();
          await downloads.save({ filename: a.dataset.file, data: blob });
        } catch (err) {
          if (err && err.code && !['declined', 'rate_limited'].includes(err.code)) a.title = 'Download unavailable here (' + err.code + ')';
        } finally { a.removeAttribute('aria-busy'); }
      });
    }, () => {});
  }
  // Size each embedded document to its content where the frame allows it.
  for (const f of document.querySelectorAll('iframe.doc')) {
    f.addEventListener('load', () => {
      try { const h = f.contentDocument.documentElement.scrollHeight; if (h > 200) f.style.height = h + 'px'; } catch {}
    });
  }
})();
</script>`;

export async function reviewPage(id) {
  const [job, review, answers, requirements, letterSource] = await Promise.all([
    readJob(id),
    readOptional(id, 'review.md'),
    readOptional(id, 'answers.md'),
    readOptional(id, 'requirements.md'),
    readOptional(id, 'cover-letter.md'),
  ]);
  const { meta, body } = job;
  const reviewParts = sections(review);
  const jobParts = sections(body);
  const questions = find(reviewParts, /^questions for you/i);
  const open = questions ? (questions.body.match(/^\s*- \[ \]/gm) ?? []).length : 0;

  const [files, newest] = await Promise.all([builtFiles(id), newestDraft(id)]);
  const downloads = downloadsBlock(id, files, newest);
  const cv = await renderCv({ job: id }).catch((err) => ({ error: err.message }));
  const letter = letterSource ? await renderLetter({ job: id }).catch((err) => ({ error: err.message })) : null;

  const closes = meta.closes ? String(meta.closes) : '';
  const left = closes && !DONE.has(meta.status) && meta.status !== 'applied' ? daysUntil(closes) : null;
  const closesText = closes ? `${closes}${left !== null ? (left < 0 ? ' (passed)' : ` (${left} day${left === 1 ? '' : 's'} left)`) : ''}` : '';

  const metaItems = [
    meta.score ? `<li>Fit <span class="score">${escape(meta.score)}/5</span></li>` : '',
    meta.salary ? `<li><b>${escape(meta.salary)}</b></li>` : '',
    meta.location ? `<li>${escape(meta.location)}</li>` : '',
    closesText ? `<li>Closes <b>${escape(closesText)}</b></li>` : '',
    meta.apply_url ? `<li><a href="${escape(meta.apply_url)}" target="_blank" rel="noreferrer">Apply${meta.apply_via ? ` via ${escape(meta.apply_via)}` : ''}</a></li>` : '',
    meta.url ? `<li><a href="${escape(meta.url)}" target="_blank" rel="noreferrer">Listing</a></li>` : '',
  ].join('');

  const overview = [
    downloads,
    questions ? `<section class="ask"><h2>Questions for you</h2>${md(questions.body)}</section>` : '',
    ...reviewParts.filter((s) => s.heading && s !== questions).map((s) => `<h2>${escape(s.heading)}</h2>${md(s.body)}`),
    find(jobParts, /^fit$/i) ? `<h2>Fit</h2>${md(find(jobParts, /^fit$/i).body)}` : '',
  ].join('\n') || '<p>No review.md yet: run /tailor on this job.</p>';

  const listing = find(jobParts, /^listing$/i);
  const listingView =
    (listing ? md(listing.body) : '<p>No listing saved.</p>') +
    jobParts.filter((s) => s.heading && !/^(fit|listing)$/i.test(s.heading)).map((s) => `<h2>${escape(s.heading)}</h2>${md(s.body)}`).join('') +
    (requirements ? `<details><summary>Requirements mapped to evidence</summary>${md(requirements)}</details>` : '');

  const views = [
    ['overview', 'Overview', overview, open],
    ['cv', 'CV', cv.error ? `<p>The CV didn't render: ${escape(cv.error)}</p>` : `${downloads}<div class="paper">${frame(cv.html, 'CV')}</div><p class="note">The tailored CV in its real template.</p>`],
    letter && ['letter', 'Cover letter', letter.error ? `<p>The letter didn't render: ${escape(letter.error)}</p>` : `<div class="paper">${frame(letter.html, 'Cover letter')}</div>`],
    answers && ['answers', 'Answers', md(answers)],
    ['listing', 'Listing', listingView],
  ].filter(Boolean);

  const tabs = views
    .map(([key, label, , count]) => `<a href="#${key}">${label}${count ? `<span class="count">${count}</span>` : ''}</a>`)
    .join('');
  const panels = views.map(([key, label, html]) => `<section class="view" id="${key}" aria-label="${label}">${html.replace(/<table>/g, '<div class="table"><table>').replace(/<\/table>/g, '</table></div>')}</section>`).join('\n');

  const fonts = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wdth,wght@75..100,400..700&family=JetBrains+Mono:wght@500;600&display=swap">';
  return `<title>${escape(meta.company)} ${escape(meta.title)}</title>
<meta name="claude:viewport-fit-sides" content="cover">
${fonts}${STYLE}
<div class="wrap">
  <header>
    <div class="company">${escape(meta.company)}</div>
    <h1>${escape(meta.title)}</h1>
    <ul class="meta"><li><span class="pill${left !== null && left <= 7 ? ' urgent' : ''}">${escape(meta.status ?? 'new')}</span></li>${metaItems}</ul>
  </header>
  <nav class="tabs" aria-label="Sections">${tabs}</nav>
  ${panels}
  <footer>To change anything, say what you want in a Claude chat on this workspace, for example
  “in answer 2, lead with the outcome”. Claude edits the drafts, checks them against your facts and republishes this page.
  Job <code>${escape(id)}</code> · page generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC.</footer>
</div>
${SCRIPT}`;
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: 'string' } } });
  const id = positionals[0];
  if (!id) {
    console.error('Usage: jp review <job-id> [--out=<file>]');
    process.exit(2);
  }
  const out = path.resolve(values.out ?? path.join(jobDir(id), 'out', 'review.html'));
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, await reviewPage(id));
  console.log(out);
}
