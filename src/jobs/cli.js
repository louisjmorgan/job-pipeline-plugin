// Usage:
//   jp jobs                          -> every job that's still in play, by status then closing date
//   jp jobs --all                 -> include rejected and closed
//   jp jobs --status=drafted      -> one status only
//   jp set <id> <status>     -> move a job (sets `applied` date when status is applied)
//   jp add <url> [--id=<id>] -> create jobs/<id>/job.md from a listing (Greenhouse for now)
import { parseArgs } from 'node:util';
import { DONE, daysUntil, readAllJobs, setStatus, sortJobs } from './job.js';
import { addJob } from './add.js';

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: { all: { type: 'boolean', default: false }, status: { type: 'string' }, id: { type: 'string' } },
});

if (positionals[0] === 'add') {
  const url = positionals[1];
  if (!url) throw new Error('Usage: jp add <url> [--id=<id>]');
  const { id, meta } = await addJob(url, { id: args.id });
  console.log(`✓ jobs/${id}/job.md — ${meta.company}: ${meta.title}${meta.closes ? ` (closes ${meta.closes})` : ''}`);
  process.exit(0);
}

if (positionals[0] === 'set') {
  const [, id, status] = positionals;
  if (!id || !status) throw new Error('Usage: jp set <id> <status>');
  const job = await setStatus(id, status);
  console.log(`${id}: ${job.meta.status}`);
  if (status === 'approved') {
    // Nudge towards /learn when the user edited the drafts by hand (uncommitted changes, or
    // commits without Claude's co-author trailer).
    const { execSync } = await import('node:child_process');
    const run = (cmd) => { try { return execSync(cmd, { encoding: 'utf8' }); } catch { return ''; } };
    const drafts = `jobs/${id}/overlay.md jobs/${id}/answers.md jobs/${id}/cover-letter.md jobs/${id}/variant.json`;
    const uncommitted = run(`git status --porcelain -- ${drafts}`).trim();
    const own = run(`git log --format='%H %(trailers:key=Co-Authored-By,valueonly,separator=;)' -- ${drafts}`)
      .split('\n').filter((l) => /^[0-9a-f]{40}/.test(l) && !/Claude/i.test(l));
    if (uncommitted || own.length) console.log('You edited these drafts yourself. Run /learn ' + id + ' in Claude Code to record what changed.');
  }
  process.exit(0);
}

let jobs = sortJobs(await readAllJobs());
if (args.status) jobs = jobs.filter((j) => j.meta.status === args.status);
else if (!args.all) jobs = jobs.filter((j) => !DONE.has(j.meta.status));

if (!jobs.length) {
  console.log('No jobs.');
  process.exit(0);
}

const rows = jobs.map(({ id, meta }) => {
  let closes = meta.closes ? String(meta.closes) : '';
  if (closes && !DONE.has(meta.status) && meta.status !== 'applied') {
    const d = daysUntil(closes);
    closes += d < 0 ? ' (passed)' : d <= 7 ? ` (${d}d!)` : '';
  }
  return [meta.status ?? '?', meta.score ?? '', id, `${meta.company ?? ''} — ${meta.title ?? ''}`, closes];
});
const head = ['status', 'score', 'id', 'role', 'closes'];
const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
const line = (r) => r.map((c, i) => String(c).padEnd(widths[i])).join('  ').trimEnd();
console.log(line(head));
console.log(widths.map((w) => '─'.repeat(w)).join('  '));
for (const r of rows) console.log(line(r));
