// License state, activation and checkout — shared by app.html, index.html and success.html.
import { verifyLicense } from './core/license.js';
import { LICENSE_PUBLIC_JWK } from './license-pubkey.js';
import { CONFIG } from './config.js';
import { track } from './track.js';

const LS_LICENSE = 'll_license';
const LS_PENDING = 'll_pending_invoice';
const LS_PUBKEY = 'll_pubkey';

function lsGet(k) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function lsSet(k, v) {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* private mode: the license then lasts for this page only */
  }
}

let pubkeyPromise = null;
export function getPublicKey() {
  if (LICENSE_PUBLIC_JWK) return Promise.resolve(LICENSE_PUBLIC_JWK);
  if (!pubkeyPromise) {
    pubkeyPromise = (async () => {
      try {
        const res = await fetch('/api/pubkey', { cache: 'no-cache' });
        if (res.ok) {
          const { jwk } = await res.json();
          lsSet(LS_PUBKEY, JSON.stringify(jwk));
          return jwk;
        }
      } catch {
        /* offline: fall back to the cached key */
      }
      const cached = lsGet(LS_PUBKEY);
      return cached ? JSON.parse(cached) : null;
    })();
  }
  return pubkeyPromise;
}


// Each product has its own license plan: 'pro' (LocalLedger) or 'iif' (IIF Kit).
// A 'bundle' key unlocks both and is stored under both products; a 'pass' key does the
// same for PASS_HOURS after the payment.
const storageKey = (plan) => (plan === 'iif' ? `${LS_LICENSE}_iif` : LS_LICENSE);
const covers = (keyPlan, plan) => keyPlan === plan || keyPlan === 'bundle' || keyPlan === 'pass';
const passEnds = (v) => (v.issuedAt + CONFIG.PASS_HOURS * 3600) * 1000;
const expired = (v) => v.plan === 'pass' && Date.now() > passEnds(v);
const memory = {};

/** @returns {Promise<{pro: boolean, email?: string}>} */
export async function getStatus(plan = 'pro') {
  const key = memory[plan] || lsGet(storageKey(plan));
  if (!key) return { pro: false };
  const v = await verifyLicense(key, await getPublicKey());
  if (!v.valid || !covers(v.plan || 'pro', plan)) return { pro: false };
  if (expired(v)) return { pro: false, passExpired: true };
  return v.plan === 'pass' ? { pro: true, email: v.email, until: new Date(passEnds(v)) } : { pro: true, email: v.email };
}

export async function activate(key, expectedPlan) {
  const v = await verifyLicense(key, await getPublicKey());
  if (!v.valid) return v;
  const plan = v.plan || 'pro';
  if (expectedPlan && !covers(plan, expectedPlan)) return { valid: false, reason: `This key is for ${plan === 'iif' ? 'IIF Kit' : 'LocalLedger'}, not this product.` };
  if (expired(v)) return { valid: false, reason: 'This 24-hour pass has expired.' };
  const clean = key.trim().replace(/\s+/g, '');
  for (const p of plan === 'bundle' || plan === 'pass' ? ['pro', 'iif'] : [plan]) {
    memory[p] = clean;
    lsSet(storageKey(p), clean);
  }
  track('license_activated');
  return v;
}

export function deactivate(plan = 'pro') {
  delete memory[plan];
  lsSet(storageKey(plan), null);
}

export function pendingInvoice() {
  return lsGet(LS_PENDING);
}
export function clearPendingInvoice() {
  lsSet(LS_PENDING, null);
}

function utmFromUrl() {
  const p = new URLSearchParams(location.search);
  const utm = {};
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
    const v = p.get(k) || sessionGet(k);
    if (v) utm[k] = v;
  }
  return utm;
}
function sessionGet(k) {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
}
// Remember UTM tags for the session so they survive navigation to app.html.
try {
  const p = new URLSearchParams(location.search);
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) if (p.get(k)) sessionStorage.setItem(k, p.get(k));
} catch {
  /* ignore */
}

