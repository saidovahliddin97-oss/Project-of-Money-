// После оплаты lava.top возвращает покупателя сюда: подтверждаем оплату на сервере и выдаём ключ.
import { claim, activate, pendingInvoice, clearPendingInvoice } from './pro.js';

const $ = (s) => document.querySelector(s);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const show = (id) => { for (const el of document.querySelectorAll('[data-state]')) el.hidden = el.dataset.state !== id; };

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
      show('done');
      return;
    }
    if (r.httpStatus === 202 && Date.now() - started < 600000) {
      $('#checking-msg').textContent = 'Ждём подтверждения от платёжного сервиса…';
      await new Promise((res) => setTimeout(res, 4000));
      continue;
    }
    $('#error-msg').textContent = r.httpStatus === 202 ? 'Платёж ещё обрабатывается. Не закрывайте страницу и нажмите «Проверить ещё раз» через минуту.' : 'Не удалось подтвердить этот платёж.';
    show('error');
    return;
  }
}

$('#copy')?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('#license').value);
    $('#copy').textContent = 'Скопировано ✓';
  } catch {
    $('#license').select();
  }
});
$('#manual-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = e.target.order.value.trim();
  if (!UUID_RE.test(id)) {
    $('#manual-msg').textContent = 'Номер заказа выглядит как 8-4-4-4-12 символов.';
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
