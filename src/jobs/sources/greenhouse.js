// Greenhouse public job board API: no key needed, and it returns the real application form.
// Handles job-boards.greenhouse.io, job-boards.eu.greenhouse.io and boards.greenhouse.io URLs.
// (EU boards are served by the same API host.)
import { htmlToMarkdown } from './html.js';

const URL_RE = /^https?:\/\/(?:job-boards(?:\.eu)?|boards)\.greenhouse\.io\/(?:embed\/job_app\?for=)?([\w-]+)\/jobs\/(\d+)/;

export const matches = (url) => URL_RE.test(url);

/** @returns {Promise<{ meta: object, listing: string, form: string }>} normalised job */
export async function fetchJob(url) {
  const [, board, id] = url.match(URL_RE) ?? [];
  if (!board) throw new Error(`Not a Greenhouse job URL: ${url}`);
  const api = `https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${id}?questions=true`;
  const res = await fetch(api);
  if (!res.ok) throw new Error(`Greenhouse API ${res.status} for ${api} (job closed or board renamed?)`);
  const job = await res.json();

  const metadata = Object.fromEntries((job.metadata ?? []).map((m) => [m.name, m.value]));
  const pick = (re) => Object.entries(metadata).find(([k, v]) => re.test(k) && v)?.[1];
  const day = (iso) => (iso ? String(iso).slice(0, 10) : '');

  return {
    meta: {
      company: job.company_name?.trim() || board,
      title: job.title.trim(),
      location: job.location?.name?.trim() ?? '',
      salary: pick(/salary/i) ?? '',
      url: job.absolute_url ?? url,
      apply_url: job.absolute_url ?? url,
      apply_via: 'Greenhouse',
      source: `greenhouse:${board}/${id}`,
      posted: day(job.first_published),
      closes: day(job.application_deadline) || day(pick(/close date|closing/i)),
    },
    listing: htmlToMarkdown(job.content ?? ''),
    form: formMarkdown(job.questions ?? []),
  };
}

const BASIC = /^(first name|last name|preferred first name|email|phone|resume\/cv|linkedin profile|website)$/i;

function formMarkdown(questions) {
  const lines = [];
  const coverLetter = questions.find((q) => /cover letter/i.test(q.label));
  lines.push(
    coverLetter
      ? `Cover letter: **requested**${coverLetter.required ? ' (required)' : ' (optional)'}.`
      : 'Cover letter: **not requested** (no field on the form).',
    '',
  );
  const written = questions.filter((q) => !BASIC.test(q.label.trim()) && !/cover letter/i.test(q.label) && q.fields.some((f) => f.type === 'textarea'));
  const other = questions.filter((q) => !BASIC.test(q.label.trim()) && !/cover letter/i.test(q.label) && !written.includes(q));

  const label = (q) => `${q.label.replace(/\s+/g, ' ').trim()}${q.required ? ' *(required)*' : ''}`;
  if (written.length) {
    lines.push('### Written answers', '');
    written.forEach((q, i) => lines.push(`${i + 1}. ${label(q)}`));
    lines.push('');
  }
  if (other.length) {
    lines.push('### Other fields', '');
    for (const q of other) {
      lines.push(`- ${label(q)}`);
      const options = q.fields.flatMap((f) => f.values ?? []).map((v) => v.label);
      for (const o of options) lines.push(`  - ${o.replace(/\s+/g, ' ').trim()}`);
    }
    lines.push('');
  }
  lines.push('Standard fields (name, email, phone, CV upload) are not listed.');
  return lines.join('\n');
}
