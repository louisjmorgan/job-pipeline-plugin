// Ashby public job board API (no key, no JavaScript needed). jobs.ashbyhq.com/<org>/<id>
import { htmlToMarkdown } from './html.js';

const URL_RE = /^https?:\/\/jobs\.ashbyhq\.com\/([\w.-]+)\/([0-9a-f-]{36})/i;
export const matches = (url) => URL_RE.test(url);

export async function fetchJob(url) {
  const [, org, id] = url.match(URL_RE);
  const api = `https://api.ashbyhq.com/posting-api/job-board/${org}?includeCompensation=true`;
  const res = await fetch(api);
  if (!res.ok) throw new Error(`Ashby API ${res.status} for ${api}`);
  const j = (await res.json()).jobs?.find((x) => x.id === id);
  if (!j) throw new Error(`Ashby job ${id} not on ${org}'s board (closed?)`);
  return {
    meta: {
      company: org, title: j.title, location: [j.location, j.isRemote ? 'Remote' : '', j.workplaceType].filter(Boolean).join(', '),
      salary: j.compensation?.compensationTierSummary ?? '', url: j.jobUrl ?? url, apply_url: j.applyUrl ?? url, apply_via: 'Ashby',
      source: `ashby:${org}/${id}`, posted: j.publishedAt ? j.publishedAt.slice(0, 10) : '', closes: '',
    },
    listing: htmlToMarkdown(j.descriptionHtml ?? j.descriptionPlain ?? ''),
    form: `Ashby's public API doesn't expose the application questions. Open ${j.applyUrl ?? url} to see them.${j.employmentType ? `\n\nEmployment type: ${j.employmentType}.` : ''}`,
  };
}
