// Loads CV targets and applies them (inclusion/exclusion only — never order).
// A target is either a generic variant (variants/<name>.json) or a job
// (jobs/<id>/variant.json, plus jobs/<id>/overlay.md if it exists).
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { JOBS_DIR, VARIANTS_DIR, jobDir } from '../paths.js';
import { parseCv } from './parse.js';

const VARIANT_KEYS = new Set(['template', 'sections', 'theme', 'fonts', 'description']);
const RULE_KEYS = new Set(['include', 'exclude_items']);

const rel = (file) => path.relative(process.cwd(), file);

export async function listVariants() {
  const files = await readdir(VARIANTS_DIR);
  return files.filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
}

/** Job ids that have a variant.json, i.e. have reached the tailoring stage. */
export async function listJobVariants() {
  const ids = await readdir(JOBS_DIR).catch(() => []);
  const has = await Promise.all(
    ids.map((id) => readFile(path.join(JOBS_DIR, id, 'variant.json')).then(() => id, () => null)),
  );
  return has.filter(Boolean).sort();
}

async function readJson(file, label) {
  let raw;
  try {
    raw = await readFile(file, 'utf8');
  } catch {
    throw new Error(`${label} not found (expected ${rel(file)})`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`${label} is not valid JSON: ${err.message}`);
  }
}

/**
 * @param {{ variant?: string, job?: string }} opts  exactly one of the two
 * @returns {Promise<{ kind: 'variant'|'job', name: string, variant: object, overlay: object|null }>}
 */
/**
 * A job's CV takes its look from the house style, variants/main.json (template, theme, fonts),
 * unless its own variant.json sets them. Theme keys merge, the job's winning.
 */
async function withHouseStyle(config) {
  const house = await readFile(path.join(VARIANTS_DIR, 'main.json'), 'utf8').then(JSON.parse).catch(() => ({}));
  return {
    ...config,
    template: config.template ?? house.template,
    theme: { ...(house.theme ?? {}), ...(config.theme ?? {}) },
    fonts: config.fonts ?? house.fonts,
  };
}

export async function loadTarget({ variant, job }) {
  if (job) {
    const dir = jobDir(job);
    const config = await readJson(path.join(dir, 'variant.json'), `Variant for job "${job}"`);
    const source = await readFile(path.join(dir, 'overlay.md'), 'utf8').catch(() => null);
    return { kind: 'job', name: job, variant: { name: job, ...(await withHouseStyle(config)) }, overlay: source && parseCv(source) };
  }
  if (!variant || !/^[\w-]+$/.test(variant)) throw new Error(`Invalid variant name "${variant}"`);
  const config = await readJson(path.join(VARIANTS_DIR, `${variant}.json`), `Variant "${variant}"`);
  return { kind: 'variant', name: variant, variant: { name: variant, ...config }, overlay: null };
}

/**
 * Returns a copy of the CV with overlay content swapped in by id: frontmatter keys replace
 * the master's, a non-empty section intro replaces the master intro, and an entry replaces the
 * master entry with the same id (title and body; meta keys are merged). Never adds or reorders.
 */
export function applyOverlay(cv, overlay) {
  if (!overlay) return { cv, warnings: [] };
  const warnings = [];
  const sections = { ...cv.sections };

  for (const [id, over] of Object.entries(overlay.sections)) {
    const section = sections[id];
    if (!section) {
      warnings.push(`Overlay references unknown section "${id}"`);
      continue;
    }
    const byId = new Map(over.entries.map((e) => [e.id, e]));
    for (const e of over.entries) {
      if (!section.entries.some((m) => m.id === e.id)) warnings.push(`Overlay section "${id}" has no entry "${e.id}" to replace`);
    }
    sections[id] = {
      ...section,
      html: over.html || section.html,
      entries: section.entries.map((m) => {
        const e = byId.get(m.id);
        return e ? { ...m, title: e.title, meta: { ...m.meta, ...e.meta }, html: e.html || m.html } : m;
      }),
    };
  }

  return { cv: { ...cv, meta: { ...cv.meta, ...overlay.meta }, sections }, warnings };
}

/**
 * Returns a copy of the parsed CV with excluded sections/entries removed,
 * plus warnings for anything in the variant that doesn't match the CV (typos).
 */
export function applyVariant(cv, variant) {
  const warnings = [];
  const rules = variant.sections ?? {};

  for (const key of Object.keys(variant)) {
    if (key !== 'name' && !VARIANT_KEYS.has(key)) warnings.push(`Unknown variant key "${key}"`);
  }

  for (const [id, rule] of Object.entries(rules)) {
    const section = cv.sections[id];
    if (!section) {
      warnings.push(`Variant references unknown section "${id}"`);
      continue;
    }
    for (const key of Object.keys(rule)) {
      if (!RULE_KEYS.has(key)) warnings.push(`Unknown key "${key}" in rule for section "${id}"`);
    }
    for (const itemId of rule.exclude_items ?? []) {
      if (!section.entries.some((e) => e.id === itemId)) {
        warnings.push(`Section "${id}" has no entry "${itemId}" to exclude`);
      }
    }
  }

  const sections = {};
  for (const [id, section] of Object.entries(cv.sections)) {
    const rule = rules[id] ?? {};
    if (rule.include === false) continue;
    const excluded = new Set(rule.exclude_items ?? []);
    sections[id] = { ...section, entries: section.entries.filter((e) => !excluded.has(e.id)) };
  }

  return {
    cv: { ...cv, sections, order: cv.order.filter((id) => id in sections) },
    warnings,
  };
}
