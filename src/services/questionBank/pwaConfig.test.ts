// @vitest-environment node
// Guards the service-worker rules that stop the manifest from ever being served stale (see vite.config.ts).
import { describe, expect, it } from 'vitest';
import config from '../../../vite.config.ts?raw';
import headers from '../../../public/_headers?raw';
import manifestText from '../../../public/data/question-bank/manifest.json?raw';

const manifest = JSON.parse(manifestText);

describe('PWA / HTTP caching for the question bank', () => {
  it('the manifest and test files are NetworkFirst (never cache-first / stale-while-revalidate)', () => {
    const rule = (needle: string) => { const i = config.indexOf(needle); expect(i).toBeGreaterThan(-1); return config.slice(i, i + 400); };
    expect(rule('manifest\\.json')).toMatch(/handler: 'NetworkFirst'/);
    expect(rule('tests\\/')).toMatch(/handler: 'NetworkFirst'/);
    expect(config).not.toMatch(/question-bank[^]{0,300}(CacheFirst|StaleWhileRevalidate)/);
  });
  it('the URL patterns actually match the manifest and test files (and nothing else)', () => {
    const pattern = (name: string) => { const m = new RegExp(`urlPattern: /(.*${name}.*)/i,`).exec(config); expect(m).not.toBeNull(); return new RegExp(m![1], 'i'); };
    const manifestRe = pattern('manifest');
    expect(manifestRe.test('https://app.example/data/question-bank/manifest.json')).toBe(true);
    expect(manifestRe.test('/data/question-bank/manifest.json?v=2')).toBe(true);
    expect(manifestRe.test('/data/question-bank/manifest.json.bak')).toBe(false);
    expect(manifestRe.test('/assets/manifest.json')).toBe(false);
    const testsRe = pattern('tests');
    expect(testsRe.test('https://app.example/data/question-bank/tests/avg-1.json')).toBe(true);
    expect(testsRe.test('/data/question-bank/tests/a/b.json')).toBe(true);
    expect(testsRe.test('/data/question-bank/manifest.json')).toBe(false);
  });
  it('JSON is not precached, so a stale manifest can never be baked into the service worker', () => {
    const glob = /globPatterns:\s*\[([^\]]*)\]/.exec(config)![1];
    expect(glob).not.toMatch(/json/);
  });
  it('the manifest is served with revalidation', () => {
    expect(headers).toMatch(/\/data\/question-bank\/\*\s+Cache-Control: no-cache/);
  });
  it('an empty, valid manifest ships with the app', () => {
    expect(manifest).toEqual({ version: 1, updatedAt: '1970-01-01T00:00:00.000Z', tests: [] });
  });
});
