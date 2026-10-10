// Generates synthetic but realistic statement PDFs (fictional banks and data)
// that mimic common real-world layouts. Run: npm run fixtures
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'pdf');
mkdirSync(out, { recursive: true });

async function makeDoc(build) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx = {
    doc,
    page: null,
    y: 0,
    newPage() {
      this.page = doc.addPage([612, 792]);
      this.y = 740;
    },
    text(str, x, opts = {}) {
      const f = opts.bold ? bold : font;
      const size = opts.size || 9;
      let px = x;
      if (opts.align === 'right') px = x - f.widthOfTextAtSize(str, size);
      this.page.drawText(str, { x: px, y: opts.y ?? this.y, size, font: f, color: rgb(0, 0, 0) });
    },
    down(n = 14) {
      this.y -= n;
    },
  };
  ctx.newPage();
  await build(ctx);
  return doc.save();
}

// 1) US checking account: Date | Description | Amount | Balance, MM/DD without year.
const us = await makeDoc(async (c) => {
  c.text('FICTIONAL NATIONAL BANK', 50, { bold: true, size: 14 });
  c.down(18);
  c.text('Statement period: January 1, 2026 through January 31, 2026', 50);
  c.down(12);
  c.text('Account number: XXXXXX1234', 50);
  c.down(24);
  c.text('Beginning Balance', 50);
  c.text('$2,500.00', 560, { align: 'right' });
  c.down(20);
  const header = () => {
    c.text('Date', 50, { bold: true });
    c.text('Description', 100, { bold: true });
    c.text('Amount', 470, { bold: true, align: 'right' });
    c.text('Balance', 560, { bold: true, align: 'right' });
    c.down(16);
  };
  header();
  const rows = [
    ['01/02', 'PAYROLL DEPOSIT ACME CORP', '3,200.00', '5,700.00'],
    ['01/03', 'RENT PAYMENT ONLINE TRANSFER', '-1,800.00', '3,900.00', 'REF 99812 CONFIRMATION 5512'],
    ['01/05', 'COFFEE HOUSE #123 SEATTLE WA', '-4.50', '3,895.50'],
    ['01/09', 'ELECTRIC UTILITY AUTOPAY', '-120.33', '3,775.17'],
    ['01/12', 'ATM WITHDRAWAL 5TH AVE', '-200.00', '3,575.17'],
  ];
  for (const r of rows) {
    c.text(r[0], 50);
    c.text(r[1], 100);
    c.text(r[2], 470, { align: 'right' });
    c.text(r[3], 560, { align: 'right' });
    c.down(12);
    if (r[4]) {
      c.text(r[4], 100);
      c.down(12);
    }
    c.down(2);
  }
  c.text('Page 1 of 2', 280, { y: 40 });
  c.newPage();
  c.text('FICTIONAL NATIONAL BANK - continued', 50, { bold: true });
  c.down(24);
  header();
  const rows2 = [
    ['01/15', 'ONLINE STORE PURCHASE', '-89.99', '3,485.18'],
    ['01/20', 'REFUND ONLINE STORE', '25.00', '3,510.18'],
    ['01/31', 'MONTHLY SERVICE FEE', '-12.00', '3,498.18'],
  ];
  for (const r of rows2) {
    c.text(r[0], 50);
    c.text(r[1], 100);
    c.text(r[2], 470, { align: 'right' });
    c.text(r[3], 560, { align: 'right' });
    c.down(14);
  }
  c.down(10);
  c.text('Ending Balance', 50);
  c.text('$3,498.18', 560, { align: 'right' });
  c.text('Page 2 of 2', 280, { y: 40 });
});

