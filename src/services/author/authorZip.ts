// ─── Minimal ZIP reader/writer (no dependency) ───────────────────────────────
// Writing: "stored" entries (no compression) with CRC-32 and UTF-8 names — question JSON is
// small, and a stored ZIP is opened by every unzip tool.
// Reading: stored and deflate entries (deflate through the browser's DecompressionStream),
// hardened against hostile archives: path traversal, absurd entry counts or sizes (zip bombs),
// encrypted and ZIP64 archives are refused, and every entry's CRC-32 is verified.

export interface ZipEntry {
  path: string;
  data: Uint8Array;
}

export interface ZipLimits {
  maxEntries: number;
  maxEntryBytes: number;
  maxTotalBytes: number;
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = { maxEntries: 20_000, maxEntryBytes: 50 * 1024 * 1024, maxTotalBytes: 500 * 1024 * 1024 };

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipError';
  }
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Normalises a stored name and refuses anything that could write outside the intended folder. */
export function safeZipPath(raw: string): string {
  const path = raw.replace(/\\/g, '/');
  if (path.includes('\u0000')) throw new ZipError(`Unsafe path in archive: "${raw}"`);
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) throw new ZipError(`Absolute path in archive: "${raw}"`);
  const parts = path.split('/').filter((p) => p !== '' && p !== '.');
  if (parts.some((p) => p === '..')) throw new ZipError(`Path escapes the archive: "${raw}"`);
  return parts.join('/');
}

function dosDateTime(d: Date): { date: number; time: number } {
  const year = Math.max(1980, d.getFullYear());
  return { date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(), time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1) };
}

export function createZip(entries: ZipEntry[], when: Date = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const { date, time } = dosDateTime(when);
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const e of entries) {
    const name = enc.encode(safeZipPath(e.path));
    const crc = crc32(e.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, e.data.length, true);
    local.setUint32(22, e.data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), name, e.data);

    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, 0, true);
    cen.setUint16(12, time, true);
    cen.setUint16(14, date, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, e.data.length, true);
    cen.setUint32(24, e.data.length, true);
    cen.setUint16(28, name.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + e.data.length;
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let pos = 0;
  for (const c of all) { out.set(c, pos); pos += c.length; }
  return out;
}

async function inflateRaw(data: Uint8Array, maxBytes: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new ZipError('This browser cannot read compressed ZIP files. Use a backup made by Author Studio, or update your browser.');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) { await reader.cancel(); throw new ZipError('An entry expands to more than the allowed size (possible zip bomb).'); }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) { out.set(p, pos); pos += p.length; }
  return out;
}

export async function readZip(bytes: Uint8Array, limits: ZipLimits = DEFAULT_ZIP_LIMITS): Promise<ZipEntry[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65_535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new ZipError('This is not a ZIP file (end-of-archive marker not found).');

  const count = view.getUint16(eocd + 10, true);
  const cenSize = view.getUint32(eocd + 12, true);
  let ptr = view.getUint32(eocd + 16, true);
  if (count === 0xffff || cenSize === 0xffffffff || ptr === 0xffffffff) throw new ZipError('ZIP64 archives are not supported.');
  if (count > limits.maxEntries) throw new ZipError(`The archive has ${count} entries; the limit is ${limits.maxEntries}.`);
  if (ptr + cenSize > bytes.length) throw new ZipError('The ZIP directory is damaged.');

  const dec = new TextDecoder('utf-8');
  const out: ZipEntry[] = [];
  let total = 0;

  for (let n = 0; n < count; n++) {
    if (ptr + 46 > bytes.length || view.getUint32(ptr, true) !== 0x02014b50) throw new ZipError('The ZIP directory is damaged.');
    const flags = view.getUint16(ptr + 8, true);
    const method = view.getUint16(ptr + 10, true);
    const crc = view.getUint32(ptr + 16, true);
    const compSize = view.getUint32(ptr + 20, true);
    const size = view.getUint32(ptr + 24, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localOffset = view.getUint32(ptr + 42, true);
    const rawName = dec.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    ptr += 46 + nameLen + extraLen + commentLen;

    if (rawName.endsWith('/')) continue; // folder marker
    if (flags & 1) throw new ZipError('Encrypted ZIP files are not supported.');
    if (compSize === 0xffffffff || size === 0xffffffff) throw new ZipError('ZIP64 archives are not supported.');
    const path = safeZipPath(rawName);
    if (!path) continue;
    if (size > limits.maxEntryBytes) throw new ZipError(`"${path}" is larger than the ${limits.maxEntryBytes / 1048576} MB per-file limit.`);
    total += size;
    if (total > limits.maxTotalBytes) throw new ZipError('The archive is larger than the allowed total size.');

    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== 0x04034b50) throw new ZipError(`The entry "${path}" is damaged.`);
    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    const raw = bytes.subarray(dataStart, dataStart + compSize);
    if (raw.length !== compSize) throw new ZipError(`The entry "${path}" is truncated.`);

    let data: Uint8Array;
    if (method === 0) data = raw;
    else if (method === 8) data = await inflateRaw(raw, Math.min(limits.maxEntryBytes, size + 1));
    else throw new ZipError(`"${path}" uses an unsupported compression method (${method}).`);

    if (data.length !== size) throw new ZipError(`"${path}" does not match its recorded size — the archive is damaged.`);
    if (crc32(data) !== crc) throw new ZipError(`"${path}" failed its checksum — the archive is damaged.`);
    out.push({ path, data });
  }
  return out;
}
