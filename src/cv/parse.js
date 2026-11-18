// Parses profile/cv.md (and job overlays) into structured data. See CONTENT.md for the rules.
import { parse as parseYaml } from 'yaml';
import { marked } from 'marked';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/;
const HEADING = /^(#{2,3})[ \t]+(.+?)[ \t]*#*[ \t]*$/;
const ANCHOR = /[ \t]*\{#([A-Za-z0-9][A-Za-z0-9_-]*)\}$/;
const META_LINE = /^([a-z][a-z0-9_-]*):[ \t]+(.+)$/;
const FENCE = /^[ \t]*(```|~~~)/;

export function slugify(text) {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function splitHeading(raw) {
  const anchor = raw.match(ANCHOR);
  const title = raw.replace(ANCHOR, '').trim();
  return { title, id: anchor ? anchor[1].toLowerCase() : slugify(title) };
}

// Hyphenated words ("self-hosted", "40,000-visitor") are kept from wrapping at the hyphen: PDF
// text extractors (and ATS parsers) treat a line-ending hyphen as hyphenation and drop it,
// so the word reads back as "selfhosted". Only text between tags is touched, never attributes.
const HYPHENATED = /[\p{L}\p{N}][\p{L}\p{N}.,]*(?:-[\p{L}\p{N}][\p{L}\p{N}.,]*)+/gu;
const keepHyphenated = (html) =>
  html.replace(/>([^<]+)</g, (_, text) => `>${text.replace(HYPHENATED, '<span style="white-space:nowrap">$&</span>')}<`);

const toHtml = (lines) => keepHyphenated(marked.parse(lines.join('\n')).trim());

/**
 * @returns {{ meta: object, sections: Record<string, Section>, order: string[] }}
 *   Section = { id, title, html, entries: Entry[] }
 *   Entry   = { id, title, meta: Record<string,string>, html }
 */
export function parseCv(source) {
  const fm = source.match(FRONTMATTER);
  const meta = (fm && parseYaml(fm[1])) || {};
  const body = (fm ? source.slice(fm[0].length) : source).replace(/<!--[\s\S]*?-->/g, '');

  const sections = {};
  const order = [];
  const entryIds = new Map(); // entry id -> section id, for global uniqueness
  let section = null;
  let entry = null;
  let inFence = false;

  for (const line of body.split(/\r?\n/)) {
    if (FENCE.test(line)) inFence = !inFence;
    const heading = !inFence && line.match(HEADING);

    if (heading && heading[1] === '##') {
      const { id, title } = splitHeading(heading[2]);
      if (!id) throw new Error(`Section heading "${heading[2]}" produces an empty id`);
      if (sections[id]) throw new Error(`Duplicate section id "${id}"`);
      section = { id, title, lines: [], entries: [] };
      sections[id] = section;
      order.push(id);
      entry = null;
      continue;
    }

    if (heading && heading[1] === '###') {
      if (!section) throw new Error(`Entry "${heading[2]}" appears before any ## section`);
      const { id, title } = splitHeading(heading[2]);
      if (!id) throw new Error(`Entry heading "${heading[2]}" produces an empty id`);
      if (entryIds.has(id)) {
        throw new Error(
          `Duplicate entry id "${id}" (in "${section.id}", already used in "${entryIds.get(id)}"). ` +
            `Give one of them an explicit {#anchor}.`,
        );
      }
      entryIds.set(id, section.id);
      entry = { id, title, meta: {}, lines: [], metaOpen: true };
      section.entries.push(entry);
      continue;
    }

    if (entry) {
      // Optional `key: value` lines directly under the ### heading.
      if (entry.metaOpen) {
        const hasMeta = Object.keys(entry.meta).length > 0;
        if (!line.trim() && !hasMeta) continue;
        const m = line.match(META_LINE);
        if (m) {
          entry.meta[m[1]] = m[2].trim();
          continue;
        }
        entry.metaOpen = false;
      }
      entry.lines.push(line);
    } else if (section) {
      section.lines.push(line);
    }
    // Anything before the first ## is ignored.
  }

  for (const s of Object.values(sections)) {
    s.html = toHtml(s.lines);
    delete s.lines;
    s.entries = s.entries.map(({ id, title, meta, lines }) => ({ id, title, meta, html: toHtml(lines) }));
  }

  return { meta, sections, order };
}
