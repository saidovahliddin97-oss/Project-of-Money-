// Reads a PDF with pdf.js and returns layout lines for the statement parser.
// `pdfjs` is injected so the same code runs in the browser and in Node tests.

import { fromPdfJsItem, itemsToLines } from './pdf-layout.js';

/**
 * @param {any} pdfjs the pdf.js module
 * @param {Uint8Array} data
 * @param {{password?: string, maxPages?: number}} [opts]
 * @returns {Promise<{lines: import('./pdf-layout.js').Line[], pages: number, textItems: number}>}
 */
export async function extractLines(pdfjs, data, opts = {}) {
  const task = pdfjs.getDocument({
    data,
    password: opts.password,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
  });
  const doc = await task.promise;
  const pages = Math.min(doc.numPages, opts.maxPages || 200);
  const lines = [];
  let textItems = 0;
  try {
    for (let p = 1; p <= pages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items = content.items.filter((it) => typeof it.str === 'string').map(fromPdfJsItem);
      textItems += items.length;
      lines.push(...itemsToLines(items, p));
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return { lines, pages, textItems };
}
