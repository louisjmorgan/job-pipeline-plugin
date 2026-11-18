// ATS-compatibility check for a built PDF: does the text an ATS parser would extract
// actually match the CV content, and — since some ATS software reads a PDF's text by visual
// position on the page rather than by document order — would that specific reading order
// actually interleave unrelated sections where this PDF uses a multi-column layout?
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFParse } from 'pdf-parse';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { templateDir } from '../paths.js';

const MIN_CHARS_PER_PAGE = 200; // below this, text is probably an image/canvas, not selectable.

const normalize = (s) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[·•]/g, ' ') // org lists render with a bullet separator
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Every string an ATS should be able to read back out of the CV, with a label for warnings. */
function expectedStrings(cv) {
  const out = [];
  const push = (label, value) => {
    if (value && String(value).trim()) out.push({ label, value: String(value) });
  };
  push('name', cv.meta.name);
  push('email', cv.meta.email);
  push('phone', cv.meta.phone);
  push('location', cv.meta.location);
  for (const section of Object.values(cv.sections)) {
    push(`section "${section.id}" title`, section.title);
    for (const entry of section.entries) {
      push(`entry "${entry.id}" title`, entry.title);
      push(`entry "${entry.id}" org`, entry.meta.org);
    }
  }
  return out;
}

async function extractPdfText(pdfBuffer) {
  const parser = new PDFParse({ data: pdfBuffer });
  try {
    const result = await parser.getText();
    return { text: result.text, pages: result.pages?.length ?? result.total ?? 1 };
  } finally {
    await parser.destroy();
  }
}

// Simulates how a "naive" ATS parser reads a PDF: not by document order, but by sorting all
// text on a page top-to-bottom then left-to-right across the *full page width* — the way you'd
// read a page that has no columns. On a genuinely side-by-side layout this merges lines from
// both columns, so it's a real (if worst-case) test of whether a multi-column page is safe.
// Returns one array of reconstructed lines (top-to-bottom) per page.
async function naiveVisualOrderPerPage(pdfBuffer) {
  const doc = await getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
  const pageLines = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const items = content.items.filter((i) => i.str?.trim()).map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5] }));
      const LINE_TOL = 2; // pt
      const lines = [];
      for (const it of items) {
        let line = lines.find((l) => Math.abs(l.y - it.y) <= LINE_TOL);
        if (!line) {
          line = { y: it.y, items: [] };
          lines.push(line);
        }
        line.items.push(it);
      }
      lines.sort((a, b) => b.y - a.y);
      pageLines.push(lines.map((l) => l.items.sort((a, b) => a.x - b.x).map((i) => i.str).join(' ')));
    }
  } finally {
    await doc.destroy();
  }
  return pageLines;
}

/**
 * Within one page's naively-ordered lines, checks whether any section's landmarks (its title,
 * its entries' titles) get split into more than one place — i.e. some *other* section's content
 * appears in between. That's the concrete signature of columns being merged out of order.
 *
 * Landmarks are matched against the *start* of a line, not anywhere in the page's text — a
 * heading/entry title mentioned mid-sentence elsewhere (e.g. a project named in a bullet point)
 * doesn't count as that section appearing there.
 */
function findScrambledSections(lines, cv) {
  const landmarks = [];
  lines.forEach((line, i) => {
    const normLine = normalize(line);
    for (const section of Object.values(cv.sections)) {
      for (const value of [section.title, ...section.entries.map((e) => e.title)]) {
        // Title must end the line or be followed by a space (e.g. dates beside it), so wrapped
        // body text like "Selected Projects)." isn't mistaken for the heading.
        const v = normalize(value);
        if (normLine.startsWith(v) && (normLine.length === v.length || normLine[v.length] === ' ')) {
          landmarks.push({ sectionId: section.id, i });
        }
      }
    }
  });
  landmarks.sort((a, b) => a.i - b.i);

  const seen = new Set();
  const scrambled = new Set();
  let last = null;
  for (const lm of landmarks) {
    if (lm.sectionId !== last) {
      if (seen.has(lm.sectionId)) scrambled.add(lm.sectionId);
      seen.add(lm.sectionId);
      last = lm.sectionId;
    }
  }
  return scrambled;
}

const CSS_RISKS = [
  {
    test: /column-count\s*:\s*[2-9]/i,
    message: 'uses CSS multi-column text flow, which most ATS parsers read in the wrong order',
  },
  {
    test: /content\s*:\s*["'][A-Za-z0-9][^"']*["']/,
    message: "has CSS ::before/::after content with real text (not just bullets/punctuation) — that text isn't in the DOM/PDF text layer and ATS parsers won't see it",
  },
];

/** Static scan of the template's stylesheet for layout patterns known to trip up ATS parsers. */
async function checkTemplateCss(template) {
  const cssPath = path.join(templateDir(template), 'style.css');
  const css = await readFile(cssPath, 'utf8').catch(() => '');
  const findings = [];
  for (const risk of CSS_RISKS) {
    if (risk.test.test(css)) findings.push(risk.message);
  }
  return findings;
}

/**
 * @param {{ pdfBuffer: Buffer, cv: object, template: string }} args
 * @returns {Promise<{ errors: string[], warnings: string[] }>}
 */
export async function checkAts({ pdfBuffer, cv, template }) {
  const errors = [];
  const warnings = [];

  const { text, pages } = await extractPdfText(pdfBuffer);
  const normalizedText = normalize(text);

  if (normalizedText.length < MIN_CHARS_PER_PAGE * Math.max(1, pages)) {
    errors.push(
      `only ${normalizedText.length} chars of selectable text extracted across ${pages} page(s) — ` +
        `content may be rendering as an image/canvas instead of real text, which ATS parsers can't read`,
    );
  }

  for (const { label, value } of expectedStrings(cv)) {
    if (!normalizedText.includes(normalize(value))) {
      errors.push(`${label} ("${value}") was not found in the extracted PDF text`);
    }
  }

  for (const finding of await checkTemplateCss(template)) {
    warnings.push(`template "${template}" ${finding}`);
  }

  const pageLines = await naiveVisualOrderPerPage(pdfBuffer);
  const scrambledSections = new Set();
  for (const lines of pageLines) {
    for (const id of findScrambledSections(lines, cv)) scrambledSections.add(id);
  }
  if (scrambledSections.size) {
    warnings.push(
      `template "${template}": a parser that reads this PDF by visual position on the page rather than by document ` +
        `order would interleave the [${[...scrambledSections].join(', ')}] section(s) with other content on the same ` +
        `page — most current ATS software reads PDFs in document order and is unaffected, but this is a real risk ` +
        `for parsers that aren't`,
    );
  }

  return { errors, warnings };
}
