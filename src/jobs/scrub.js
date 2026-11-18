// Strips tracking tokens from text before it's saved, so the repo never holds them.
// Adzuna links carry a signed JWT (?aztt=) and our API app ID (?utm_source=); secret scanners
// such as GitGuardian flag both. Applied by every writer in src/jobs, checked by lint:claims, and
// `jp scrub` cleans files written by hand (e.g. a listing pasted into job.md).
//
//   jp scrub   -> rewrites jobs/**/*.md and leads/** in place, prints what changed
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from '../paths.js';

const URL_RE = /https?:\/\/[^\s)"'<>\]]+/g;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const TRACKING_PARAM = /^(utm_\w+|gclid|fbclid|mc_eid)$/i;
// Hosts whose query strings are all tracking: the job id is in the path.
const QUERY_IS_TRACKING = /(^|\.)adzuna\.[a-z.]+$/i;

/** One URL with tracking parameters removed. Anything that isn't a URL comes back unchanged. */
export function scrubUrl(url) {
  if (typeof url !== 'string') return url;
  const q = url.indexOf('?');
  if (q === -1) return url;
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return url;
  }
  const hashAt = url.indexOf('#', q);
  const base = url.slice(0, q);
  const hash = hashAt === -1 ? '' : url.slice(hashAt);
  if (QUERY_IS_TRACKING.test(host)) return base + hash;
  const query = url.slice(q + 1, hashAt === -1 ? undefined : hashAt);
  const kept = query.split('&').filter((p) => p && !TRACKING_PARAM.test(p.split('=')[0]));
  return base + (kept.length ? `?${kept.join('&')}` : '') + hash;
}

/** Text with every URL scrubbed and any stray JWT replaced. */
export function scrubText(text) {
  return text.replace(URL_RE, scrubUrl).replace(JWT_RE, '[token removed]');
}

/** Problems scrubText would fix, for lint: [{ line, message }]. */
export function findTokens(text) {
  const out = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (line !== scrubText(line)) out.push({ line: i + 1, message: 'tracking token in a link (Adzuna aztt/utm_source or a JWT). Run `jp scrub`.' });
  });
  return out;
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'out' && entry.name !== 'node_modules') yield* walk(p);
    } else if (/\.(md|json|jsonl|ya?ml)$/.test(entry.name)) yield p;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let changed = 0;
  for (const dir of ['jobs', 'leads']) {
    for await (const file of walk(path.join(ROOT, dir))) {
      const before = await readFile(file, 'utf8');
      const after = scrubText(before);
      if (after !== before) {
        await writeFile(file, after);
        changed++;
        console.log(`scrubbed ${path.relative(ROOT, file)}`);
      }
    }
  }
  console.log(changed ? `${changed} file(s) scrubbed.` : 'Nothing to scrub.');
}
