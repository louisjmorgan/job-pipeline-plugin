// Leads: job listings found by search that haven't been screened yet.
//
//   leads/inbox.jsonl   unscreened leads, one JSON object per line
//   leads/seen.json     every lead ever seen, keyed by dedupe key: { status, job?, reason?, first_seen, title, company }
//                       status: inbox | promoted | rejected | filtered
//   leads/runs/<date>.md  digest of each search run
//
// A lead: { key, source, source_id, company, title, location, remote, salary_text, salary_min,
//           salary_max, hours, url, posted, snippet, found, flags[] }
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { PROFILE_DIR, ROOT } from '../paths.js';
import { slugify } from '../cv/parse.js';
import { readAllJobs } from './job.js';
import { scrubText } from './scrub.js';

export const LEADS_DIR = path.join(ROOT, 'leads');
const INBOX = path.join(LEADS_DIR, 'inbox.jsonl');
const SEEN = path.join(LEADS_DIR, 'seen.json');

export const today = () => new Date().toISOString().slice(0, 10);

export async function loadCriteria() {
  return parseYaml(await readFile(path.join(PROFILE_DIR, 'criteria.yaml'), 'utf8'));
}

export async function loadWatchlist() {
  const raw = await readFile(path.join(PROFILE_DIR, 'watchlist.yaml'), 'utf8').catch(() => '');
  return parseYaml(raw)?.companies ?? [];
}

// ---- dedupe ----

const COMPANY_NOISE = /\b(ltd|limited|plc|llp|inc|group|holdings|uk|the|co|company|careers|jobs)\b/g;
export const normCompany = (s = '') => slugify(String(s).toLowerCase().replace(COMPANY_NOISE, ' '));
// "Senior Software Engineer - Full or Part Time (Remote)" -> "senior-software-engineer"
export const normTitle = (s = '') => slugify(String(s).split(/\s+[-–—|]\s+|\s*\(/)[0]);
export const leadKey = (lead) => `${normCompany(lead.company)}::${normTitle(lead.title)}`;

// ---- filtering against criteria ----

const has = (text, words) => words.find((w) => new RegExp(`(^|[^a-z])${w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i').test(text));

/** Returns null if the lead passes, or a short reason it was filtered out. */
export function filterLead(lead, criteria) {
  const title = lead.title ?? '';
  const ex = has(title, criteria.roles?.exclude_titles ?? []);
  if (ex) return `title has "${ex}"`;
  if (!has(title, criteria.roles?.titles ?? [])) return 'title not a target role';

  const floor = criteria.salary_floor ?? 0;
  const top = lead.salary_max ?? lead.salary_min;
  // Only judge clearly annual figures; hourly/daily or pro-rata part-time amounts are left to screening.
  if (top && top >= 10000 && top < floor) return `salary ${top} below floor`;

  const loc = `${lead.location ?? ''}`.toLowerCase();
  const commutable = (criteria.location?.commutable ?? []).some((c) => loc.includes(c.toLowerCase()));
  const remote = lead.remote === true || /remote|work from home|home[- ]based|anywhere/i.test(`${lead.location} ${lead.title}`);
  const ukish = /\b(uk|united kingdom|england|scotland|wales|gb|great britain)\b/i.test(loc) || commutable || !loc;
  if (!commutable && !(remote && ukish)) return `location "${lead.location || '?'}" not commutable or UK-remote`;

  // Company boards (watchlist) list only open roles, and evergreen roles keep their original
  // publish date, so age only means something for aggregators.
  const board = /^(greenhouse|lever|ashby):/.test(lead.source ?? '');
  if (!board && lead.posted && criteria.max_age_days) {
    const age = (Date.parse(today()) - Date.parse(lead.posted)) / 86_400_000;
    if (age > criteria.max_age_days) return `posted ${lead.posted}, older than ${criteria.max_age_days} days`;
  }
  return null;
}

/** Flags worth surfacing in the digest: part-time, 4-day week, weak spots in the snippet. */
export function flagLead(lead, criteria) {
  const text = `${lead.title} ${lead.hours ?? ''} ${lead.snippet ?? ''}`;
  const flags = [];
  if (/part[- ]time|\b0\.\d\s*fte|pro[- ]rata/i.test(text)) flags.push('part-time');
  if (/4[- ]day|four[- ]day|32[- ]hour|compressed hours/i.test(text)) flags.push('4-day week');
  if (lead.remote || /remote/i.test(`${lead.location}`)) flags.push('remote');
  const weak = (criteria.roles?.weak_spots ?? []).filter((w) => has(text, [w]));
  if (weak.length) flags.push(`mentions ${weak.join('/')}`);
  return flags;
}

// ---- storage ----

export async function readSeen() {
  return JSON.parse(await readFile(SEEN, 'utf8').catch(() => '{}'));
}
export async function writeSeen(seen) {
  await mkdir(LEADS_DIR, { recursive: true });
  const sorted = Object.fromEntries(Object.entries(seen).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(SEEN, scrubText(`${JSON.stringify(sorted, null, 1)}\n`));
}

export async function readInbox() {
  const raw = await readFile(INBOX, 'utf8').catch(() => '');
  return raw.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
export async function writeInbox(leads) {
  await mkdir(LEADS_DIR, { recursive: true });
  await writeFile(INBOX, scrubText(leads.map((l) => JSON.stringify(l)).join('\n') + (leads.length ? '\n' : '')));
}

/**
 * Filters, dedupes and appends leads to the inbox. Returns { added, filtered, duplicates }.
 * Filtered leads are remembered too, so the same miss isn't re-evaluated every run.
 */
export async function ingest(leads, criteria, { applyFilter = true } = {}) {
  const seen = await readSeen();
  const inbox = await readInbox();
  // Jobs already in jobs/ count as seen, whatever their status.
  for (const { id, meta } of await readAllJobs()) {
    const key = leadKey({ company: meta.company, title: meta.title });
    seen[key] ??= { status: 'promoted', job: id, first_seen: meta.found || today(), title: meta.title, company: meta.company };
  }
  const added = [];
  const filtered = [];
  let duplicates = 0;
  for (const raw of leads) {
    const lead = { ...raw, key: raw.key ?? leadKey(raw), found: raw.found ?? today() };
    if (!lead.company || !lead.title) continue;
    if (seen[lead.key] || added.some((a) => a.key === lead.key)) {
      duplicates++;
      continue;
    }
    const reason = applyFilter ? filterLead(lead, criteria) : null;
    const base = { first_seen: today(), title: lead.title, company: lead.company, source: lead.source, url: lead.url };
    if (reason) {
      seen[lead.key] = { ...base, status: 'filtered', reason };
      filtered.push({ ...lead, reason });
      continue;
    }
    lead.flags = flagLead(lead, criteria);
    seen[lead.key] = { ...base, status: 'inbox' };
    added.push(lead);
  }
  await writeInbox([...inbox, ...added]);
  await writeSeen(seen);
  return { added, filtered, duplicates };
}

export async function appendRunLog(markdown) {
  const dir = path.join(LEADS_DIR, 'runs');
  await mkdir(dir, { recursive: true });
  await appendFile(path.join(dir, `${today()}.md`), scrubText(`${markdown}\n`));
}