// 2) UK current account: Date | Payment type and details | Paid out | Paid in | Balance.
// Date printed once per day; balance only on the last row of the day.
const uk = await makeDoc(async (c) => {
  c.text('Example Bank plc', 50, { bold: true, size: 14 });
  c.down(18);
  c.text('Your statement 1 January to 31 January 2026', 50);
  c.down(24);
  c.text('Date', 50, { bold: true });
  c.text('Payment type and details', 110, { bold: true });
  c.text('Paid out', 400, { bold: true, align: 'right' });
  c.text('Paid in', 480, { bold: true, align: 'right' });
  c.text('Balance', 560, { bold: true, align: 'right' });
  c.down(16);
  c.text('01 Jan', 50);
  c.text('BALANCE BROUGHT FORWARD', 110);
  c.text('1,000.00', 560, { align: 'right' });
  c.down(14);
  const rows = [
    ['03 Jan', 'DD COUNCIL TAX', '150.00', '', ''],
    ['', 'CARD PAYMENT TO TESCO STORES', '42.10', '', '807.90'],
    ['10 Jan', 'BACS SALARY EXAMPLE LTD', '', '2,100.00', '2,907.90'],
    ['14 Jan', 'SO SAVINGS ACCOUNT', '300.00', '', ''],
    ['', 'CARD PAYMENT TO TRAINLINE', '58.40', '', ''],
    ['', 'FPI REFUND J SMITH', '', '20.00', '2,569.50'],
  ];
  for (const r of rows) {
    if (r[0]) c.text(r[0], 50);
    c.text(r[1], 110);
    if (r[2]) c.text(r[2], 400, { align: 'right' });
    if (r[3]) c.text(r[3], 480, { align: 'right' });
    if (r[4]) c.text(r[4], 560, { align: 'right' });
    c.down(14);
  }
  c.text('31 Jan', 50);
  c.text('BALANCE CARRIED FORWARD', 110);
  c.text('2,569.50', 560, { align: 'right' });
});

// 3) Credit card: Trans Date | Post Date | Description | Amount, charges positive.
const card = await makeDoc(async (c) => {
  c.text('SAMPLE REWARDS CREDIT CARD', 50, { bold: true, size: 14 });
  c.down(18);
  c.text('Statement closing date 02/14/2026    Credit limit $5,000.00', 50);
  c.down(12);
  c.text('Previous Balance', 50);
  c.text('$600.00', 560, { align: 'right' });
  c.down(12);
  c.text('Minimum Payment Due $35.00   Payment Due Date 03/10/2026', 50);
  c.down(24);
  c.text('Trans Date', 50, { bold: true });
  c.text('Post Date', 110, { bold: true });
  c.text('Description', 170, { bold: true });
  c.text('Amount', 560, { bold: true, align: 'right' });
  c.down(16);
  const rows = [
    ['01/16', '01/17', 'PAYMENT - THANK YOU', '-600.00'],
    ['01/18', '01/19', 'GROCERY MARKET 0042 PORTLAND OR', '76.23'],
    ['01/25', '01/26', 'STREAMING SERVICE MONTHLY', '15.99'],
    ['02/01', '02/02', 'AIRLINE TICKET 0123456789', '412.80'],
    ['02/03', '02/04', 'AIRLINE TICKET REFUND', '-50.00'],
  ];
  for (const r of rows) {
    c.text(r[0], 50);
    c.text(r[1], 110);
    c.text(r[2], 170);
    c.text(r[3], 560, { align: 'right' });
    c.down(14);
  }
  c.down(8);
  c.text('New Balance', 50);
  c.text('$455.02', 560, { align: 'right' });
});

// 4) European style: DD.MM.YYYY dates, 1.234,56 amounts, Debit/Credit columns.
const eu = await makeDoc(async (c) => {
  c.text('Musterbank AG - Account statement 01/2026', 50, { bold: true, size: 12 });
  c.down(24);
  c.text('Date', 50, { bold: true });
  c.text('Details', 120, { bold: true });
  c.text('Debit', 400, { bold: true, align: 'right' });
  c.text('Credit', 480, { bold: true, align: 'right' });
  c.text('Balance', 560, { bold: true, align: 'right' });
  c.down(16);
  c.text('Opening balance', 120);
  c.text('1.000,00', 560, { align: 'right' });
  c.down(14);
  const rows = [
    ['02.01.2026', 'Supermarkt Berlin', '45,90', '', '954,10'],
    ['15.01.2026', 'Gehalt Firma GmbH', '', '2.750,00', '3.704,10'],
    ['28.01.2026', 'Miete Januar', '1.200,00', '', '2.504,10'],
  ];
  for (const r of rows) {
    c.text(r[0], 50);
    c.text(r[1], 120);
    if (r[2]) c.text(r[2], 400, { align: 'right' });
    if (r[3]) c.text(r[3], 480, { align: 'right' });
    c.text(r[4], 560, { align: 'right' });
    c.down(14);
  }
  c.text('Closing balance', 120);
  c.text('2.504,10', 560, { align: 'right' });
});

// 5) A PDF with no text layer (like a scan).
const scan = await makeDoc(async (c) => {
  c.page.drawRectangle({ x: 50, y: 500, width: 300, height: 200, color: rgb(0.8, 0.8, 0.8) });
});

for (const [name, bytes] of Object.entries({ us, uk, card, eu, scan })) {
  writeFileSync(join(out, `${name}.pdf`), bytes);
}
console.log('fixtures written to', out);
