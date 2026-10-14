// Turns positioned text items (as produced by pdf.js getTextContent) into
// visual lines made of "cells" — runs of text separated by column-sized gaps.

/**
 * @typedef {{str: string, x: number, y: number, w: number, h: number}} Item
 * @typedef {{text: string, x0: number, x1: number}} Cell
 * @typedef {{page: number, y: number, h: number, cells: Cell[], text: string}} Line
 */

/** Convert a raw pdf.js text item into our Item shape. */
export function fromPdfJsItem(it) {
  const t = it.transform || [1, 0, 0, 1, 0, 0];
  const h = it.height || Math.hypot(t[2], t[3]) || 10;
  return { str: it.str || '', x: t[4], y: t[5], w: it.width || 0, h };
}

/**
 * Group items of one page into lines and cells.
 * @param {Item[]} items
 * @param {number} page
 * @returns {Line[]}
 */
export function itemsToLines(items, page = 1) {
  const clean = items.filter((i) => i.str && i.str.trim() !== '');
  if (!clean.length) return [];
  // PDF y grows upwards: sort top-to-bottom, then left-to-right.
  clean.sort((a, b) => b.y - a.y || a.x - b.x);

  const rows = [];
  for (const it of clean) {
    const tol = Math.max(2, Math.min(it.h, 14) * 0.45);
    let row = null;
    for (let i = rows.length - 1; i >= 0 && i >= rows.length - 3; i--) {
      if (Math.abs(rows[i].y - it.y) <= tol) {
        row = rows[i];
        break;
      }
    }
    if (!row) {
      row = { y: it.y, h: it.h, items: [] };
      rows.push(row);
    }
    row.items.push(it);
    row.h = Math.max(row.h, it.h);
  }

  return rows.map((r) => {
    r.items.sort((a, b) => a.x - b.x);
    const cells = [];
    for (const it of r.items) {
      const text = it.str.replace(/\s+/g, ' ');
      const x0 = it.x;
      const x1 = it.x + (it.w || estimateWidth(it));
      const prev = cells[cells.length - 1];
      // Gap threshold ~ 1.2 average character widths: word spacing stays inside a
      // cell, column spacing starts a new one.
      const charW = Math.max(2, (it.h || 10) * 0.5);
      if (prev && x0 - prev.x1 < charW * 1.2) {
        const needsSpace = x0 - prev.x1 > charW * 0.15 && !prev.text.endsWith(' ') && !text.startsWith(' ');
        prev.text += (needsSpace ? ' ' : '') + text;
        prev.x1 = Math.max(prev.x1, x1);
      } else {
        cells.push({ text, x0, x1 });
      }
    }
    for (const c of cells) c.text = c.text.trim();
    const kept = cells.filter((c) => c.text);
    return { page, y: r.y, h: r.h, cells: kept, text: kept.map((c) => c.text).join('  ') };
  });
}

function estimateWidth(it) {
  return it.str.length * (it.h || 10) * 0.5;
}
