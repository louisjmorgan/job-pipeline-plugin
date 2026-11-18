// Checks what would actually be sent against profile/facts.md.
//
// Usage:
//   jp lint                         -> generic variants + every job still in play
//   jp lint <job-id> [<job-id>]  -> those jobs only
//
// For a job it checks the rendered CV (cv.md + overlay.md, after the variant's filters, so only
// text that ends up in the PDF), cover-letter.md and answers.md. Exit code 1 on any error.
//
//   never_claim terms and rules (facts.md frontmatter)  -> error unless the rule says level: warn
//   a metric repeated in the CV                        -> warn (each one should land once)
//   a tracking token in job.md or a draft (see scrub.js) -> error
//
// In cover-letter.md / answers.md, a line ending in <!-- lint-ok: reason --> is skipped, for a
// deliberate gap statement such as "I haven't used Kubernetes in production".
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { renderCv } from '../cv/render.js';
import { listJobVariants, listVariants } from '../cv/variant.js';
import { FACTS_FILE, ROOT, jobDir } from '../paths.js';
import { readJob } from './job.js';
import { findTokens } from './scrub.js';

const INACTIVE = new Set(['rejected', 'closed']);

async function loadRules() {
  const source = await readFile(FACTS_FILE, 'utf8');
  const fm = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const config = (fm && parseYaml(fm[1])) || {};
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [
    ...(config.never_claim ?? []).map((term) => ({
      re: new RegExp(`(?<![\\w-])${escape(term)}(?![\\w-])`, 'i'),
      level: 'error',
      message: `"${term}" is on the never-claim list (no evidence for it).`,
    })),
    ...(config.rules ?? []).map((r) => ({
      re: new RegExp(r.pattern, r.case_sensitive ? '' : 'i'),
      level: r.level === 'warn' ? 'warn' : 'error',
      message: r.message,
    })),
  ];
}

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const htmlToText = (html) =>
  html
    .replace(/<\/(p|li|h\d)>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m])
    .trim();

/** The rendered CV as labelled chunks: [{ where, text }]. */
function cvChunks(cv) {
  const chunks = [{ where: 'cv › header', text: [cv.meta.title, cv.meta.name].filter(Boolean).join('\n') }];
  for (const id of cv.order) {
    const s = cv.sections[id];
    if (s.html) chunks.push({ where: `cv › ${id}`, text: htmlToText(s.html), section: id });
    for (const e of s.entries) {
      const text = [e.title, ...Object.values(e.meta), htmlToText(e.html)].join('\n');
      chunks.push({ where: `cv › ${id} › ${e.id}`, text, section: id });
    }
  }
  return chunks;
}

/** A markdown draft as one chunk per source line, comments removed, links reduced to their text. */
async function draftChunks(file) {
  const source = await readFile(file, 'utf8').catch(() => null);
  if (source == null) return [];
  const rel = path.relative(ROOT, file);
  const chunks = [];
  let inComment = false;
  source.split(/\r?\n/).forEach((raw, i) => {
    let line = raw;
    if (inComment) {
      const end = line.indexOf('-->');
      if (end === -1) return;
      line = line.slice(end + 3);
      inComment = false;
    }
    if (/<!--\s*lint-ok\b/.test(line)) return;
    line = line.replace(/<!--[\s\S]*?-->/g, '');
    const open = line.indexOf('<!--');
    if (open !== -1) {
      line = line.slice(0, open);
      inComment = true;
    }
    line = line.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1');
    if (line.trim()) chunks.push({ where: `${rel}:${i + 1}`, text: line });
  });
  return chunks;
}

// £125k, 40,000, 100%, 5+, ~1,580, 3–4 … but not bare small numbers like "3" or years like "2024".
const METRIC = /[£$€]\s?\d[\d,.]*\s?[km]?\b|~?\b\d{1,3}(?:,\d{3})+\b|\b\d+(?:\.\d+)?%|\b\d+\+/gi;

function repeatedMetrics(chunks) {
  const seen = new Map(); // metric -> [{ where, section }]
  for (const c of chunks) {
    for (const m of c.text.match(METRIC) ?? []) {
      const key = m.replace(/^~/, '').replace(/\s/g, '').toLowerCase();
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key).push(c);
    }
  }
  const out = [];
  for (const [metric, hits] of seen) {
    const body = hits.filter((h) => h.section !== 'summary');
    if (body.length > 1) {
      out.push({
        level: 'warn',
        where: body.map((h) => h.where).join(', '),
        message: `"${metric}" appears ${body.length}× outside the summary. Land each metric once.`,
      });
    }
  }
  return out;
}

async function lintTarget(target, rules) {
  const { cv } = await renderCv(target);
  const chunks = cvChunks(cv);
  if (target.job) {
    for (const f of ['cover-letter.md', 'answers.md']) chunks.push(...(await draftChunks(path.join(jobDir(target.job), f))));
  }
  const findings = [];
  for (const c of chunks) {
    for (const r of rules) {
      const m = c.text.match(r.re);
      if (m) findings.push({ level: r.level, where: c.where, message: r.message, excerpt: excerpt(c.text, m.index, m[0].length) });
    }
  }
  findings.push(...repeatedMetrics(chunks.filter((c) => c.where.startsWith('cv'))));
  if (target.job) {
    for (const f of ['job.md', 'overlay.md', 'cover-letter.md', 'answers.md', 'review.md', 'requirements.md']) {
      const file = path.join(jobDir(target.job), f);
      const text = await readFile(file, 'utf8').catch(() => '');
      for (const t of findTokens(text)) findings.push({ level: 'error', where: `${path.relative(ROOT, file)}:${t.line}`, message: t.message });
    }
  }
  return findings;
}

function excerpt(text, index, length) {
  const flat = text.replace(/\s+/g, ' ');
  const at = text.slice(0, index).replace(/\s+/g, ' ').length;
  const start = Math.max(0, at - 40);
  const end = Math.min(flat.length, at + length + 40);
  return `${start ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`;
}

// ---- main ----
const ids = process.argv.slice(2).filter((a) => !a.startsWith('-'));
let targets;
if (ids.length) {
  targets = ids.map((job) => ({ job }));
} else {
  const jobs = [];
  for (const job of await listJobVariants()) {
    const status = await readJob(job).then((j) => j.meta.status, () => undefined);
    if (!INACTIVE.has(status)) jobs.push({ job });
  }
  targets = [...(await listVariants()).map((variant) => ({ variant })), ...jobs];
}

const rules = await loadRules();
let errors = 0;
for (const target of targets) {
  const label = target.job ? `job ${target.job}` : `variant ${target.variant}`;
  let findings;
  try {
    findings = await lintTarget(target, rules);
  } catch (err) {
    console.error(`✗ ${label}: ${err.message}`);
    errors++;
    continue;
  }
  const errs = findings.filter((f) => f.level === 'error');
  errors += errs.length;
  console.log(`${errs.length ? '✗' : '✓'} ${label}${findings.length ? '' : ' — clean'}`);
  for (const f of findings) {
    console.log(`  ${f.level === 'error' ? '✗' : '⚠'} ${f.where}: ${f.message}`);
    if (f.excerpt) console.log(`      ${f.excerpt}`);
  }
}
process.exitCode = errors ? 1 : 0;
