// After payment lava.top sends the buyer here. We ask our server to confirm the
// payment with lava.top and issue the license key.
import { claim, activate, pendingInvoice, clearPendingInvoice } from './pro.js';

const $ = (s) => document.querySelector(s);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function show(id) {
  for (const el of document.querySelectorAll('[data-state]')) el.hidden = el.dataset.state !== id;
}

async function run(invoiceId) {
  show('checking');
  const started = Date.now();
  for (;;) {
    let r;
    try {
      r = await claim(invoiceId);
    } catch {
      r = { httpStatus: 0 };
    }
    if (r.httpStatus === 200 && r.license) {
      await activate(r.license);
      clearPendingInvoice();
      $('#license').value = r.license;
      $('#license-email').textContent = r.email;
      // Send the buyer back to the product they paid for.
      const back = document.querySelector('[data-state=done] a.btn');
      if (back && r.plan === 'iif') {
        back.href = '/iif';
        back.textContent = 'Go to IIF Kit';
      }
      if (back && (r.plan === 'bundle' || r.plan === 'pass')) {
        back.insertAdjacentHTML('afterend', ' <a class="btn btn-ghost" href="/iif">Open IIF Kit</a>');
        back.textContent = 'Open LocalLedger';
      }
      show('done');
      return;
    }
    if (r.httpStatus === 202 && Date.now() - started < 600000) {
      $('#checking-msg').textContent = 'Waiting for the payment provider to confirm your payment…';
      await new Promise((res) => setTimeout(res, 4000));
      continue;
    }
    $('#error-msg').textContent =
      r.httpStatus === 202
        ? 'Your payment is still being processed. Keep this page open and press "Check again" in a minute.'
        : r.error || 'We could not confirm this payment.';
    show('error');
    return;
  }
}

$('#copy')?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('#license').value);
    $('#copy').textContent = 'Copied ✓';
  } catch {
    $('#license').select();
  }
});

$('#manual-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = e.target.order.value.trim();
  if (!UUID_RE.test(id)) {
    $('#manual-msg').textContent = 'That does not look like an order id (it has the form 8-4-4-4-12 characters).';
    return;
  }
  run(id);
});

$('#retry')?.addEventListener('click', () => {
  const id = new URLSearchParams(location.search).get('order') || pendingInvoice();
  if (id) run(id);
});

const id = new URLSearchParams(location.search).get('order') || pendingInvoice();
if (id && UUID_RE.test(id)) run(id);
else show('manual');
