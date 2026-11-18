// Lever public postings API (no key). jobs.lever.co/<company>/<id> and jobs.eu.lever.co/...
import { htmlToMarkdown } from './html.js';

const URL_RE = /^https?:\/\/jobs\.(eu\.)?lever\.co\/([\w.-]+)\/([0-9a-f-]{36})/i;
export const matches = (url) => URL_RE.test(url);

export async function fetchJob(url) {
  const [, eu, company, id] = url.match(URL_RE);
  const api = `https://api.${eu ? 'eu.' : ''}lever.co/v0/postings/${company}/${id}`;
  const res = await fetch(api);
  if (!res.ok) throw new Error(`Lever API ${res.status} for ${api} (closed?)`);
  const j = await res.json();
  const sections = (j.lists ?? []).map((l) => `### ${l.text}\n\n${htmlToMarkdown(`<ul>${l.content}</ul>`)}`).join('\n\n');
  const listing = [htmlToMarkdown(j.description ?? ''), sections, htmlToMarkdown(j.additional ?? '')].filter(Boolean).join('\n\n');
  const salary = j.salaryRange ? `${j.salaryRange.currency} ${j.salaryRange.min}–${j.salaryRange.max} ${j.salaryRange.interval ?? ''}`.trim() : '';
  return {
    meta: {
      company, title: j.text, location: [j.categories?.location, j.workplaceType].filter(Boolean).join(', '),
      salary, url: j.hostedUrl ?? url, apply_url: j.applyUrl ?? url, apply_via: 'Lever',
      source: `lever:${company}/${id}`, posted: j.createdAt ? new Date(j.createdAt).toISOString().slice(0, 10) : '', closes: '',
    },
    listing,
    form: `Lever's public API doesn't expose the application questions. Open ${j.applyUrl ?? url} to see them.${j.categories?.commitment ? `\n\nCommitment: ${j.categories.commitment}.` : ''}`,
  };
}
