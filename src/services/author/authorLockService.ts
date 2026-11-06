// ─── Author Lock: setup, unlock, retry delay ─────────────────────────────────
// Persists only { salt, hash, iterations, failedAttempts, lockedUntil } in the
// private authorMeta store. Whether the studio is currently *unlocked* is held in
// memory only (see store/authorLockStore.ts), so a restart always locks it again.
// The retry delay is persisted too — reloading the page does not reset it.

import { getDB } from '../db';
import type { AuthorLockRecord } from '../../types/authorStudio';
import { DEFAULT_ITERATIONS, MIN_PASSWORD_LENGTH, hashPassword, verifyPassword } from './authorCrypto';

/** No delay for the first two mistakes; then 5 s, 10 s, 20 s… capped at 15 minutes. */
export function delayAfterFailures(failures: number): number {
  if (failures < 3) return 0;
  return Math.min(5_000 * 2 ** (failures - 3), 15 * 60 * 1000);
}

export type UnlockResult =
  | { ok: true }
  | { ok: false; reason: 'no-password' }
  | { ok: false; reason: 'throttled'; retryAfterMs: number }
  | { ok: false; reason: 'wrong'; retryAfterMs: number; failedAttempts: number };

export async function getLockRecord(): Promise<AuthorLockRecord | null> {
  const db = await getDB();
  const rec = await db.get('authorMeta', 'lock');
  return rec && rec.key === 'lock' ? rec : null;
}

export async function hasPassword(): Promise<boolean> {
  return (await getLockRecord()) !== null;
}

export type SetupResult = { ok: true } | { ok: false; reason: 'too-short' | 'already-set' };

export async function setupPassword(password: string, iterations: number = DEFAULT_ITERATIONS, now: number = Date.now()): Promise<SetupResult> {
  if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, reason: 'too-short' };
  // Hash FIRST. An IndexedDB transaction auto-commits as soon as it has no pending request, so awaiting
  // Web Crypto (real time) while one is open would leave the later put() on a dead transaction.
  const h = await hashPassword(password, iterations);
  const db = await getDB();
  // Inside the transaction: only IndexedDB requests — check-then-write cannot race with a second tab.
  const tx = db.transaction('authorMeta', 'readwrite');
  if (await tx.store.get('lock')) { await tx.done; return { ok: false, reason: 'already-set' }; }
  await tx.store.put({ key: 'lock', ...h, createdAt: now, failedAttempts: 0, lockedUntil: 0 });
  await tx.done;
  return { ok: true };
}

export async function tryUnlock(password: string, now: number = Date.now()): Promise<UnlockResult> {
  const rec = await getLockRecord();
  if (!rec) return { ok: false, reason: 'no-password' };
  if (rec.lockedUntil > now) return { ok: false, reason: 'throttled', retryAfterMs: rec.lockedUntil - now };

  const db = await getDB();
  if (await verifyPassword(password, rec)) {
    await db.put('authorMeta', { ...rec, failedAttempts: 0, lockedUntil: 0 });
    return { ok: true };
  }
  const failedAttempts = rec.failedAttempts + 1;
  const wait = delayAfterFailures(failedAttempts);
  await db.put('authorMeta', { ...rec, failedAttempts, lockedUntil: wait > 0 ? now + wait : 0 });
  return { ok: false, reason: 'wrong', retryAfterMs: wait, failedAttempts };
}

export type ChangePasswordResult = { ok: true } | { ok: false; reason: 'wrong-current' | 'too-short' | 'no-password' | 'throttled' };

export async function changePassword(current: string, next: string, iterations: number = DEFAULT_ITERATIONS, now: number = Date.now()): Promise<ChangePasswordResult> {
  if (next.length < MIN_PASSWORD_LENGTH) return { ok: false, reason: 'too-short' };
  const verified = await tryUnlock(current, now);
  if ('reason' in verified) return { ok: false, reason: verified.reason === 'wrong' ? 'wrong-current' : verified.reason };
  const rec = (await getLockRecord())!;
  const h = await hashPassword(next, iterations);
  const db = await getDB();
  await db.put('authorMeta', { ...rec, ...h, failedAttempts: 0, lockedUntil: 0 });
  return { ok: true };
}
