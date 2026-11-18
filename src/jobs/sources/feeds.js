// API and RSS feeds for `jp search`. Each source: { name, enabled(criteria, env), search(ctx) -> lead[] }.
// Sources that need a key are skipped (with a note) when it's missing.
import { decodeEntities, htmlToMarkdown } from './html.js';
import { scrubUrl } from '../scrub.js';

const day = (v) => {
  if (!v) return '';
  if (typeof v === 'number') return new Date(v).toISOString().slice(0, 10);
  const dmY = String(v).match(/^(\d{2})\/(\d{2})\/(\d{4})$/); // Reed: dd/mm/yyyy
  if (dmY) return `${dmY[3]}-${dmY[2]}-${dmY[1]}`;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};
const snip = (s, n = 500) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const money = (n) => (n ? `£${Math.round(n).toLocaleString('en-GB')}` : '');
const range = (a, b) => [money(a), money(b)].filter(Boolean).join('–');

async function getJson(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { 'User-Agent': 'job-pipeline/1.0', ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${url.split('?')[0]}`);
  return res.json();
}

// Each query runs around the home location (criteria.location.home, within radius_miles) and, if
// remote work is wanted (location.remote), once more as a remote search. UK boards only for now.
const searchAreas = (c) => [c.location?.home, c.location?.remote ? 'remote' : null].filter(Boolean);
const radiusMiles = (c) => c.location?.radius_miles ?? c.manchester_radius_miles ?? 20;

// ---- Reed (free key: reed.co.uk/developers) ----
export const reed = {
  name: 'reed',
  enabled: (c, env) => c.sources?.reed?.enabled && env.REED_API_KEY,
  missing: 'REED_API_KEY',
  async search({ criteria, env }) {
    const auth = `Basic ${Buffer.from(`${env.REED_API_KEY}:`).toString('base64')}`;
    const out = [];
    for (const q of criteria.queries ?? []) {
      for (const where of searchAreas(criteria)) {
        const p = new URLSearchParams({ keywords: where === 'remote' ? `${q} remote` : q, resultsToTake: '100' });
        if (where !== 'remote') {
          p.set('locationName', where);
          p.set('distanceFromLocation', String(radiusMiles(criteria)));
        }
        const data = await getJson(`https://www.reed.co.uk/api/1.0/search?${p}`, { headers: { Authorization: auth } });
        for (const j of data.results ?? []) {
          out.push({
            source: 'reed', source_id: String(j.jobId), company: j.employerName, title: j.jobTitle,
            location: j.locationName, remote: null, salary_min: j.minimumSalary ?? null, salary_max: j.maximumSalary ?? null,
            salary_text: range(j.minimumSalary, j.maximumSalary), url: j.jobUrl, posted: day(j.date), snippet: snip(j.jobDescription),
          });
        }
      }
    }
    return out;
  },
};

// ---- Adzuna (free key: developer.adzuna.com) ----
export const adzuna = {
  name: 'adzuna',
  enabled: (c, env) => c.sources?.adzuna?.enabled && env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY,
  missing: 'ADZUNA_APP_ID and ADZUNA_APP_KEY',
  async search({ criteria, env }) {
    const out = [];
    for (const q of criteria.queries ?? []) {
      for (const where of searchAreas(criteria)) {
        const p = new URLSearchParams({
          app_id: env.ADZUNA_APP_ID, app_key: env.ADZUNA_APP_KEY, results_per_page: '50',
          what: where === 'remote' ? `${q} remote` : q, max_days_old: String(criteria.max_age_days ?? 21),
          'content-type': 'application/json',
        });
        if (where !== 'remote') {
          p.set('where', where);
          p.set('distance', String(Math.round(radiusMiles(criteria) * 1.609)));
        }
        const data = await getJson(`https://api.adzuna.com/v1/api/jobs/gb/search/1?${p}`);
        for (const j of data.results ?? []) {
          const predicted = String(j.salary_is_predicted) === '1';
          out.push({
            source: 'adzuna', source_id: String(j.id), company: j.company?.display_name, title: decodeEntities(j.title ?? ''),
            location: j.location?.display_name, remote: null,
            salary_min: predicted ? null : j.salary_min ?? null, salary_max: predicted ? null : j.salary_max ?? null,
            salary_text: predicted ? '' : range(j.salary_min, j.salary_max), hours: j.contract_time ?? null,
            url: scrubUrl(j.redirect_url), // drops utm_source=<our app id>
            posted: day(j.created), snippet: snip(decodeEntities(j.description ?? '')),
          });
        }
      }
    }
    return out;
  },
};

