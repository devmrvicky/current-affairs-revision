import { describe, it, expect } from 'vitest';
import { delayAfterFailures, getLockRecord, setupPassword, tryUnlock, changePassword } from './authorLockService';
import { hashPassword, verifyPassword } from './authorCrypto';
import { isIdleExpired } from '../../store/authorLockStore';

const FAST = 1_000; // iterations — real default is 600k; the algorithm is identical

describe('password hashing', () => {
  it('verifies the right password and rejects others; salts differ per hash', async () => {
    const a = await hashPassword('correct horse', FAST);
    const b = await hashPassword('correct horse', FAST);
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    expect(await verifyPassword('correct horse', a)).toBe(true);
    expect(await verifyPassword('correct horsf', a)).toBe(false);
  });
  it('never contains the plaintext', async () => {
    const h = await hashPassword('s3cret-pass-phrase', FAST);
    expect(JSON.stringify(h)).not.toContain('s3cret');
  });
});

describe('retry delay', () => {
  it('is free for two mistakes, then doubles up to a cap', () => {
    expect([1, 2, 3, 4, 5].map(delayAfterFailures)).toEqual([0, 0, 5_000, 10_000, 20_000]);
    expect(delayAfterFailures(50)).toBe(15 * 60 * 1000);
  });
});

describe('setup and unlock (persisted in IndexedDB)', () => {
  it('rejects a short password, sets one once, refuses a second setup', async () => {
    expect(await setupPassword('short', FAST)).toEqual({ ok: false, reason: 'too-short' });
    expect(await setupPassword('longenough-1', FAST)).toEqual({ ok: true });
    expect(await setupPassword('another-long-1', FAST)).toEqual({ ok: false, reason: 'already-set' });
    const rec = await getLockRecord();
    expect(rec).toBeTruthy();
    expect(JSON.stringify(rec)).not.toContain('longenough');
  });

  it('throttles after repeated wrong attempts, and the delay survives a "reload" (it is persisted)', async () => {
    const t0 = 1_000_000;
    expect((await tryUnlock('nope-1', t0)).ok).toBe(false);
    expect((await tryUnlock('nope-2', t0)).ok).toBe(false);
    const third = await tryUnlock('nope-3', t0);
    expect(third).toMatchObject({ ok: false, reason: 'wrong', retryAfterMs: 5_000, failedAttempts: 3 });

    // Even the correct password is refused while throttled.
    expect(await tryUnlock('longenough-1', t0 + 1_000)).toMatchObject({ ok: false, reason: 'throttled' });
    // …and accepted once the delay has passed; failures reset.
    expect(await tryUnlock('longenough-1', t0 + 5_001)).toEqual({ ok: true });
    expect((await getLockRecord())!.failedAttempts).toBe(0);
  });

  it('changes the password only with the current one', async () => {
    expect(await changePassword('wrong-current', 'brand-new-pass-1', FAST)).toEqual({ ok: false, reason: 'wrong-current' });
    expect(await changePassword('longenough-1', 'brand-new-pass-1', FAST, 5_000_000)).toEqual({ ok: true });
    expect(await tryUnlock('longenough-1', 6_000_000)).toMatchObject({ ok: false, reason: 'wrong' });
    expect(await tryUnlock('brand-new-pass-1', 9_000_000)).toEqual({ ok: true });
  });
});

describe('inactivity auto-lock', () => {
  it('expires only after the configured idle time; 0 means never', () => {
    expect(isIdleExpired(0, 5, 4 * 60_000)).toBe(false);
    expect(isIdleExpired(0, 5, 5 * 60_000)).toBe(true);
    expect(isIdleExpired(0, 0, 10 ** 12)).toBe(false);
  });
});
