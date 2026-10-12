// Builds public/guides/*.html and public/sitemap.xml from the content below.
// Run: node scripts/build-guides.mjs   (SITE_URL=https://your.domain to override)
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = (process.env.SITE_URL || 'https://localledger.pages.dev').replace(/\/$/, '');
const UPDATED = '2026-10-10';

const cta = (text = 'Convert your statement now — free preview, nothing uploaded') => `
<div class="cta-box">
  <p><strong>Try it with your own statement.</strong> LocalLedger reads the PDF or CSV in your browser, shows every transaction for review and checks the totals against the statement balances.</p>
  <a class="btn" href="/app.html">${text}</a>
</div>`;

const guides = [
  {
    slug: 'convert-pdf-bank-statement-to-excel',
    title: 'How to convert a PDF bank statement to Excel (without retyping)',
    description: 'Three ways to get transactions from a PDF bank statement into Excel or Google Sheets, what goes wrong with copy-paste, and how to check the result against your balances.',
    body: `
<p>Banks love PDFs; spreadsheets do not. If you need last year's transactions in Excel for a budget, a tax return, a loan application or a bookkeeping catch-up, you have three realistic options.</p>
<h2>Option 1: Download a CSV or Excel file from online banking</h2>
<p>Before converting anything, check whether your bank offers an export. Look for <em>Download</em>, <em>Export</em> or <em>Statements &amp; documents</em> in online banking. Many banks let you export CSV for recent months only — older history is often available just as PDF statements, which is why converters exist.</p>
<h2>Option 2: Copy and paste from the PDF</h2>
<p>Works for a page or two. In practice you will usually hit these problems:</p>
<ul>
  <li>Columns collapse into one cell, or every word lands in its own cell.</li>
  <li>Descriptions that wrap onto a second line become separate rows.</li>
  <li>Debits and credits sit in separate columns, so you have to build a signed amount yourself.</li>
  <li>Dates without a year (<code>01/05</code>) or in day-first format are misread by Excel.</li>
  <li>Page headers and footers ("Page 2 of 6", "continued") end up in the middle of your data.</li>
</ul>
<h2>Option 3: Use a statement converter</h2>
<p>A converter reads the layout of the page — where the date, description, amount and balance columns are — and rebuilds proper rows. What to look for:</p>
<ul>
  <li><strong>Where your file goes.</strong> Most online converters upload the statement to their server. LocalLedger processes it inside your browser instead, so the file never leaves your computer.</li>
  <li><strong>Signed amounts.</strong> You want one Amount column where money out is negative, plus optional Money In / Money Out columns.</li>
  <li><strong>A totals check.</strong> If opening balance + transactions ≠ closing balance, a row was missed or misread.</li>
  <li><strong>Editing before export.</strong> No converter is perfect on every layout; being able to fix a row beats re-doing the file.</li>
</ul>
<h2>Step by step with LocalLedger</h2>
<ol>
  <li>Open the <a href="/app.html">converter</a> and drop one or more PDF statements on it.</li>
  <li>Check the file summary: it shows how many transactions were found and whether they reconcile with the statement balances.</li>
  <li>Review the table. Rows highlighted in yellow had no sign in the statement — confirm them or use the ± button.</li>
  <li>Choose <strong>Excel (.xlsx)</strong> and press <strong>Download</strong>. Dates are real Excel dates and amounts are numbers, so you can sort, filter and build pivot tables immediately.</li>
</ol>
<h2>Scanned statements</h2>
<p>If you cannot select text in the PDF, it is an image (a scan or a photo). Text-based converters, including LocalLedger, cannot read it; you would need OCR software first. Statements downloaded from online banking are almost always text-based.</p>
${cta()}`,
  },
  {
    slug: 'import-bank-statement-into-quickbooks-online',
    title: 'How to import a bank statement into QuickBooks Online (CSV, step by step)',
    description: 'Upload missing bank transactions to QuickBooks Online from a PDF or CSV statement: the CSV layout QBO expects, the upload steps, and how to avoid duplicates.',
    body: `
<p>QuickBooks Online can pull transactions from a bank feed, but feeds break, start late, or never covered the months you need. In that case you can upload a file. This guide shows how to turn a statement into a file QuickBooks Online accepts and how to upload it.</p>
<h2>The CSV layout QuickBooks Online accepts</h2>
<p>QuickBooks Online reads a simple CSV in one of two shapes:</p>
<table>
  <tr><th>3-column</th><th>4-column</th></tr>
  <tr><td>Date, Description, Amount (money out negative)</td><td>Date, Description, Credit, Debit</td></tr>
</table>
<p>Dates must be in one consistent format, such as <code>MM/DD/YYYY</code> or <code>DD/MM/YYYY</code>. Avoid extra header rows, totals rows and currency symbols. LocalLedger's <strong>QuickBooks Online (CSV)</strong> export produces the 3-column layout.</p>
<h2>Step 1 — Convert the statement</h2>
<ol>
  <li>Drop the PDF (or the bank's CSV) into the <a href="/app.html">LocalLedger converter</a>.</li>
  <li>Check that the totals reconcile and fix any highlighted rows.</li>
  <li>Under <em>Options</em>, choose the CSV date format your QuickBooks company uses.</li>
  <li>Export <strong>QuickBooks Online (CSV)</strong>.</li>
</ol>
<h2>Step 2 — Upload to QuickBooks Online</h2>
<ol>
  <li>In QuickBooks Online go to <strong>Transactions → Bank transactions</strong> (called <em>Banking</em> in some versions).</li>
  <li>Open the account menu or <strong>Link account</strong> drop-down and choose <strong>Upload from file</strong>.</li>
  <li>Select the CSV file and choose the QuickBooks account it belongs to.</li>
  <li>Map the columns: Date → Date, Description → Description, Amount → Amount ("one column"). Pick the matching date format.</li>
  <li>Select the transactions to import and confirm. They appear in the <em>For review</em> tab, where you categorise or match them.</li>
</ol>
<p>Menu names change from time to time; if you cannot find <em>Upload from file</em>, search QuickBooks help for "upload bank transactions".</p>
<h2>Avoiding duplicates</h2>
<ul>
  <li>Only upload the date range the bank feed does <em>not</em> cover. Delete overlapping rows in LocalLedger before exporting.</li>
  <li>When combining several statements, use <strong>Remove duplicates</strong> in LocalLedger.</li>
  <li>Imported rows land in <em>For review</em> — nothing hits your books until you accept them.</li>
</ul>
<h2>Credit card statements</h2>
<p>Upload card statements to the credit card account in QuickBooks. LocalLedger exports purchases as negative amounts and payments or refunds as positive, which is what QuickBooks expects for a one-column upload.</p>
${cta()}`,
  },
  {
    slug: 'import-bank-statement-into-xero',
    title: 'How to import a bank statement into Xero from a PDF or CSV',
    description: 'Get missing statement lines into Xero: prepare a CSV in Xero\'s layout, import it into the bank account, and reconcile.',
    body: `
<p>Xero lets you import statement lines manually when there is no bank feed, the feed started late, or a period is missing. Xero accepts CSV, OFX, QIF and QBO files. CSV is the most predictable.</p>
<h2>The CSV layout for Xero</h2>
<p>Xero's statement template uses these columns: <code>*Date</code>, <code>*Amount</code>, <code>Payee</code>, <code>Description</code>, <code>Reference</code> (plus optional coding columns). Columns marked with * are required. Money out is negative. The date format must match your organisation's regional settings — for most regions outside the US that is <code>DD/MM/YYYY</code>.</p>
<p>LocalLedger's <strong>Xero (CSV)</strong> export produces exactly these columns, with a payee guessed from the description.</p>
<h2>Step 1 — Convert the statement</h2>
<ol>
  <li>Drop the statement into the <a href="/app.html">converter</a>.</li>
  <li>Confirm the balances reconcile; fix highlighted rows.</li>
  <li>Under <em>Options</em>, set the CSV date format to match your Xero organisation.</li>
  <li>Export <strong>Xero (CSV)</strong>.</li>
</ol>
<h2>Step 2 — Import into Xero</h2>
<ol>
  <li>In Xero, open <strong>Accounting → Bank accounts</strong>.</li>
  <li>Find the account, open <strong>Manage account</strong> and choose <strong>Import a statement</strong>.</li>
  <li>Browse to the CSV file and click <strong>Import</strong>.</li>
  <li>Assign the columns if Xero asks (Date, Amount, Payee, Description, Reference) and save.</li>
  <li>The lines appear in the bank account ready to <strong>reconcile</strong>.</li>
</ol>
<h2>Tips</h2>
<ul>
  <li>Xero warns about lines it has already imported, but it is still safest to import only the missing period.</li>
  <li>If a statement line is wrong after import, you can delete imported statement lines from the account's statement view and import a corrected file.</li>
  <li>Keep one file per bank account. Do not mix two accounts in one import.</li>
</ul>
${cta()}`,
  },
  {
    slug: 'convert-csv-to-qif',
    title: 'Convert CSV to QIF for Quicken, GnuCash, Moneydance and other finance apps',
    description: 'What a QIF file is, which apps still import it, and how to turn a bank CSV or PDF statement into a valid QIF file.',
    body: `
<p>QIF (Quicken Interchange Format) is an old, plain-text format for transactions. It is still useful because many personal-finance programs import it: GnuCash, Moneydance, Banktivity, HomeBank and older or specific versions of Quicken among them. Check your program's import documentation for which account types accept QIF.</p>
<h2>What a QIF file looks like</h2>
<pre>!Type:Bank
D01/05/2026
T-4.50
PCOFFEE HOUSE
MCOFFEE HOUSE #123 SEATTLE WA
^</pre>
<p><code>D</code> is the date, <code>T</code> the signed amount, <code>P</code> the payee, <code>M</code> a memo, and <code>^</code> ends each transaction. Credit card files start with <code>!Type:CCard</code>.</p>
<h2>Converting a CSV or PDF statement to QIF</h2>
<ol>
  <li>Open the <a href="/app.html">converter</a> and drop your bank CSV export or PDF statement.</li>
  <li>For CSV files, LocalLedger maps the Date, Description, Amount (or Debit/Credit) columns automatically. Check the preview.</li>
  <li>Choose <strong>QIF</strong> and download. Card statements are written as <code>CCard</code>, bank statements as <code>Bank</code>.</li>
</ol>
<h2>Common QIF problems</h2>
<ul>
  <li><strong>Day/month swapped:</strong> QIF has no date-format header. LocalLedger writes <code>MM/DD/YYYY</code> by default; choose <code>DD/MM/YYYY</code> under Options if your program expects that.</li>
  <li><strong>Duplicates:</strong> QIF has no transaction ids, so importing the same file twice usually duplicates rows. Prefer OFX if your program supports it.</li>
  <li><strong>Wrong account type:</strong> some programs only accept QIF into specific account types or into a new file — check their help pages.</li>
</ul>
${cta()}`,
  },
  {
    slug: 'convert-csv-to-ofx',
    title: 'Convert a bank CSV or PDF statement to OFX',
    description: 'OFX is the most reliable file for importing transactions into finance apps because every transaction carries a unique id. Here is how to create one from CSV or PDF.',
    body: `
<p>OFX (Open Financial Exchange) is the format banks use for "download to accounting software". Unlike CSV and QIF, every transaction in an OFX file has a unique id (FITID), so finance apps can skip transactions they have already imported.</p>
<h2>Which apps import OFX?</h2>
<p>GnuCash, Moneydance, YNAB (file import), Banktivity, HomeBank, Microsoft Money Plus Sunset, Xero and many others accept OFX. Quicken expects its own variant (QFX) for some import paths, so QIF or CSV may be the better choice there.</p>
<h2>How to create an OFX file</h2>
<ol>
  <li>Drop your CSV export or PDF statement into the <a href="/app.html">converter</a>.</li>
  <li>Under <em>Options</em>, set the currency (for example USD, EUR, GBP) and optionally an account number so your app links the file to the right account.</li>
  <li>Review the transactions, then choose <strong>OFX</strong> and download.</li>
</ol>
<h2>What LocalLedger puts in the file</h2>
<ul>
  <li>OFX 1.0.2 (SGML), the version supported most widely.</li>
  <li>A stable FITID per transaction, built from date, amount and description. Re-exporting the same statement produces the same ids, so a careful app will not duplicate them.</li>
  <li>A bank-account or credit-card statement block depending on the statement type.</li>
  <li>The last running balance from the statement as the ledger balance, when available.</li>
</ul>
${cta()}`,
  },
  {
    slug: 'credit-card-statement-to-csv',
    title: 'Credit card statement to CSV: getting the signs right',
    description: 'Why credit card statements show purchases as positive numbers, and how to convert a card statement PDF to CSV with correct money-in / money-out signs for accounting software.',
    body: `
<p>Credit card statements are written from the card issuer's point of view: a purchase <em>increases</em> what you owe, so it is printed as a positive number, and a payment is printed as negative (or marked CR). Accounting and budgeting tools usually want the opposite: purchases are money out (negative), payments and refunds are money in (positive).</p>
<h2>How LocalLedger handles it</h2>
<ul>
  <li>It recognises card statements from phrases like "credit limit", "minimum payment" or "new balance" and flips the signs automatically.</li>
  <li>You can force the statement type under <em>Options → Statement type</em>.</li>
  <li>The totals check works the card way round: previous balance + purchases − payments = new balance.</li>
  <li>If your target app wants the issuer's convention, use <strong>Flip all signs</strong> before exporting.</li>
</ul>
<h2>Trans date vs post date</h2>
<p>Many card statements print two dates. LocalLedger uses the first (transaction) date and ignores the posting date.</p>
<h2>Steps</h2>
<ol>
  <li>Drop the card statement PDF into the <a href="/app.html">converter</a>.</li>
  <li>Confirm the file is detected as "credit card" and that the balances reconcile.</li>
  <li>Export CSV, Excel, QuickBooks Online CSV, Xero CSV, QIF (<code>!Type:CCard</code>) or OFX (credit card statement).</li>
</ol>
${cta()}`,
  },
  {
    slug: 'check-converted-bank-transactions',
    title: 'How to check that converted bank transactions are complete and correct',
    description: 'A 5-minute checklist to verify transactions extracted from a PDF statement before importing them into your books: reconciliation, counts, signs and duplicates.',
    body: `
<p>Whatever tool you use to extract transactions from statements, verify the output before it reaches your accounting system. Fixing a missing row now takes seconds; finding it during year-end reconciliation takes hours.</p>
<h2>1. Reconcile to the statement balances</h2>
<p>Opening balance + sum of all transactions must equal the closing balance (for card statements: previous balance − payments + purchases = new balance). LocalLedger does this automatically for every file and shows <em>✓ balances reconcile</em> or the exact difference.</p>
<h2>2. Compare totals</h2>
<p>Most statements print total money in and total money out. Compare them with the <em>Money in</em> and <em>Money out</em> figures above the LocalLedger table.</p>
<h2>3. Look at the signs</h2>
<p>Rows without a +/− marker in the statement are highlighted. A reversed sign is the most common extraction error and it breaks reconciliation by exactly twice the amount — a useful hint when the difference is not zero.</p>
<h2>4. Check the date range and year</h2>
<p>Statements that print dates without a year (<code>12/28</code>) and span December–January need the right year on each side. Sort by date and look at the first and last rows.</p>
<h2>5. Remove overlaps</h2>
<p>If you combine consecutive statements or a statement and a CSV export, use <em>Remove duplicates</em> and make sure you only import periods your accounting system does not already have.</p>
${cta()}`,
  },
  {
    slug: 'is-it-safe-to-upload-bank-statements-online',
    title: 'Is it safe to upload bank statements to online converters?',
    description: 'What is in a bank statement, what happens when you upload it to a conversion website, and how to convert statements without sending them anywhere.',
    body: `
<p>A bank statement contains your name, address, account number, often a sort code or routing number, every merchant you paid and your balance. That is exactly the kind of data that is valuable to fraudsters and that privacy laws treat as sensitive.</p>
<h2>What happens when you upload a file</h2>
<p>Most online converters work by uploading your file to their servers, processing it there (sometimes with third-party OCR or AI services), and returning the result. Reputable services encrypt files in transit and delete them after a while — but you have to trust their policies, their subcontractors and their security. If you are an accountant, the data belongs to your client, which raises the bar further.</p>
<h2>Questions to ask before uploading</h2>
<ul>
  <li>Where are the files stored, and for how long?</li>
  <li>Are files used to train models or shared with processors?</li>
  <li>Does the service hold a security certification relevant to you?</li>
  <li>Would your client be comfortable with this service having their statements?</li>
</ul>
<h2>The alternative: convert locally</h2>
<p>LocalLedger is a web page that does the conversion inside your browser with JavaScript. The PDF is read on your device and the result is generated on your device. You can verify this yourself: open the browser's developer tools (Network tab) while converting — you will see no upload of your file. You can even disconnect from the internet after the page has loaded and it keeps working.</p>
<p>Local processing is not a cure-all: keep your computer up to date, and store the exported files as carefully as the statements themselves.</p>
${cta('Convert locally — nothing is uploaded')}`,
  },
  {
    slug: 'convert-pdf-bank-statement-to-csv',
    title: 'How to convert a PDF bank statement to CSV',
    description: 'Turn a PDF bank statement into a clean CSV file with date, description and amount columns, without uploading it, and avoid the usual problems with dates, signs and delimiters.',
    body: `
<p>Most banks let you download statements as PDF, but a PDF is made for reading, not for sorting, filtering or importing. A CSV (comma-separated values) file opens in Excel, Google Sheets, Numbers and is accepted by most accounting and budgeting tools. This guide shows how to get from one to the other and what to check on the way.</p>
<h2>Option 1: export CSV from online banking</h2>
<p>If your bank offers a CSV or Excel export for the period you need, use it. It is the most accurate source. The catch: many banks only offer a limited history or no export at all for older months, and some only give PDFs for closed statement periods. That is where converting the PDF helps.</p>
<h2>Option 2: convert the PDF in your browser</h2>
<ol>
  <li>Download the statement PDF from your bank. It must be a text-based PDF (you can select and copy text in it), not a photo or scan.</li>
  <li>Open LocalLedger and drop the PDF onto the page. The file is read inside your browser and is not sent to a server.</li>
  <li>Review the table of transactions: date, description and amount.</li>
  <li>Check the reconciliation message. Opening balance plus the transactions should equal the closing balance.</li>
  <li>Download the result as CSV.</li>
</ol>
<h2>What to check before you use the CSV</h2>
<ul>
  <li><strong>Balances reconcile.</strong> If they do not, a row is missing, duplicated or has the wrong sign. See <a href="/guides/check-converted-bank-transactions.html">how to check converted transactions</a>.</li>
  <li><strong>Dates.</strong> Statements often print <code>03/04/2026</code>, which is 3 April in many countries and 4 March in the US. Compare the first and last rows with the statement period.</li>
  <li><strong>Signs.</strong> Money out should be negative (or in a separate column), money in positive. A flipped sign is the most common error.</li>
  <li><strong>Several months.</strong> If you combine statements, remove duplicate rows where periods overlap.</li>
</ul>
<h2>Opening the CSV in Excel without surprises</h2>
<p>Excel decides how to read a CSV from your regional settings. In countries that use a comma as the decimal separator, Excel expects a semicolon as the list separator, so a comma-separated file may land in a single column. If that happens, use <em>Data → From Text/CSV</em> and pick the delimiter manually, or open the file in Google Sheets with <em>File → Import</em>. Long account or reference numbers can also lose leading zeros if Excel treats them as numbers; import those columns as text.</p>
<h2>When CSV is not the best format</h2>
<p>If your goal is an accounting system, a bank-feed format may save you work: see <a href="/guides/convert-csv-to-qif.html">CSV to QIF</a>, <a href="/guides/convert-csv-to-ofx.html">CSV to OFX</a>, or the step-by-step guides for <a href="/guides/import-bank-statement-into-quickbooks-online.html">QuickBooks Online</a> and <a href="/guides/import-bank-statement-into-xero.html">Xero</a>. For QuickBooks Desktop, which cannot import a bank CSV, use <a href="/iif">IIF Kit</a>. If you want a spreadsheet to work in directly, read <a href="/guides/convert-pdf-bank-statement-to-excel.html">PDF to Excel</a>.</p>
<h2>Keep the files safe</h2>
<p>Because conversion happens locally, nothing leaves your computer, but the CSV still contains your transactions. Store it like the original statement and delete copies you no longer need.</p>
${cta()}`,
  },
];


