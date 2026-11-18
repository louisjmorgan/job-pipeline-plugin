// Creates jobs/<id>/job.md from a job URL, using a source adapter that can fetch it.
import { mkdir, stat } from 'node:fs/promises';
import { slugify } from '../cv/parse.js';
import { jobDir } from '../paths.js';
import { today, writeJob } from './job.js';
import * as greenhouse from './sources/greenhouse.js';
import * as lever from './sources/lever.js';
import * as ashby from './sources/ashby.js';

const SOURCES = [greenhouse, lever, ashby];

/** "Senior Full Stack Engineer - Full or Part Time" -> "senior-full-stack-engineer" */
export function jobId(company, title) {
  const core = title.split(/\s+[-–—|]\s+|\s*\(/)[0];
  return slugify(`${company} ${core}`).slice(0, 60).replace(/-+$/, '');
}

export async function addJob(url, { id } = {}) {
  const source = SOURCES.find((s) => s.matches(url));
  if (!source) {
    throw new Error(
      `No source adapter for ${url}. Supported: Greenhouse, Lever, Ashby. For other sites, create jobs/<id>/job.md by hand ` +
        `(copy the frontmatter of an existing job) and paste the listing under "## Listing".`,
    );
  }
  const { meta, listing, form } = await source.fetchJob(url);
  id ??= jobId(meta.company, meta.title);
  const dir = jobDir(id);
  if (await stat(dir).then(() => true, () => false)) throw new Error(`jobs/${id} already exists`);
  await mkdir(dir, { recursive: true });

  const body = `
## Fit

Not scored yet.

## Listing

${listing}

## Application form

${form}
`;
  await writeJob({ id, meta: { id, ...meta, found: today(), status: 'new', score: null, updated: today() }, body });
  return { id, meta };
}
