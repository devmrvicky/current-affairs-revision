import { describe, expect, it } from 'vitest';
import { crc32, createZip, readZip, safeZipPath, ZipError } from './authorZip';

const enc = new TextEncoder();
const dec = new TextDecoder();
const err = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e as Error; } };

/** One-entry ZIP using real DEFLATE, built by hand — proves the reader handles archives made by other tools. */
async function deflateZip(path: string, text: string): Promise<Uint8Array> {
  const raw = enc.encode(text);
  const comp = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  const name = enc.encode(path);
  const local = new DataView(new ArrayBuffer(30));
  local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(8, 8, true);
  local.setUint32(14, crc32(raw), true); local.setUint32(18, comp.length, true); local.setUint32(22, raw.length, true); local.setUint16(26, name.length, true);
  const cen = new DataView(new ArrayBuffer(46));
  cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(10, 8, true);
  cen.setUint32(16, crc32(raw), true); cen.setUint32(20, comp.length, true); cen.setUint32(24, raw.length, true); cen.setUint16(28, name.length, true); cen.setUint32(42, 0, true);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, 1, true); end.setUint16(10, 1, true);
  const cenSize = 46 + name.length; end.setUint32(12, cenSize, true); end.setUint32(16, 30 + name.length + comp.length, true);
  const parts = [new Uint8Array(local.buffer), name, comp, new Uint8Array(cen.buffer), name, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(enc.encode('123456789'))).toBe(0xcbf43926);
  });
});

describe('zip round trip', () => {
  it('stores and returns files byte-for-byte, including Hindi names and folders', async () => {
    const entries = [
      { path: 'bank/गणित/औसत 01.json', data: enc.encode('[{"id":1,"question":"औसत?"}]') },
      { path: 'manifest.json', data: enc.encode('{}') },
      { path: 'empty.json', data: new Uint8Array(0) },
    ];
    const back = await readZip(createZip(entries));
    expect(back.map((e) => e.path)).toEqual(entries.map((e) => e.path));
    expect(dec.decode(back[0].data)).toBe('[{"id":1,"question":"औसत?"}]');
    expect(back[2].data.length).toBe(0);
  });
  it('reads DEFLATE-compressed entries made by other tools', async () => {
    const text = 'repeat '.repeat(2000);
    const [e] = await readZip(await deflateZip('big.json', text));
    expect(dec.decode(e.data)).toBe(text);
  });
});

describe('hostile or damaged archives', () => {
  it('rejects non-zip input', async () => {
    expect((await err(readZip(enc.encode('hello world, definitely not a zip file!!'))))?.message).toMatch(/not a ZIP/);
  });
  it('detects a flipped byte via checksum', async () => {
    const zip = createZip([{ path: 'a.json', data: enc.encode('[1,2,3]') }]);
    const bad = zip.slice(); bad[30 + 'a.json'.length + 1] ^= 0xff;
    expect((await err(readZip(bad)))?.message).toMatch(/checksum/);
  });
  it('refuses path traversal and absolute paths', () => {
    for (const p of ['../evil.json', 'a/../../evil.json', '/etc/passwd', 'C:/x.json', 'a\\..\\b.json']) expect(() => safeZipPath(p)).toThrow(ZipError);
    expect(safeZipPath('a//b/./c.json')).toBe('a/b/c.json');
  });
  it('enforces entry-count and size limits', async () => {
    const zip = createZip([{ path: 'a.json', data: new Uint8Array(100) }, { path: 'b.json', data: new Uint8Array(100) }]);
    expect((await err(readZip(zip, { maxEntries: 1, maxEntryBytes: 1e6, maxTotalBytes: 1e6 })))?.message).toMatch(/entries/);
    expect((await err(readZip(zip, { maxEntries: 5, maxEntryBytes: 50, maxTotalBytes: 1e6 })))?.message).toMatch(/per-file limit/);
    expect((await err(readZip(zip, { maxEntries: 5, maxEntryBytes: 1e6, maxTotalBytes: 150 })))?.message).toMatch(/total size/);
  });
  it('stops a deflate bomb that lies about its size', async () => {
    const zip = await deflateZip('bomb.json', 'A'.repeat(5_000_000));
    // Forge a small declared size so the declared-size check passes; the stream guard must still stop it.
    const v = new DataView(zip.buffer);
    const nameLen = 'bomb.json'.length;
    const cenAt = zip.length - 22 - (46 + nameLen);
    v.setUint32(cenAt + 24, 1000, true);
    expect((await err(readZip(zip, { maxEntries: 5, maxEntryBytes: 1_000_000, maxTotalBytes: 1e7 })))?.message).toMatch(/zip bomb|recorded size/);
  });
  it('refuses encrypted entries', async () => {
    const zip = createZip([{ path: 'a.json', data: enc.encode('[]') }]);
    const v = new DataView(zip.buffer);
    const cenAt = zip.length - 22 - (46 + 'a.json'.length);
    v.setUint16(cenAt + 8, v.getUint16(cenAt + 8, true) | 1, true);
    expect((await err(readZip(zip)))?.message).toMatch(/Encrypted/);
  });
  it('rejects a truncated archive', async () => {
    const zip = createZip([{ path: 'a.json', data: enc.encode('[1]') }]);
    expect(await err(readZip(zip.slice(0, zip.length - 10)))).toBeTruthy();
  });
});
