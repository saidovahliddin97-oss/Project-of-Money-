// CSV output + seen-id cache so the same discussion is never processed twice.
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';

export const COLUMNS = ['source', 'source_url', 'keyword', 'title', 'discovered_at', 'created_at', 'relevance_score', 'generated_reply', 'reply_engine', 'publication_status', 'last_error'];

const esc = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function loadSeen(file) {
  return new Set(existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : []);
}

export function saveSeen(file, seen) {
  writeFileSync(file, JSON.stringify([...seen].slice(-5000)));
}

export function appendRows(file, rows) {
  if (!existsSync(file)) writeFileSync(file, COLUMNS.join(',') + '\n');
  if (rows.length) appendFileSync(file, rows.map((r) => COLUMNS.map((c) => esc(r[c])).join(',')).join('\n') + '\n');
}
