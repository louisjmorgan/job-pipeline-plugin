// The jobs board: one self-contained page listing every job with its status, score, pay, place,
// closing date, open questions and a link to its review page. Published as a claude.ai Artifact
// by the review skill ("Board"); its URL is kept in the workspace's board.json.
//
//   jp board                 -> writes out/board.html in the workspace and prints the path
//   jp board --out=<file>    -> writes there instead
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { readAllJobs, sortJobs, daysUntil, DONE } from '../jobs/job.js';
import { CV_FILE, ROOT, jobDir } from '../paths.js';
import { parseCv } from './parse.js';

const escape = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const NEEDS_YOU = new Set(['drafted', 'approved']);
const LABEL = {
  new: 'New', shortlisted: 'Shortlisted', analysed: 'Analysed', drafted: 'To review', approved: 'Ready to send',
  applied: 'Applied', interview: 'Interview', rejected: 'Rejected', closed: 'Closed',
};

async function openQuestions(id) {
  const review = await readFile(path.join(jobDir(id), 'review.md'), 'utf8').catch(() => '');
  const section = review.split(/^(?=## )/m).find((s) => /^## questions for you/i.test(s)) ?? '';
  return (section.match(/^\s*- \[ \]/gm) ?? []).length;
}

const STYLE = `
<style>
  /* Layout: a summary strip, filter buttons, then one row per job (a table on wide screens, cards on phones). */
  :root {
    --bg: #f6f7f6; --surface: #ffffff; --fg: #1a1d1c; --muted: #5f6764; --line: #dfe3e1;
    --accent: #0f7a6c; --accent-soft: #e3f1ee; --warn: #a3401a; --warn-soft: #fbece5; --done: #8a918e;
    --sans: "Instrument Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    --mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #141716; --surface: #1c201f; --fg: #e6e9e7; --muted: #9aa39f; --line: #2f3533;
      --accent: #4fc1ae; --accent-soft: #1d3430; --warn: #f0a07c; --warn-soft: #3a241b; --done: #6d7572; color-scheme: dark;
    }
  }
  :root[data-theme="dark"] {
    --bg: #141716; --surface: #1c201f; --fg: #e6e9e7; --muted: #9aa39f; --line: #2f3533;
    --accent: #4fc1ae; --accent-soft: #1d3430; --warn: #f0a07c; --warn-soft: #3a241b; --done: #6d7572; color-scheme: dark;
  }
  * { box-sizing: border-box; }
  body { background: var(--bg); color: var(--fg); font: 15px/1.5 var(--sans); }
  .wrap { max-width: 1080px; margin: 0 auto; padding-block: 28px 56px;
    padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
  a { color: var(--accent); }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  h1 { font-size: 1.55rem; margin: 0; font-weight: 650; text-wrap: balance; }
  .sub { color: var(--muted); font-size: 0.9rem; margin: 4px 0 0; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin: 22px 0 18px; }
  .stat { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 10px 14px; }
  .stat b { display: block; font: 600 1.5rem/1.2 var(--mono); font-variant-numeric: tabular-nums; }
  .stat span { font-size: 0.8rem; color: var(--muted); }
  .stat.hot b { color: var(--warn); }
  .filters { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 12px; }
  .filters button { font: 600 0.85rem var(--sans); color: var(--muted); background: transparent; border: 1px solid var(--line);
    border-radius: 99px; padding: 6px 12px; cursor: pointer; }
  .filters button[aria-pressed="true"] { color: var(--fg); border-color: var(--accent); background: var(--accent-soft); }
  .list { overflow-x: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
  tr:last-child td { border-bottom: 0; }
  th { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); font-weight: 600; white-space: nowrap; }
  td.num { font: 600 0.9rem var(--mono); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .role a { font-weight: 600; text-decoration: none; }
  .role a:hover { text-decoration: underline; }
  .role .co { display: block; font-size: 0.8rem; color: var(--muted); margin-bottom: 1px; }
  .pill { display: inline-block; font: 600 0.7rem/1 var(--mono); letter-spacing: 0.04em; text-transform: uppercase;
    padding: 5px 7px; border-radius: 4px; background: var(--line); color: var(--fg); white-space: nowrap; }
  .pill.drafted, .pill.approved { background: var(--accent-soft); color: var(--accent); }
  .pill.applied, .pill.interview { background: var(--fg); color: var(--bg); }
  .pill.closed, .pill.rejected { background: transparent; color: var(--done); border: 1px solid var(--line); }
  .left { display: block; font-size: 0.78rem; color: var(--muted); }
  .left.soon { color: var(--warn); font-weight: 600; }
  .q { font: 600 0.75rem var(--mono); background: var(--warn-soft); color: var(--warn); border-radius: 99px; padding: 2px 7px; white-space: nowrap; }
  .muted { color: var(--muted); }
  tr.done td { color: var(--done); }
  .empty { padding: 24px; color: var(--muted); }
  footer { margin-top: 28px; font-size: 0.85rem; color: var(--muted); }
  @media (max-width: 640px) {
    table, tbody, tr, td { display: block; }
    thead { display: none; }
    tr { padding: 12px 14px; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; }
    td { border: 0; padding: 0; }
    td.role { grid-column: 1 / -1; }
    td[data-k]::before { content: attr(data-k) " "; color: var(--muted); font: 500 0.75rem var(--sans); }
  }
</style>`;

const SCRIPT = `
<script>
(() => {
  const rows = [...document.querySelectorAll('tbody tr')];
  const buttons = [...document.querySelectorAll('.filters button')];
  const empty = document.querySelector('.empty');
  const apply = (f) => {
    let shown = 0;
    for (const r of rows) { const on = r.dataset.groups.split(' ').includes(f); r.hidden = !on; if (on) shown++; }
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.f === f));
    empty.hidden = shown > 0;
    try { localStorage.setItem('board-filter', f); } catch {}
  };
  for (const b of buttons) b.addEventListener('click', () => apply(b.dataset.f));
  let start = 'active';
  try { start = localStorage.getItem('board-filter') || start; } catch {}
  apply(buttons.some((b) => b.dataset.f === start) ? start : 'active');
})();
</script>`;

export async function boardPage() {
  const jobs = sortJobs(await readAllJobs());
  const name = await readFile(CV_FILE, 'utf8').then((s) => parseCv(s).meta?.name).catch(() => null);
  const state = await readFile(path.join(ROOT, 'leads', 'state.json'), 'utf8').then(JSON.parse).catch(() => ({}));
  const questions = Object.fromEntries(await Promise.all(jobs.map(async (j) => [j.id, await openQuestions(j.id)])));

  const live = (j) => !DONE.has(j.meta.status);
  const left = (j) => (j.meta.closes && live(j) && !['applied', 'interview'].includes(j.meta.status) ? daysUntil(String(j.meta.closes)) : null);
  const count = (pred) => jobs.filter(pred).length;
  const soon = count((j) => NEEDS_YOU.has(j.meta.status) && left(j) !== null && left(j) >= 0 && left(j) <= 7);

  const rows = jobs
    .map((j) => {
      const { id, meta } = j;
      const status = meta.status ?? 'new';
      const groups = ['all'];
      if (live(j)) groups.push('active');
      if (NEEDS_YOU.has(status)) groups.push('you');
      if (['applied', 'interview'].includes(status)) groups.push('sent');
      if (['new', 'shortlisted', 'analysed'].includes(status)) groups.push('pipeline');
      const d = left(j);
      const leftText = d === null ? '' : d < 0 ? 'passed' : d === 0 ? 'today' : `${d} day${d === 1 ? '' : 's'} left`;
      const title = meta.review_url
        ? `<a href="${escape(meta.review_url)}" target="_blank" rel="noreferrer">${escape(meta.title)}</a>`
        : `<span>${escape(meta.title)}</span>`;
      const q = questions[id];
      return `<tr data-groups="${groups.join(' ')}"${live(j) ? '' : ' class="done"'}>
  <td class="role"><span class="co">${escape(meta.company)}</span>${title}</td>
  <td data-k="Status"><span class="pill ${escape(status)}">${escape(LABEL[status] ?? status)}</span></td>
  <td class="num" data-k="Fit">${meta.score ? `${escape(meta.score)}/5` : '<span class="muted">–</span>'}</td>
  <td data-k="Pay">${escape(meta.salary ?? '') || '<span class="muted">not stated</span>'}</td>
  <td data-k="Where">${escape(meta.location ?? '')}</td>
  <td data-k="Closes">${meta.closes ? `${escape(meta.closes)}${leftText ? `<span class="left${d !== null && d <= 7 ? ' soon' : ''}">${leftText}</span>` : ''}` : '<span class="muted">not stated</span>'}</td>
  <td data-k="Questions">${q && NEEDS_YOU.has(status) ? `<span class="q">${q} for you</span>` : ''}</td>
</tr>`;
    })
    .join('\n');

  const stat = (n, label, hot) => `<div class="stat${hot && n ? ' hot' : ''}"><b>${n}</b><span>${label}</span></div>`;
  const filter = (f, label) => `<button type="button" data-f="${f}" aria-pressed="false">${label}</button>`;
  const owner = name ? `${String(name).split(/\s+/)[0]}'s` : 'My';

  return `<title>${escape(owner)} Job Board</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wdth,wght@75..100,400..700&family=JetBrains+Mono:wght@500;600&display=swap">
${STYLE}
<div class="wrap">
  <header>
    <h1>${escape(owner)} job board</h1>
    <p class="sub">Last search ${escape(state.last_run ?? 'not run yet')} · page updated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC</p>
  </header>
  <section class="stats" aria-label="Summary">
    ${stat(count((j) => j.meta.status === 'drafted'), 'drafts to review')}
    ${stat(soon, 'to review, closing within 7 days', true)}
    ${stat(count((j) => j.meta.status === 'approved'), 'ready to send')}
    ${stat(count((j) => ['applied', 'interview'].includes(j.meta.status)), 'applied')}
    ${stat(count((j) => ['new', 'shortlisted', 'analysed'].includes(j.meta.status)), 'shortlisted, not drafted yet')}
  </section>
  <nav class="filters" aria-label="Show">
    ${filter('active', 'Active')}${filter('you', 'Needs you')}${filter('pipeline', 'Not drafted yet')}${filter('sent', 'Applied')}${filter('all', 'All, incl. closed')}
  </nav>
  <div class="list">
    <table>
      <thead><tr><th>Role</th><th>Status</th><th>Fit</th><th>Pay</th><th>Where</th><th>Closes</th><th>Open questions</th></tr></thead>
      <tbody>
${rows}
      </tbody>
    </table>
    <p class="empty" hidden>No jobs here.</p>
  </div>
  <footer>Open a role to read its review page. To change a draft, approve it or mark it applied, tell Claude in a chat on
  your job-search workspace. This page is refreshed after each search and whenever a review page is published.</footer>
</div>
${SCRIPT}`;
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const { values } = parseArgs({ options: { out: { type: 'string' } } });
  const out = path.resolve(values.out ?? path.join(ROOT, 'output', 'board.html'));
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, await boardPage());
  console.log(out);
}