export async function startCheckout({ email, currency, method, product = 'ledger' }) {
  track('checkout_start');
  const res = await fetch('/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, currency, method, product, utm: utmFromUrl() }),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok || !data.paymentUrl) throw new Error(data.error || 'Checkout is unavailable right now. Please try again later.');
  lsSet(LS_PENDING, data.invoiceId);
  location.href = data.paymentUrl;
}

export async function claim(invoiceId) {
  const res = await fetch('/api/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoiceId }),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  return { ...data, httpStatus: res.status };
}

// ---------------------------------------------------------------------------
// Upgrade dialog (markup lives in each page as <dialog id="pro-dialog">)

export function initProDialog({ onActivated, product = 'ledger', prices = { USD: CONFIG.PRICE_USD, EUR: CONFIG.PRICE_EUR } } = {}) {
  const plan = product === 'iif' ? 'iif' : 'pro';
  const dlg = document.getElementById('pro-dialog');
  if (!dlg) return { open() {} };
  const form = dlg.querySelector('#checkout-form');
  const err = dlg.querySelector('#checkout-error');
  const actForm = dlg.querySelector('#activate-form');
  const actMsg = dlg.querySelector('#activate-msg');
  const priceEl = dlg.querySelector('[data-price]');
  const cur = dlg.querySelector('#checkout-currency');
  // Optional upsells (both tools, 24-hour pass), shown only when the server has their offers.
  const choiceBox = dlg.querySelector('#bundle-choice');
  const choice = () => dlg.querySelector('input[name=bundle]:checked')?.value || 'single';
  const money = (p) => (cur && cur.value === 'EUR' ? `€${p.EUR}` : `$${p.USD}`);
  const table = {
    single: prices,
    bundle: { USD: CONFIG.PRICE_BUNDLE_USD, EUR: CONFIG.PRICE_BUNDLE_EUR },
    pass: { USD: CONFIG.PRICE_PASS_USD, EUR: CONFIG.PRICE_PASS_EUR },
  };
  const setPrice = () => {
    if (priceEl) priceEl.textContent = money(table[choice()] || prices);
    for (const [k, p] of Object.entries(table)) dlg.querySelectorAll(`[data-${k}-price]`).forEach((el) => (el.textContent = money(p)));
    const once = dlg.querySelector('[data-once]');
    if (once) once.textContent = choice() === 'pass' ? `for ${CONFIG.PASS_HOURS} hours of unlimited use` : 'once';
  };
  cur?.addEventListener('change', setPrice);
  dlg.querySelectorAll('input[name=bundle]').forEach((r) => r.addEventListener('change', setPrice));
  setPrice();
  if (choiceBox) {
    fetch('/api/health', { cache: 'no-store' })
      .then((r) => r.json())
      .then((h) => {
        const on = { bundle: Boolean(h.checkoutBundle), pass: Boolean(h.checkoutPass) };
        dlg.querySelectorAll('[data-offer]').forEach((el) => (el.hidden = !on[el.dataset.offer]));
        choiceBox.hidden = !on.bundle && !on.pass;
        document.querySelectorAll('[data-bundle-only]').forEach((el) => (el.hidden = !on.bundle));
        document.querySelectorAll('[data-pass-only]').forEach((el) => (el.hidden = !on.pass));
      })
      .catch(() => {});
  }
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Opening secure checkout…';
    try {
      await startCheckout({
        email: form.email.value,
        currency: cur ? cur.value : 'USD',
        method: form.method ? form.method.value : 'card',
        product: choice() === 'single' ? product : choice(),
      });
    } catch (ex) {
      err.textContent = ex.message;
      btn.disabled = false;
      btn.textContent = 'Continue to secure checkout';
    }
  });

  actForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = await activate(actForm.key.value, plan);
    actMsg.textContent = v.valid ? `Activated for ${v.email}. Thank you!` : v.reason;
    actMsg.className = v.valid ? 'ok' : 'error';
    if (v.valid) {
      onActivated?.(v);
      setTimeout(() => dlg.close(), 900);
    }
  });

  dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));
  return {
    open(reason, { bundle = false, pass = false } = {}) {
      const pick = dlg.querySelector(`input[name=bundle][value=${bundle ? 'bundle' : pass ? 'pass' : 'single'}]`);
      if (pick) pick.checked = true;
      setPrice();
      const r = dlg.querySelector('#pro-reason');
      if (r) r.textContent = reason || '';
      err.textContent = '';
      if (actMsg) actMsg.textContent = '';
      dlg.showModal();
    },
  };
}
