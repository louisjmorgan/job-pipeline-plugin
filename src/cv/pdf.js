import { chromium } from 'playwright';

export const launchBrowser = () => chromium.launch();

/** Renders an HTML string to a PDF buffer. Page size and margins come from the template's @page CSS. */
export async function htmlToPdf(browser, html) {
  const page = await browser.newPage();
  try {
    // networkidle so web fonts finish loading before we print.
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    // Templates that lay out with a script mark <html data-layout="pending"> until they finish.
    await page.waitForFunction(() => document.documentElement.dataset.layout !== 'pending', null, { timeout: 10_000 });
    return await page.pdf({ preferCSSPageSize: true, printBackground: true, tagged: true, outline: true });
  } finally {
    await page.close();
  }
}
