// ─── Author Lock cryptography ────────────────────────────────────────────────
// PBKDF2-HMAC-SHA-256 through the browser's Web Crypto API, with a random
// per-password salt. Only the salt, the iteration count and the derived hash are
// ever stored — never the password.
//
// This is a client-side PRIVACY GATE: it keeps a casual person with your unlocked
// device out of the Author Studio screen. It is not server-side authentication and
// not device encryption: the question files themselves are stored unencrypted in this
// browser's IndexedDB, so anyone with access to the browser profile can read them.

export const DEFAULT_ITERATIONS = 600_000; // OWASP guidance for PBKDF2-HMAC-SHA-256
export const MIN_PASSWORD_LENGTH = 8;

const encoder = new TextEncoder();

export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomSalt(length = 16): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
  return new Uint8Array(bits);
}

export interface PasswordHash {
  salt: string;
  hash: string;
  iterations: number;
}

export async function hashPassword(password: string, iterations: number = DEFAULT_ITERATIONS): Promise<PasswordHash> {
  const salt = randomSalt();
  const hash = await derive(password, salt, iterations);
  return { salt: toBase64(salt), hash: toBase64(hash), iterations };
}

/** Compares without an early exit, so timing does not reveal how many leading bytes matched. */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyPassword(password: string, stored: PasswordHash): Promise<boolean> {
  const candidate = await derive(password, fromBase64(stored.salt), stored.iterations);
  return constantTimeEqual(candidate, fromBase64(stored.hash));
}