// ---- JobsPipe (LinkedIn, Indeed and ATS boards; key: jobspipe.dev; 1 credit per job returned) ----
export const jobspipe = {
  name: 'jobspipe',
  enabled: (c, env) => c.sources?.jobspipe?.enabled && env.JOBSPIPE_API_KEY,
  missing: 'JOBSPIPE_API_KEY',
  async search({ criteria, env, usage, sinceDays }) {
    const cfg = criteria.sources.jobspipe;
    const left = (cfg.credit_budget ?? 1000) - (usage.jobspipe ?? 0);
    const limit = Math.min(cfg.per_run_limit ?? 25, left);
    if (limit <= 0) throw new Error(`credit budget used (${usage.jobspipe} of ${cfg.credit_budget}); raise credit_budget in criteria.yaml to continue`);
    const body = {
      job_title_or: criteria.queries ?? [], job_country_code_or: ['GB'],
      posted_at_max_age_days: Math.max(1, Math.min(sinceDays, criteria.max_age_days ?? 21)), limit,
    };
    const data = await getJson('https://api.jobspipe.dev/v1/jobs/search', {
      method: 'POST', headers: { Authorization: `Bearer ${env.JOBSPIPE_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const jobs = data.data ?? [];
    usage.jobspipe = (usage.jobspipe ?? 0) + jobs.length;
    return jobs.map((j) => ({
      source: `jobspipe:${j.sources?.[0]?.provider ?? 'unknown'}`, source_id: String(j.id), company: j.company, title: j.job_title,
      location: j.location ?? j.country_code, remote: j.remote ?? null, salary_min: null, salary_max: null,
      salary_text: j.min_annual_salary_usd ? `$${j.min_annual_salary_usd}–${j.max_annual_salary_usd ?? '?'} (USD)` : '',
      url: j.source_url ?? j.url, posted: day(j.date_posted), snippet: snip(j.description),
    }));
  },
};

// ---- Watchlist: company boards via public ATS APIs (no key) ----
export async function boardJobs({ name, ats, board, region }) {
  if (ats === 'greenhouse') {
    const data = await getJson(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`);
    return (data.jobs ?? []).map((j) => ({
      source: `greenhouse:${board}`, source_id: String(j.id), company: j.company_name || name, title: j.title?.trim(),
      location: j.location?.name, remote: null, url: j.absolute_url, posted: day(j.first_published ?? j.updated_at),
      snippet: snip(htmlToMarkdown(j.content ?? '')),
    }));
  }
  if (ats === 'lever') {
    const host = region === 'eu' ? 'api.eu.lever.co' : 'api.lever.co';
    const data = await getJson(`https://${host}/v0/postings/${board}?mode=json`);
    return data.map((j) => ({
      source: `lever:${board}`, source_id: j.id, company: name, title: j.text, location: j.categories?.location,
      remote: j.workplaceType === 'remote' ? true : null, hours: j.categories?.commitment ?? null,
      salary_min: j.salaryRange?.currency === 'GBP' ? j.salaryRange.min : null, salary_max: j.salaryRange?.currency === 'GBP' ? j.salaryRange.max : null,
      salary_text: j.salaryRange ? `${j.salaryRange.currency} ${j.salaryRange.min}–${j.salaryRange.max}` : '',
      url: j.hostedUrl, posted: day(j.createdAt), snippet: snip(j.descriptionPlain),
    }));
  }
  if (ats === 'ashby') {
    const data = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${board}?includeCompensation=true`);
    return (data.jobs ?? []).filter((j) => j.isListed !== false).map((j) => ({
      source: `ashby:${board}`, source_id: j.id, company: name, title: j.title, location: j.location,
      remote: j.isRemote ?? (j.workplaceType === 'Remote' ? true : null), hours: j.employmentType ?? null,
      salary_text: j.compensation?.compensationTierSummary ?? '', url: j.jobUrl, posted: day(j.publishedAt),
      snippet: snip(j.descriptionPlain),
    }));
  }
  throw new Error(`unknown ats "${ats}" for ${name}`);
}

export const watchlist = {
  name: 'watchlist',
  enabled: (c) => c.sources?.watchlist?.enabled,
  async search({ watchlist: companies, notes }) {
    const out = [];
    for (const c of companies) {
      try {
        out.push(...(await boardJobs(c)));
      } catch (err) {
        notes.push(`watchlist ${c.name}: ${err.message}`);
      }
    }
    return out;
  },
};

// ---- RSS / Atom feeds (e.g. Jobtrain or jobs.ac.uk saved searches) ----
const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decodeEntities(m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '')).trim() : '';
};

export const rss = {
  name: 'rss',
  enabled: (c) => c.sources?.rss?.enabled && (c.sources.rss.feeds ?? []).length,
  async search({ criteria, notes }) {
    const out = [];
    for (const feed of criteria.sources.rss.feeds) {
      try {
        const res = await fetch(feed, { headers: { 'User-Agent': 'job-pipeline/1.0' } });
        if (!res.ok) throw new Error(`${res.status}`);
        const xml = await res.text();
        const channel = tag(xml.split(/<item|<entry/i)[0], 'title');
        for (const item of xml.split(/<item[\s>]|<entry[\s>]/i).slice(1)) {
          const link = tag(item, 'link') || (item.match(/<link[^>]*href="([^"]+)"/i) ?? [])[1] || '';
          const title = tag(item, 'title');
          // Many job feeds put the employer after a dash: "Software Developer - Acme Ltd".
          const [t, company] = title.includes(' - ') ? [title.slice(0, title.lastIndexOf(' - ')), title.slice(title.lastIndexOf(' - ') + 3)] : [title, channel];
          const desc = htmlToMarkdown(tag(item, 'description') || tag(item, 'summary') || tag(item, 'content'));
          out.push({
            source: `rss:${new URL(feed).hostname}`, source_id: link, company, title: t, location: (desc.match(/Location:\s*([^\n]+)/i) ?? [])[1] ?? '',
            remote: null, url: link, posted: day(tag(item, 'pubDate') || tag(item, 'updated') || tag(item, 'published')), snippet: snip(desc),
          });
        }
      } catch (err) {
        notes.push(`rss ${feed}: ${err.message}`);
      }
    }
    return out;
  },
};

export const FEEDS = [watchlist, rss, reed, adzuna, jobspipe];
