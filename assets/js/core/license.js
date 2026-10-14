// License keys: "LL1.<base64url(JSON payload)>.<base64url(ECDSA P-256 signature)>".
// The server signs with a private key kept in an environment secret; the
// browser verifies offline with the public key in license-pubkey.js.
// Works in browsers, Cloudflare Workers and Node >= 20 (WebCrypto).

const PREFIX = 'LL1';
const ALG = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN = { name: 'ECDSA', hash: 'SHA-256' };

const te = new TextEncoder();
const td = new TextDecoder();

export function b64urlEncode(bytes) {
  let bin = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function generateKeyPair() {
  const kp = await crypto.subtle.generateKey(ALG, true, ['sign', 'verify']);
  const privateJwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const publicJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
  return { privateJwk, publicJwk };
}

/**
 * @param {{email: string, plan?: string, ref: string, issuedAt?: number}} data
 * @param {JsonWebKey} privateJwk
 */
export async function signLicense(data, privateJwk) {
  const payload = {
    v: 1,
    e: String(data.email || '').trim().toLowerCase(),
    p: data.plan || 'pro',
    r: String(data.ref || ''),
    t: data.issuedAt || Math.floor(Date.now() / 1000),
  };
  const key = await crypto.subtle.importKey('jwk', privateJwk, ALG, false, ['sign']);
  const body = b64urlEncode(te.encode(JSON.stringify(payload)));
  const signed = `${PREFIX}.${body}`;
  const sig = await crypto.subtle.sign(SIGN, key, te.encode(signed));
  return `${signed}.${b64urlEncode(new Uint8Array(sig))}`;
}

/**
 * @param {string} license
 * @param {JsonWebKey|null} publicJwk
 * @returns {Promise<{valid: true, email: string, plan: string, ref: string, issuedAt: number} | {valid: false, reason: string}>}
 */
export async function verifyLicense(license, publicJwk) {
  if (!publicJwk) return { valid: false, reason: 'Licensing is not configured on this site.' };
  const key = String(license || '').trim().replace(/\s+/g, '');
  const parts = key.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return { valid: false, reason: 'This does not look like a LocalLedger license key.' };
  let payload;
  try {
    payload = JSON.parse(td.decode(b64urlDecode(parts[1])));
  } catch {
    return { valid: false, reason: 'The license key is damaged (could not decode it).' };
  }
  try {
    const pub = await crypto.subtle.importKey('jwk', publicJwk, ALG, false, ['verify']);
    const ok = await crypto.subtle.verify(SIGN, pub, b64urlDecode(parts[2]), te.encode(`${parts[0]}.${parts[1]}`));
    if (!ok) return { valid: false, reason: 'The license key signature is not valid.' };
  } catch {
    return { valid: false, reason: 'The license key signature is not valid.' };
  }
  if (payload.v !== 1 || !payload.e) return { valid: false, reason: 'Unsupported license version.' };
  return { valid: true, email: payload.e, plan: payload.p, ref: payload.r, issuedAt: payload.t };
}