// Bank-specific landing pages (programmatic SEO). Facts here are deliberately general and true for
// any text-based statement; per-region details drive the differences between pages.
const REGION = {
  us: { name: 'US', dates: 'MM/DD (month first), often without the year on each row', apps: ['QuickBooks Online', 'QuickBooks Desktop', 'Xero', 'Excel'], cur: 'USD' },
  ca: { name: 'Canadian', dates: 'a mix of "Jan 05" and numeric day-first or month-first dates', apps: ['QuickBooks Online', 'Xero', 'Excel'], cur: 'CAD' },
  uk: { name: 'UK', dates: 'DD/MM or "05 Jan", and the date is often printed only once per day', apps: ['Xero', 'QuickBooks Online', 'FreeAgent (via CSV)', 'Excel'], cur: 'GBP' },
};
const banks = [
  ['chase', 'Chase', 'us', 'both'], ['bank-of-america', 'Bank of America', 'us', 'both'], ['wells-fargo', 'Wells Fargo', 'us', 'both'],
  ['citi', 'Citi', 'us', 'both'], ['capital-one', 'Capital One', 'us', 'both'], ['us-bank', 'U.S. Bank', 'us', 'both'],
  ['pnc', 'PNC', 'us', 'bank'], ['truist', 'Truist', 'us', 'bank'], ['td-bank', 'TD Bank', 'us', 'bank'],
  ['american-express', 'American Express', 'us', 'card'], ['discover', 'Discover', 'us', 'card'],
  ['rbc', 'RBC Royal Bank', 'ca', 'both'], ['td-canada-trust', 'TD Canada Trust', 'ca', 'both'], ['scotiabank', 'Scotiabank', 'ca', 'both'],
  ['bmo', 'BMO', 'ca', 'both'], ['cibc', 'CIBC', 'ca', 'both'],
  ['barclays', 'Barclays', 'uk', 'both'], ['hsbc-uk', 'HSBC UK', 'uk', 'both'], ['lloyds', 'Lloyds Bank', 'uk', 'both'], ['natwest', 'NatWest', 'uk', 'both'],
].map(([slug, name, region, kind]) => ({ slug, name, region, kind }));

