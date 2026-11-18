// Turns profile/cv.md + a target (generic variant or job) + optional template override into a full HTML document.
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import ejs from 'ejs';
import { parseCv } from './parse.js';
import { applyOverlay, applyVariant, loadTarget } from './variant.js';
import { CV_FILE, ENGINE_TEMPLATES_DIR, WORKSPACE_TEMPLATES_DIR, templateDir } from '../paths.js';

export async function listTemplates() {
  const names = new Set();
  for (const base of [ENGINE_TEMPLATES_DIR, WORKSPACE_TEMPLATES_DIR]) {
    for (const n of await readdir(base).catch(() => [])) {
      if (!n.startsWith('_') && (await stat(path.join(base, n))).isDirectory()) names.add(n);
    }
  }
  return [...names].sort();
}

// Variant `theme` keys become CSS custom properties: { "accent": "#c00" } -> --accent: #c00
export function themeCss(theme = {}) {
  const decls = Object.entries(theme)
    .filter(([k]) => /^[\w-]+$/.test(k))
    .map(([k, v]) => `  --${k}: ${String(v).replace(/[;{}<]/g, '')};`);
  return decls.length ? `\n:root {\n${decls.join('\n')}\n}\n` : '';
}

// Variant `fonts`: Google Fonts families to load, e.g. ["Inter:wght@400;600", "Lora:ital@0;1"].
// Pair with theme `font-body` (and a template's other font variables) to use them.
export function fontLinks(fonts = []) {
  const families = (Array.isArray(fonts) ? fonts : [fonts]).filter((f) => /^[\w +:;@,.]+$/.test(f));
  if (!families.length) return '';
  const query = families.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+').replace(/%3A/g, ':').replace(/%40/g, '@').replace(/%3B/g, ';').replace(/%2C/g, ',')}`).join('&');
  return `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${query}&display=swap">\n`;
}

/**
 * @param {{ variant?: string, job?: string, template?: string }} opts
 *   `job` renders jobs/<id>/ (variant.json + overlay.md); otherwise `variant` names variants/<name>.json.
 *   `template` overrides the variant's choice.
 * @returns {Promise<{ html, template, kind, name, warnings: string[], cv: object }>}
 */
export async function renderCv({ variant: variantName = 'main', job, template: templateOverride } = {}) {
  const [source, target] = await Promise.all([readFile(CV_FILE, 'utf8'), loadTarget({ variant: variantName, job })]);
  const { variant, overlay } = target;
  const template = templateOverride || variant.template;
  if (!template) throw new Error(`${target.kind} "${target.name}" does not specify a "template"`);
  if (!/^[\w-]+$/.test(template)) throw new Error(`Invalid template name "${template}"`);

  const dir = templateDir(template);
  const css = await readFile(path.join(dir, 'style.css'), 'utf8').catch(() => {
    throw new Error(`Template "${template}" not found (expected templates/${template}/style.css and index.ejs)`);
  });

  const overlaid = applyOverlay(parseCv(source), overlay);
  const { cv, warnings: variantWarnings } = applyVariant(overlaid.cv, variant);
  const warnings = [...overlaid.warnings, ...variantWarnings];

  // Sections not in `placed`, in source order — lets templates append sections they don't know about.
  const others = (...placed) => cv.order.filter((id) => !placed.includes(id)).map((id) => cv.sections[id]);

  const data = {
    cv,
    meta: cv.meta,
    sections: cv.sections,
    others,
    variant,
    template,
    esc: ejs.escapeXML,
    styles: `${fontLinks(variant.fonts)}<style>\n${css}${themeCss(variant.theme)}</style>`,
  };
  const html = await ejs.renderFile(path.join(dir, 'index.ejs'), data, { async: false });
  return { html, template, kind: target.kind, name: target.name, warnings, cv };
}
