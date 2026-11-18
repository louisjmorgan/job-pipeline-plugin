// Usage:
//   jp search                     -> every enabled feed in profile/criteria.yaml
//   jp search --source=reed    -> one feed (watchlist, rss, reed, adzuna, jobspipe)
//
// Feeds are the cheap, deterministic half of job search: no model calls. New leads that pass the
// criteria filter go to leads/inbox.jsonl for screening (/find-jobs, or `jp leads`).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT } from '../paths.js';
import { FEEDS } from './sources/feeds.js';
import { LEADS_DIR, appendRunLog, ingest, loadCriteria, loadWatchlist, today } from './leads.js';

try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  /* no .env: keyed sources are skipped */
}

const { values: args } = parseArgs({ options: { source: { type: 'string' } } });
const STATE = path.join(LEADS_DIR, 'state.json');
const state = JSON.parse(await readFile(STATE, 'utf8').catch(() => '{}'));
state.usage ??= {};
const sinceDays = state.last_run ? Math.ceil((Date.parse(today()) - Date.parse(state.last_run)) / 86_400_000) + 1 : 7;

const criteria = await loadCriteria();
const ctx = { criteria, env: process.env, watchlist: await loadWatchlist(), usage: state.usage, sinceDays, notes: [] };

const feeds = FEEDS.filter((f) => !args.source || f.name === args.source);
const lines = [`## Search run ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, ''];
const all = [];
for (const feed of feeds) {
  if (!feed.enabled(criteria, process.env)) {
    const why = feed.missing && criteria.sources?.[feed.name]?.enabled ? `skipped (set ${feed.missing} in .env)` : 'disabled or nothing configured';
    console.log(`- ${feed.name}: ${why}`);
    lines.push(`- ${feed.name}: ${why}`);
    continue;
  }
  try {
    const leads = await feed.search(ctx);
    all.push(...leads);
    console.log(`✓ ${feed.name}: ${leads.length} listings`);
    lines.push(`- ${feed.name}: ${leads.length} listings`);
  } catch (err) {
    console.log(`✗ ${feed.name}: ${err.message}`);
    lines.push(`- ${feed.name}: failed (${err.message})`);
  }
}
for (const n of ctx.notes) {
  console.log(`  ⚠ ${n}`);
  lines.push(`  - ⚠ ${n}`);
}

const { added, filtered, duplicates } = await ingest(all, criteria);
console.log(`\n${added.length} new leads in the inbox · ${filtered.length} filtered out · ${duplicates} already seen`);
lines.push('', `**${added.length} new** · ${filtered.length} filtered · ${duplicates} already seen`, '');
if (added.length) {
  lines.push('| Company | Title | Location | Salary | Flags | Source |', '| --- | --- | --- | --- | --- | --- |');
  for (const l of added) {
    lines.push(`| ${l.company} | [${l.title}](${l.url}) | ${l.location ?? ''} | ${l.salary_text ?? ''} | ${(l.flags ?? []).join(', ')} | ${l.source} |`);
    console.log(`  + ${l.company} — ${l.title}${l.flags?.length ? ` [${l.flags.join(', ')}]` : ''}`);
  }
}
await appendRunLog(lines.join('\n'));

state.last_run = today();
await mkdir(LEADS_DIR, { recursive: true });
await writeFile(STATE, `${JSON.stringify(state, null, 2)}\n`);
if (state.usage.jobspipe) console.log(`JobsPipe credits used so far: ${state.usage.jobspipe}`);