function bankBody(b) {
  const r = REGION[b.region];
  const card = b.kind !== 'bank';
  const acct = b.kind === 'card' ? 'credit card' : b.kind === 'bank' ? 'checking and savings' : 'checking, savings and credit card';
  const qbd = b.region === 'us'
    ? `<p>Using <strong>QuickBooks Desktop</strong>? Convert to CSV here, then turn the CSV into an .IIF file with <a href="/iif">IIF Kit</a> — rules like <code>shell =&gt; Fuel</code> map each row to your accounts.</p>`
    : '';
  return `
<p>Need ${esc(b.name)} transactions in a spreadsheet or your accounting software, but only have PDF statements? LocalLedger reads text-based ${esc(b.name)} ${acct} statements <strong>inside your browser</strong> — the file is never uploaded — and rebuilds clean rows: date, description, signed amount and balance.</p>
<h2>Step 1: Get the PDF from ${esc(b.name)}</h2>
<p>Sign in to ${esc(b.name)} online banking, open the account and look for <em>Statements</em> (sometimes under <em>Statements &amp; documents</em> or the account menu). Download each month as PDF. Statements downloaded this way contain real text, which is what a converter needs. A scan or a phone photo of a paper statement does not — run OCR on it first.</p>
<p>Only need the last few weeks? Online banking may offer a direct CSV or Excel download of recent activity — use it. PDF conversion is for older months and for statements someone sent you.</p>
<h2>Step 2: Convert it</h2>
<ol>
  <li>Open the <a href="/app.html">converter</a> and drop one or more ${esc(b.name)} PDFs on it (several months at once is fine).</li>
  <li>Check the summary: opening balance + transactions should equal the closing balance. A mismatch means a row was missed or misread.</li>
  <li>Review the table, fix anything odd, remove duplicates if months overlap.</li>
  <li>Download: ${r.apps.map(esc).join(', ')}, CSV, QIF or OFX.</li>
</ol>
<h2>What is different about ${r.name} statements</h2>
<ul>
  <li><strong>Dates:</strong> ${r.name} statements usually use ${r.dates}. LocalLedger detects the order from the whole file and fills in the year from the statement period.</li>
  <li><strong>Amounts:</strong> debits and credits are often in separate columns or marked with signs like CR/DR. You get one signed Amount column (money out negative) plus optional Money In / Money Out.</li>
${card ? `  <li><strong>Credit cards:</strong> card statements print purchases as positive numbers. For your books they are money out, so LocalLedger detects card statements and flips the signs — payments to the card become positive.</li>\n` : ''}  <li><strong>Currency:</strong> amounts are kept as printed (${r.cur}); no conversion is applied.</li>
</ul>
${qbd}
<h2>Is it safe?</h2>
<p>Most online converters upload your statement to their server. LocalLedger does the work with JavaScript on your own device, so the statement never leaves it. See <a href="/guides/is-it-safe-to-upload-bank-statements-online.html">is it safe to upload bank statements online?</a></p>
<h2>If your statement is not read correctly</h2>
<p>Bank layouts change. If a ${esc(b.name)} statement converts with missing or wrong rows, email <a href="mailto:ahlak2049@gmail.com">ahlak2049@gmail.com</a> with a description of the problem (no need to send the statement) — and you can always correct rows in the table before exporting.</p>
<p class="muted small">LocalLedger is an independent tool and is not affiliated with or endorsed by ${esc(b.name)}. Bank names are trademarks of their owners and are used only to describe compatibility.</p>
${cta(`Convert a ${b.name} statement — free preview`)}`;
}

