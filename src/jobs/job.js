// Reads and writes jobs/<id>/job.md: YAML frontmatter (the job's state) + markdown body (fit notes, listing).
// The frontmatter is the single source of truth for a job's status; nothing else tracks it.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { JOBS_DIR, jobDir } from '../paths.js';
import { scrubText } from './scrub.js';

/** Lifecycle, in order. A job moves forward; `rejected` and `closed` can happen at any point. */
export const STATUSES = [
  'new', //         found by search, not yet scored
  'shortlisted', // scored at or above the threshold in criteria.yaml
  'analysed', //    requirements.md written
  'drafted', //     CV, cover letter and answers drafted and passing build + lint
  'approved', //    reviewed by you, ready to send
  'applied', //     sent
  'interview',
  'rejected', //    not pursuing (by you or by them)
  'closed', //      deadline passed or role withdrawn
];

/** Statuses that are finished with: hidden from the board unless asked for. */
export const DONE = new Set(['rejected', 'closed']);

/** By status (lifecycle order), then closing date (soonest first, none last). */
export const sortJobs = (jobs) =>
  [...jobs].sort(
    (a, b) =>
      STATUSES.indexOf(a.meta.status) - STATUSES.indexOf(b.meta.status) ||
      String(a.meta.closes || '9999').localeCompare(String(b.meta.closes || '9999')),
  );

/** Frontmatter keys, in the order they're written. Unknown keys are kept, after these. */
export const FIELDS = [
  'id', 'company', 'title', 'location', 'salary', 'url', 'apply_url', 'apply_via',
  'source', 'found', 'posted', 'closes', 'status', 'score', 'applied', 'updated', 'review_url',
];

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export const today = () => new Date().toISOString().slice(0, 10);
export const daysUntil = (date) => Math.round((Date.parse(date) - Date.parse(today())) / 86_400_000);

export async function listJobIds() {
  const entries = await readdir(JOBS_DIR, { withFileTypes: true }).catch(() => []);
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

/** @returns {Promise<{ id, meta: object, body: string, file: string }>} */
export async function readJob(id) {
  const file = path.join(jobDir(id), 'job.md');
  const source = await readFile(file, 'utf8').catch(() => {
    throw new Error(`No job.md for "${id}" (expected ${path.relative(process.cwd(), file)})`);
  });
  const fm = source.match(FRONTMATTER);
  if (!fm) throw new Error(`${path.relative(process.cwd(), file)} has no YAML frontmatter`);
  const meta = parseYaml(fm[1]) ?? {};
  if (meta.id && meta.id !== id) throw new Error(`job.md id "${meta.id}" doesn't match its folder "${id}"`);
  if (meta.status && !STATUSES.includes(meta.status)) {
    throw new Error(`job "${id}" has unknown status "${meta.status}" (expected one of: ${STATUSES.join(', ')})`);
  }
  return { id, meta: { ...meta, id }, body: source.slice(fm[0].length), file };
}

export async function readAllJobs() {
  const ids = await listJobIds();
  return Promise.all(ids.map(readJob));
}

export async function writeJob({ id, meta, body = '' }) {
  const ordered = {};
  for (const key of FIELDS) if (key in meta) ordered[key] = meta[key];
  for (const [key, value] of Object.entries(meta)) if (!(key in ordered)) ordered[key] = value;
  ordered.id = id;
  const yaml = stringifyYaml(ordered, { lineWidth: 0, nullStr: '' }).trimEnd();
  await writeFile(path.join(jobDir(id), 'job.md'), scrubText(`---\n${yaml}\n---\n${body.startsWith('\n') ? '' : '\n'}${body}`));
}

/** Sets a job's status (and `applied` date when it is sent). */
export async function setStatus(id, status) {
  if (!STATUSES.includes(status)) throw new Error(`Unknown status "${status}" (expected one of: ${STATUSES.join(', ')})`);
  const job = await readJob(id);
  job.meta.status = status;
  job.meta.updated = today();
  if (status === 'applied' && !job.meta.applied) job.meta.applied = today();
  await writeJob(job);
  return job;
}
