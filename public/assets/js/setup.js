import { generateKeyPair } from './core/license.js';

const priv = document.getElementById('priv');
const copy = document.getElementById('copy');
document.getElementById('gen').addEventListener('click', async () => {
  const { privateJwk } = await generateKeyPair();
  priv.value = JSON.stringify(privateJwk);
  copy.disabled = false;
});
copy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(priv.value);
    copy.textContent = 'Copied ✓';
  } catch {
    priv.select();
  }
});
fetch('/api/health')
  .then((r) => r.json())
  .then((h) => (document.getElementById('health').textContent = JSON.stringify(h, null, 2)))
  .catch(() => (document.getElementById('health').textContent = 'API not reachable (static hosting without functions?)'));
