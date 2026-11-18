// Usage:
//   jp build                                   -> variants/main.json, its own template
//   jp build --variant=concise
//   jp build --variant=main --template=classic
//   jp build --job=acme-platform-engineer    -> jobs/<id>/out/<Name>-CV.pdf, plus
//                                                      <Name>-Cover-Letter.pdf/.txt if cover-letter.md exists
//   jp build --all                          -> every generic variant and every job with a variant.json
//
// Generic variants go to output/<template>-<variant>.pdf. Job CVs go to jobs/<id>/out/ under a
// recruiter-friendly filename taken from the CV's `name`, since that is the file you upload.
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { renderCv } from './render.js';
import { listJobVariants, listVariants } from './variant.js';
import { htmlToPdf, launchBrowser } from './pdf.js';
import { checkAts } from './ats-check.js';
import { letterFile, renderLetter } from './letter.js';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { OUTPUT_DIR, ROOT, cvFileName, jobDir } from '../paths.js';

const { values: args } = parseArgs({
  options: {
    variant: { type: 'string', default: 'main' },
    job: { type: 'string' },
    template: { type: 'string' },
    all: { type: 'boolean', default: false },
    'skip-ats-check': { type: 'boolean', default: false },
  },
});

const targets = args.all
  ? [
      ...(await listVariants()).map((variant) => ({ variant, template: args.template })),
      ...(await listJobVariants()).map((job) => ({ job, template: args.template })),
    ]
  : [args.job ? { job: args.job, template: args.template } : { variant: args.variant, template: args.template }];

function outputFile({ kind, name, template, cv }) {
  if (kind === 'job') return path.join(jobDir(name), 'out', cvFileName(cv.meta));
  return path.join(OUTPUT_DIR, `${template}-${name}.pdf`);
}

const pageCount = async (pdf) => (await getDocument({ data: new Uint8Array(pdf), verbosity: 0 }).promise).numPages;

const browser = await launchBrowser();
let failed = false;
try {
  for (const target of targets) {
    const label = target.job ?? target.variant;
    try {
      const result = await renderCv(target);
      const { html, template, warnings, cv } = result;
      for (const w of warnings) console.warn(`  ⚠ [${label}] ${w}`);
      const file = outputFile(result);
      await mkdir(path.dirname(file), { recursive: true });
      const pdfBuffer = await htmlToPdf(browser, html);
      await writeFile(file, pdfBuffer);
      console.log(`✓ ${path.relative(ROOT, file)}`);
      const cvPages = await pageCount(pdfBuffer);
      if (cvPages > 2) console.warn(`  ⚠ [${label}] CV runs to ${cvPages} pages; keep it to two`);

      if (!args['skip-ats-check']) {
        const { errors, warnings: atsWarnings } = await checkAts({ pdfBuffer, cv, template });
        for (const w of atsWarnings) console.warn(`  ⚠ [ats:${label}] ${w}`);
        for (const e of errors) console.error(`  ✗ [ats:${label}] ${e}`);
        if (errors.length) failed = true;
      }

      if (target.job && (await stat(letterFile(target.job)).then(() => true, () => false))) {
        const letter = await renderLetter({ job: target.job });
        const base = path.join(path.dirname(file), cvFileName(letter.meta).replace(/-CV\.pdf$/, '-Cover-Letter'));
        const letterPdf = await htmlToPdf(browser, letter.html);
        await writeFile(`${base}.pdf`, letterPdf);
        await writeFile(`${base}.txt`, `${letter.text}\n`);
        const pages = await pageCount(letterPdf);
        console.log(`✓ ${path.relative(ROOT, base)}.pdf (+ .txt for pasting)`);
        const maxPages = Number(letter.letterMeta.max_pages) || 1;
        if (pages > maxPages) console.warn(`  ⚠ [${label}] cover letter runs to ${pages} pages; keep it to ${maxPages}`);
      }
    } catch (err) {
      failed = true;
      console.error(`✗ ${label}: ${err.message}`);
    }
  }
} finally {
  await browser.close();
}
process.exitCode = failed ? 1 : 0;
