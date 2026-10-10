import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, signLicense, verifyLicense } from '../../public/assets/js/core/license.js';

test('license keys sign and verify; tampering is detected', async () => {
  const { privateJwk, publicJwk } = await generateKeyPair();
  const key = await signLicense({ email: ' Buyer@Example.com ', ref: 'inv-1', issuedAt: 1760000000 }, privateJwk);
  assert.match(key, /^LL1\.[\w-]+\.[\w-]+$/);
  const ok = await verifyLicense(key, publicJwk);
  assert.deepEqual(ok, { valid: true, email: 'buyer@example.com', plan: 'pro', ref: 'inv-1', issuedAt: 1760000000 });

  const [p, body, sig] = key.split('.');
  const forged = Buffer.from(JSON.stringify({ v: 1, e: 'thief@example.com', p: 'pro', r: 'x', t: 1 })).toString('base64url');
  assert.equal((await verifyLicense(`${p}.${forged}.${sig}`, publicJwk)).valid, false);
  assert.equal((await verifyLicense('garbage', publicJwk)).valid, false);
  assert.equal((await verifyLicense(`${p}.${body}.AAAA`, publicJwk)).valid, false);
  const other = await generateKeyPair();
  assert.equal((await verifyLicense(key, other.publicJwk)).valid, false);
  assert.equal((await verifyLicense(key, null)).valid, false);
  // Whitespace/newlines from copy-paste are tolerated.
  assert.equal((await verifyLicense(key.slice(0, 20) + '\n ' + key.slice(20), publicJwk)).valid, true);
});
