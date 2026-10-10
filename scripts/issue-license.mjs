// Issue a license by hand, e.g. for a customer who paid by invoice, a reviewer,
// or to re-send a lost key.  Usage:
//   npm run issue-license -- buyer@example.com [reference]
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { signLicense, verifyLicense } from '../public/assets/js/core/license.js';

const [email, ref = `manual-${new Date().toISOString().slice(0, 10)}`] = process.argv.slice(2);
if (!email || !email.includes('@')) {
  console.error('Usage: npm run issue-license -- buyer@example.com [reference]');
  process.exit(1);
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, '.secrets', 'license-private.jwk.json');
const raw = process.env.LICENSE_PRIVATE_JWK || (existsSync(file) ? readFileSync(file, 'utf8') : null);
if (!raw) {
  console.error('No private key: run `npm run keys` first or set LICENSE_PRIVATE_JWK.');
  process.exit(1);
}
const priv = JSON.parse(raw);
const license = await signLicense({ email, ref }, priv);
const check = await verifyLicense(license, { kty: priv.kty, crv: priv.crv, x: priv.x, y: priv.y });
if (!check.valid) {
  console.error('Could not verify the issued key:', check.reason);
  process.exit(1);
}
console.log(license);