const header = `  <header class="site-header">
    <a class="brand" href="/"><img src="/assets/img/logo.svg" alt="" width="28" height="28"> LocalLedger</a>
    <nav>
      <a href="/guides/">Guides</a>
      <a href="/banks/">Banks</a>
      <a href="/#pricing">Pricing</a>
      <a class="btn btn-small" href="/app.html">Open converter</a>
    </nav>
  </header>`;
const footer = `  <footer class="site-footer">
    <div class="container">
      <span>© 2026 LocalLedger</span>
      <span><a href="/guides/">Guides</a> · <a href="/banks/">Banks</a> · <a href="/iif">IIF Kit for QuickBooks Desktop</a> · <a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms &amp; refunds</a> · <a href="/success.html">Retrieve license</a> · <a href="mailto:ahlak2049@gmail.com">Support</a></span>
    </div>
  </footer>`;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function page({ title, description, path, body, jsonLd }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${SITE}${path}">
  <link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:image" content="${SITE}/assets/img/og.png">
  <link rel="stylesheet" href="/assets/css/style.css">
  <script src="/assets/js/ui.js"></script>
  <script src="/assets/js/pv.js" defer></script>
${jsonLd ? `  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>\n` : ''}</head>
<body>
${header}
  <main class="container narrow article">
${body}
  </main>
${footer}
</body>
</html>
`;
}

const dir = join(root, 'public', 'guides');
mkdirSync(dir, { recursive: true });

for (const g of guides) {
  const others = guides.filter((o) => o !== g).slice(0, 4);
  const related = `<h2>Related guides</h2>\n<ul>\n${others.map((o) => `  <li><a href="/guides/${o.slug}.html">${esc(o.title)}</a></li>`).join('\n')}\n</ul>`;
  const body = `    <p class="crumbs"><a href="/">Home</a> › <a href="/guides/">Guides</a></p>
    <h1>${esc(g.title)}</h1>
    <p class="muted">Updated ${UPDATED}</p>
${g.body}
${related}`;
  writeFileSync(
    join(dir, `${g.slug}.html`),
    page({
      title: `${g.title} | LocalLedger`,
      description: g.description,
      path: `/guides/${g.slug}.html`,
      body,
      jsonLd: { '@context': 'https://schema.org', '@type': 'Article', headline: g.title, description: g.description, dateModified: UPDATED, author: { '@type': 'Organization', name: 'LocalLedger' } },
    }),
  );
}

writeFileSync(
  join(dir, 'index.html'),
  page({
    title: 'Guides: bank statements, Excel, QuickBooks, Xero, QIF, OFX | LocalLedger',
    description: 'Practical guides for converting bank and credit card statements and importing them into Excel, QuickBooks Online, Xero and personal finance apps.',
    path: '/guides/',
    body: `    <h1>Guides</h1>
    <p class="muted">Practical, step-by-step help for getting statement data where you need it.</p>
    <ul class="guide-list">
${guides.map((g) => `      <li><a href="/guides/${g.slug}.html">${esc(g.title)}<span>${esc(g.description)}</span></a></li>`).join('\n')}
    </ul>
${cta('Open the converter')}`,
  }),
);


const bdir = join(root, 'public', 'banks');
mkdirSync(bdir, { recursive: true });
for (const b of banks) {
  const title = `Convert ${b.name} PDF statements to Excel, CSV or QuickBooks`;
  const description = `Turn ${b.name} PDF bank statements into Excel, CSV, QuickBooks, Xero, QIF or OFX in your browser. Nothing is uploaded; totals are checked against the statement balance.`;
  const peers = banks.filter((o) => o.region === b.region && o !== b).slice(0, 5);
  const faq = [
    [`Can I convert ${b.name} statements without uploading them?`, 'Yes. The conversion runs in your browser; the PDF is never sent to a server.'],
    [`Is it free?`, 'You can preview every transaction and export up to 15 rows free. LocalLedger Pro is a one-time $29 payment for unlimited exports.'],
    [`Does it work with scanned ${b.name} statements?`, 'No. It needs text-based PDFs, like the ones downloaded from online banking. Scans need OCR first.'],
  ];
  const body = `    <p class="crumbs"><a href="/">Home</a> › <a href="/banks/">Banks</a></p>
    <h1>${esc(title)}</h1>
    <p class="muted">Updated ${UPDATED}</p>
${bankBody(b)}
<h2>FAQ</h2>
${faq.map(([q, a]) => `<h3>${esc(q)}</h3>\n<p>${esc(a)}</p>`).join('\n')}
<h2>Other ${REGION[b.region].name} banks</h2>
<ul>
${peers.map((o) => `  <li><a href="/banks/${o.slug}.html">${esc(o.name)} statement converter</a></li>`).join('\n')}
</ul>`;
  writeFileSync(join(bdir, `${b.slug}.html`), page({
    title: `${title} | LocalLedger`, description, path: `/banks/${b.slug}.html`, body,
    jsonLd: { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
  }));
}
writeFileSync(join(bdir, 'index.html'), page({
  title: 'Bank statement converters by bank — US, Canada, UK | LocalLedger',
  description: 'Convert PDF statements from Chase, Bank of America, Wells Fargo, RBC, TD, Barclays, HSBC and more to Excel, CSV, QuickBooks or Xero — in your browser.',
  path: '/banks/',
  body: `    <h1>Convert statements by bank</h1>
    <p class="muted">LocalLedger reads text-based PDF statements from any bank. These pages cover the specifics for the most common ones.</p>
${['us', 'ca', 'uk'].map((rg) => `    <h2>${REGION[rg].name} banks</h2>\n    <ul class="guide-list">\n${banks.filter((b) => b.region === rg).map((b) => `      <li><a href="/banks/${b.slug}.html">${esc(b.name)}<span>PDF statement → Excel, CSV, ${esc(REGION[rg].apps[0])}</span></a></li>`).join('\n')}\n    </ul>`).join('\n')}
${cta('Open the converter')}`,
}));

const urls = ['/', '/app.html', '/iif', '/guides/', ...guides.map((g) => `/guides/${g.slug}.html`), '/banks/', ...banks.map((b) => `/banks/${b.slug}.html`), '/privacy.html', '/terms.html'];
writeFileSync(
  join(root, 'public', 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${UPDATED}</lastmod></url>`).join('\n')}\n</urlset>\n`,
);
writeFileSync(
  join(root, 'public', 'robots.txt'),
  `User-agent: *\nAllow: /\nDisallow: /setup.html\nDisallow: /admin.html\nDisallow: /success.html\nDisallow: /cancel.html\nSitemap: ${SITE}/sitemap.xml\n`,
);
console.log(`Wrote ${guides.length} guides, ${banks.length} bank pages, guides index and sitemap.xml for ${SITE}`);
