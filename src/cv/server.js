// Live preview server.
//   http://localhost:3000/?variant=main                   -> HTML preview (variant's own template)
//   http://localhost:3000/?job=acme-platform-engineer      -> a job's tailored CV (variant.json + overlay.md)
//   http://localhost:3000/?variant=main&template=classic  -> override template
//   http://localhost:3000/pdf?job=...                     -> exact PDF, rendered by Playwright
//   http://localhost:3000/letter?job=...                  -> the job's cover letter (/letter.pdf?job=… for the PDF)
//   http://localhost:3000/jobs                            -> jobs board; /jobs/<id> reviews one job (CV, letter, questions)
// Reloads the browser automatically when profile/, jobs/, templates/ or variants/ change.
import http from 'node:http';
import { existsSync, watch } from 'node:fs';
import path from 'node:path';
import { renderCv, listTemplates } from './render.js';
import { renderLetter } from './letter.js';
import { jobPage, jobsListPage } from './jobs-ui.js';
import { listJobVariants, listVariants } from './variant.js';
import { htmlToPdf, launchBrowser } from './pdf.js';
import { ENGINE_TEMPLATES_DIR, ROOT, cvFileName } from '../paths.js';

const PORT = Number(process.env.PORT) || 3000;
const clients = new Set();
let browserPromise;

const escape = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const LIVE_RELOAD = `<script>
(() => {
  let connected = false;
  const es = new EventSource('/events');
  es.onopen = () => { if (connected) location.reload(); connected = true; }; // server restarted
  es.onmessage = () => location.reload();
})();
</script>`;

// Targets are encoded as "variant:<name>" or "job:<id>" in the toolbar's select.
const targetParams = (kind, name) => ({ [kind === 'job' ? 'job' : 'variant']: name });

async function toolbar({ kind, name, template, templateOverride, warnings }) {
  const [variants, jobs, templates] = await Promise.all([listVariants(), listJobVariants(), listTemplates()]);
  const opt = (value, selected, label = value) =>
    `<option value="${escape(value)}"${value === selected ? ' selected' : ''}>${escape(label)}</option>`;
  const current = `${kind}:${name}`;
  const group = (label, k, names) =>
    names.length ? `<optgroup label="${label}">${names.map((n) => opt(`${k}:${n}`, current, n)).join('')}</optgroup>` : '';
  const pdfHref = `/pdf?${new URLSearchParams({ ...targetParams(kind, name), ...(templateOverride && { template: templateOverride }) })}`;
  return `
<style>
  #cvf-bar { position: fixed; right: 12px; bottom: 12px; z-index: 9999; display: flex; gap: 8px; align-items: center;
    flex-wrap: wrap; max-width: calc(100vw - 24px); padding: 8px 10px; border-radius: 8px; background: #1d1d1f; color: #eee;
    font: 12px/1.3 system-ui, sans-serif; box-shadow: 0 4px 16px rgb(0 0 0 / .25); }
  #cvf-bar select, #cvf-bar a { font: inherit; color: inherit; background: #333; border: 1px solid #555; border-radius: 4px; padding: 3px 6px; text-decoration: none; }
  #cvf-bar .warn { flex-basis: 100%; color: #ffcc66; margin: 0; padding-left: 16px; }
  @media print { #cvf-bar { display: none !important; } }
</style>
<div id="cvf-bar">
  <label>cv <select id="cvf-target">${group('variants', 'variant', variants)}${group('jobs', 'job', jobs)}</select></label>
  <label>template <select id="cvf-template">${opt('', templateOverride ?? '', `(variant: ${template})`)}${templates
    .map((t) => opt(t, templateOverride))
    .join('')}</select></label>
  <a href="${escape(pdfHref)}" target="_blank">Open PDF</a>
  ${warnings.length ? `<ul class="warn">${warnings.map((w) => `<li>${escape(w)}</li>`).join('')}</ul>` : ''}
</div>
<script>
  for (const id of ['cvf-target', 'cvf-template']) document.getElementById(id).onchange = () => {
    const [kind, name] = document.getElementById('cvf-target').value.split(/:(.*)/);
    const p = new URLSearchParams({ [kind]: name });
    const t = document.getElementById('cvf-template').value;
    if (t) p.set('template', t);
    location.search = p;
  };
</script>`;
}

function errorPage(err) {
  return `<!doctype html><meta charset="utf-8"><title>CV preview error</title>
<body style="font: 14px/1.5 system-ui, sans-serif; padding: 2rem; color: #900">
<h1 style="font-size: 1.2rem">Render failed</h1><pre style="white-space: pre-wrap">${escape(err.stack || err)}</pre>
<p style="color:#555">Fix the file and this page will reload.</p>${LIVE_RELOAD}</body>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const opts = {
    variant: url.searchParams.get('variant') || 'main',
    job: url.searchParams.get('job') || undefined,
    template: url.searchParams.get('template') || undefined,
  };

  try {
    if (url.pathname === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(': connected\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (url.pathname === '/jobs' || url.pathname.startsWith('/jobs/')) {
      const id = decodeURIComponent(url.pathname.slice('/jobs/'.length)).replace(/\/$/, '');
      const html = id
        ? await jobPage(id, url.searchParams.get('tab') || undefined)
        : await jobsListPage({ all: url.searchParams.has('all') });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(html);
    }

    if (url.pathname === '/letter' || url.pathname === '/letter.pdf') {
      if (!opts.job) throw new Error('/letter needs ?job=<id>');
      const { html } = await renderLetter({ job: opts.job });
      if (url.pathname === '/letter') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(html.replace('</body>', `${LIVE_RELOAD}</body>`));
      }
      browserPromise ??= launchBrowser();
      res.writeHead(200, { 'Content-Type': 'application/pdf' });
      return res.end(await htmlToPdf(await browserPromise, html));
    }

    if (url.pathname === '/pdf') {
      const { html, template, kind, name, cv } = await renderCv(opts);
      browserPromise ??= launchBrowser();
      const pdf = await htmlToPdf(await browserPromise, html);
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${kind === 'job' ? cvFileName(cv.meta) : `${template}-${name}.pdf`}"`,
      });
      return res.end(pdf);
    }

    if (url.pathname === '/') {
      const result = await renderCv(opts);
      const embedded = url.searchParams.has('embed'); // inside the /jobs/<id> CV tab: no toolbar
      const inject = (embedded ? '' : await toolbar({ ...result, templateOverride: opts.template })) + LIVE_RELOAD;
      const html = result.html.includes('</body>')
        ? result.html.replace('</body>', `${inject}</body>`)
        : result.html + inject;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(html);
    }

    res.writeHead(404).end('Not found');
  } catch (err) {
    console.error(err.message);
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' }).end(errorPage(err));
  }
});

let reloadTimer;
const watched = [...['profile', 'jobs', 'templates', 'variants'].map((d) => path.join(ROOT, d)), ENGINE_TEMPLATES_DIR];
for (const dir of watched.filter((d) => existsSync(d))) {
  watch(dir, { recursive: true }, () => {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => clients.forEach((c) => c.write('data: reload\n\n')), 100);
  });
}

server.listen(PORT, () => console.log(`CV preview: http://localhost:${PORT}/?variant=main · jobs: http://localhost:${PORT}/jobs`));

const shutdown = async () => {
  if (browserPromise) await (await browserPromise).close().catch(() => {});
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
