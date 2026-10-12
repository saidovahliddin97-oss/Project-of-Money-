// Reply generation with a bounded self-correction loop:
// validate input → generate → validate → (≤2 corrective retries) → final check → fallback.
import { topicOf } from './score.js';
import { LlmQuotaError } from './llm.js';

const FORBIDDEN = [/guarantee/i, /100% accurate/i, /\bOCR\b(?![^.]*\b(no|not)\b)/i, /free forever/i, /best tool ever/i, /\bAI-powered\b/i];
const URL_RE = /https?:\/\//i;

export function validateReply(text, { policy, product }) {
  const problems = [];
  if (typeof text !== 'string' || !text.trim()) return ['empty reply'];
  if (text.length < 250) problems.push('too short (min 250 characters)');
  if (text.length > 1400) problems.push('too long (max 1400 characters)');
  for (const re of FORBIDDEN) if (re.test(text)) problems.push(`contains a forbidden claim (${re})`);
  const mentions = text.includes(product.url) || /localledger/i.test(text);
  if (policy === 'none' && (mentions || URL_RE.test(text))) problems.push('must not mention the product or include links on this site');
  if (policy === 'disclose' && mentions && !/(I built|I made|disclosure|I'm the (developer|maker))/i.test(text)) problems.push('product mention needs an explicit affiliation disclosure');
  return problems;
}

export function templateReply(item, { policy, product }) {
  const { target, input, card } = topicOf(item);
  const app = { quickbooks: 'QuickBooks', xero: 'Xero', quicken: 'Quicken', gnucash: 'GnuCash', ynab: 'YNAB', excel: 'Excel', spreadsheet: 'a spreadsheet' }[target];
  const fmt = { quickbooks: 'a 3-column CSV (Date, Description, Amount)', xero: "Xero's CSV template (*Date, *Amount, Payee, Description, Reference)", quicken: 'QIF', gnucash: 'OFX or QIF', ynab: 'OFX or a CSV', excel: '.xlsx or CSV', spreadsheet: 'CSV' }[target];
  const lines = [
    `A few things that usually save time when getting ${input === 'pdf' ? 'PDF statements' : 'statement data'} into ${app}:`,
    '',
    `1. Check online banking first — many banks let you export CSV/OFX for recent months, which is cleaner than any PDF conversion.`,
    `2. For older months that only exist as PDFs, use a converter that reads the table layout rather than copy-paste (copy-paste breaks wrapped descriptions and debit/credit columns).`,
    `3. Aim for ${fmt}; keep one consistent date format and money-out as negative amounts.`,
    `4. Before importing, reconcile: opening balance + all transactions should equal the closing balance on the statement. If it is off by exactly twice one amount, a sign got flipped.`,
  ];
  if (card) lines.push(`5. Card statements show purchases as positive numbers; most accounting apps expect them negative, so flip the signs.`);
  if (policy === 'disclose') {
    lines.push('', `Disclosure: I built ${product.name} (${product.url}), ${product.pitch}. Limitations: ${product.limitations}. Happy to hear if it fails on your bank's layout.`);
  }
  return lines.join('\n');
}

export async function generateReply(item, { llm, policy, product }) {
  if (!item || !item.title || !item.url) return { ok: false, reply: '', engine: 'none', error: 'invalid input' };
  if (!llm || !llm.enabled) return { ok: true, reply: templateReply(item, { policy, product }), engine: 'template' };

  const linkRule =
    policy === 'none'
      ? 'Do NOT mention any product, brand or URL.'
      : `You may mention ${product.name} (${product.url}) only if genuinely useful, and then you MUST say "Disclosure: I built it". Facts about it: ${product.pitch}. Limitations: ${product.limitations}.`;
  const base = [
    { role: 'system', content: 'You write short, genuinely helpful forum replies for bookkeeping/personal-finance questions. Plain text, 3–6 short paragraphs or steps, 250–1200 characters. Never invent features, statistics or guarantees.' },
    { role: 'user', content: `Question title: ${item.title}\nQuestion text: ${item.text.slice(0, 1200)}\n\nRules: ${linkRule}\nReturn only the reply text.` },
  ];
  let messages = base;
  let lastProblems = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    let text;
    try {
      text = await llm.chat(messages);
    } catch (e) {
      const reason = e instanceof LlmQuotaError ? `llm stopped: ${e.message}` : e.message;
      return { ok: true, reply: templateReply(item, { policy, product }), engine: 'template', error: reason };
    }
    lastProblems = validateReply(text, { policy, product });
    if (!lastProblems.length) return { ok: true, reply: text, engine: 'llm', attempts: attempt + 1 };
    messages = [...base, { role: 'assistant', content: text }, { role: 'user', content: `Fix these problems and return only the corrected reply: ${lastProblems.join('; ')}` }];
  }
  return { ok: true, reply: templateReply(item, { policy, product }), engine: 'template', error: `llm output rejected: ${lastProblems.join('; ')}` };
}
