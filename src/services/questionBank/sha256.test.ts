// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { sha256Hex } from './sha256';

async function reference(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

describe('sha256Hex', () => {
  it('matches the standard test vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('agrees with the platform\'s WebCrypto on varied text, including Hindi, emoji, the NIST 56-byte string and every padding boundary', async () => {
    const samples = ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', ...[54, 55, 56, 57, 63, 64, 65, 119, 120, 1000].map((n) => 'a'.repeat(n)),
      'प्रश्न: भारत की राजधानी क्या है?', '😀 mixed — dashes “quotes”', JSON.stringify({ id: 'x', q: [1, 2, 3] }, null, 2)];
    for (const text of samples) expect(sha256Hex(text)).toBe(await reference(text));
  });
});
