// Usage:
//   jp leads                                  -> list the unscreened inbox
//   jp leads import <file.jsonl> [...]     -> add leads from agentic search (deduped; criteria
//                                                     filter skipped, agents already judged them)
//   jp leads promote <n|key> [--url=<employer listing>] [--id=<job-id>]
//                                                  -> create jobs/<id>/job.md (status shortlisted) and
//                                                     drop it from the inbox
//   jp leads reject <n|key> "<reason>"     -> drop it from the inbox, remember why
//
// <n> is the number shown by `jp leads`.
import { readFile, mkdir } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { addJob, jobId } from './add.js';
import { setStatus, writeJob, today } from './job.js';
import { jobDir } from '../paths.js';
import { ingest, loadCriteria, readInbox, readSeen, writeInbox, writeSeen } from './leads.js';

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: { url: { type: 'string' }, id: { type: 'string' } },
});
const [cmd, ...rest] = positionals;

const pick = (inbox, ref) => {
  const lead = /^\d+$/.test(ref ?? '') ? inbox[Number(ref) - 1] : inbox.find((l) => l.key === ref);
  if (!lead) throw new Error(`No inbox lead "${ref}". Run \`jp leads\` to list them.`);
  return lead;
};

if (!cmd || cmd === 'list') {
  const inbox = await readInbox();
  if (!inbox.length) console.log('Inbox empty.');
  inbox.forEach((l, i) =>
    console.log(`${String(i + 1).padStart(3)}. ${l.company} — ${l.title}\n     ${[l.location, l.salary_text, l.posted && `posted ${l.posted}`, ...(l.flags ?? [])].filter(Boolean).join(' · ')}\n     ${l.url}  (${l.source})`),
  );
} else if (cmd === 'import') {
  const leads = [];
  for (const file of rest) {
    const raw = await readFile(file, 'utf8');
    for (const line of raw.split('\n').filter((l) => l.trim())) {
      const lead = JSON.parse(line);
      leads.push({ ...lead, source: lead.source ?? 'agentic' });
    }
  }
  const { added, duplicates } = await ingest(leads, await loadCriteria(), { applyFilter: false });
  console.log(`${added.length} added to the inbox, ${duplicates} already seen`);
} else if (cmd === 'promote') {
  const inbox = await readInbox();
  const lead = pick(inbox, rest[0]);
  const url = args.url ?? lead.apply_url ?? lead.url;
  let id;
  try {
    ({ id } = await addJob(url, { id: args.id }));
  } catch (err) {
    if (!/No source adapter/.test(err.message)) throw err;
    // No adapter for this site: build job.md from the lead; screening fills in the listing.
    id = args.id ?? jobId(lead.company, lead.title);
    await mkdir(jobDir(id), { recursive: true });
    await writeJob({
      id,
      meta: {
        id, company: lead.company, title: lead.title, location: lead.location ?? '', salary: lead.salary_text ?? '',
        url, apply_url: url, apply_via: '', source: lead.source, found: lead.found ?? today(), posted: lead.posted ?? '',
        closes: lead.closes ?? '', status: 'shortlisted', score: null, updated: today(),
      },
      body: `\n## Fit\n\nNot scored yet.\n\n## Listing\n\n${lead.snippet ?? ''}\n\n(Snippet from ${lead.source}; fetch the full listing from the URL above.)\n\n## Application form\n\nNot fetched.\n`,
    });
  }
  await setStatus(id, 'shortlisted');
  await writeInbox(inbox.filter((l) => l !== lead));
  const seen = await readSeen();
  seen[lead.key] = { ...(seen[lead.key] ?? {}), status: 'promoted', job: id };
  await writeSeen(seen);
  console.log(`✓ jobs/${id}/job.md (shortlisted)`);
} else if (cmd === 'reject') {
  const inbox = await readInbox();
  const lead = pick(inbox, rest[0]);
  const reason = rest.slice(1).join(' ') || 'not a fit';
  await writeInbox(inbox.filter((l) => l !== lead));
  const seen = await readSeen();
  seen[lead.key] = { ...(seen[lead.key] ?? {}), status: 'rejected', reason };
  await writeSeen(seen);
  console.log(`✗ ${lead.company} — ${lead.title}: ${reason}`);
} else {
  throw new Error(`Unknown command "${cmd}" (list, import, promote, reject)`);
}
