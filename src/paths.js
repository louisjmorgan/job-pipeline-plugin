import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ENGINE_ROOT: this plugin's code and default templates.
// ROOT: the workspace, one person's job search (profile/, jobs/, leads/, variants/). Found from
// JOB_PIPELINE_HOME, or by walking up from the current directory to the nearest folder with a
// profile/ directory; with none, the current directory (where /setup creates one).
export const ENGINE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function findWorkspace() {
  if (process.env.JOB_PIPELINE_HOME) return path.resolve(process.env.JOB_PIPELINE_HOME);
  for (let dir = process.cwd(); ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, 'profile', 'cv.md')) || existsSync(path.join(dir, 'profile', 'criteria.yaml'))) return dir;
    if (path.dirname(dir) === dir) return process.cwd();
  }
}

export const ROOT = findWorkspace();

// profile/: facts about the candidate, shared by every job.
export const PROFILE_DIR = path.join(ROOT, 'profile');
export const CV_FILE = path.join(PROFILE_DIR, 'cv.md');
export const FACTS_FILE = path.join(PROFILE_DIR, 'facts.md');

// jobs/<id>/: everything about one job (job.md, requirements, variant, overlay, drafts, out/).
export const JOBS_DIR = path.join(ROOT, 'jobs');

// Templates: the plugin ships the defaults; a workspace's templates/<name>/ overrides the one of
// the same name, or adds a new one.
export const ENGINE_TEMPLATES_DIR = path.join(ENGINE_ROOT, 'templates');
export const WORKSPACE_TEMPLATES_DIR = path.join(ROOT, 'templates');
export const templateDir = (name) => {
  const own = path.join(WORKSPACE_TEMPLATES_DIR, name);
  return existsSync(own) ? own : path.join(ENGINE_TEMPLATES_DIR, name);
};

export const VARIANTS_DIR = path.join(ROOT, 'variants'); // generic, non-job variants
export const OUTPUT_DIR = path.join(ROOT, 'output'); // PDFs of generic variants

/** "Ada Lovelace" -> "Ada-Lovelace-CV.pdf": the filename recruiters see on an uploaded CV. */
export const cvFileName = (meta) => `${String(meta?.name || 'CV').trim().replace(/\s+/g, '-')}-CV.pdf`;

export const JOB_ID = /^[a-z0-9][a-z0-9-]*$/;
export const jobDir = (id) => {
  if (!JOB_ID.test(id)) throw new Error(`Invalid job id "${id}" (lowercase letters, digits and - only)`);
  return path.join(JOBS_DIR, id);
};
