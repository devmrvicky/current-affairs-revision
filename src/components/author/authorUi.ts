import type { IncomingFile } from '../../services/author/authorImportTree';

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}

export function formatWhen(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function downloadBlob(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Files chosen with an <input type=file> (optionally a folder via webkitdirectory). Non-JSON files are kept so the import can report them. */
export async function readPickedFiles(list: FileList | File[]): Promise<IncomingFile[]> {
  const out: IncomingFile[] = [];
  for (const file of Array.from(list)) {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    const parts = rel ? rel.split('/') : [file.name];
    out.push({ dir: parts.slice(0, -1), name: parts[parts.length - 1], content: await file.text() });
  }
  return out;
}

interface FsEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (ok: (f: File) => void, fail: (e: unknown) => void) => void;
  createReader?: () => { readEntries: (ok: (e: FsEntry[]) => void, fail: (e: unknown) => void) => void };
}

async function walk(entry: FsEntry, dir: string[], out: IncomingFile[]): Promise<void> {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((ok, fail) => entry.file!(ok, fail));
    out.push({ dir, name: entry.name, content: await file.text() });
  } else if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    for (;;) { // readEntries returns results in batches until it yields an empty one
      const batch = await new Promise<FsEntry[]>((ok, fail) => reader.readEntries(ok, fail));
      if (batch.length === 0) break;
      for (const child of batch) await walk(child, [...dir, entry.name], out);
    }
  }
}

/** Everything dropped on the page, including whole folders where the browser exposes them. */
export async function readDroppedFiles(dt: DataTransfer): Promise<IncomingFile[]> {
  const out: IncomingFile[] = [];
  const items = Array.from(dt.items ?? []);
  const entries = items.map((i) => (i as DataTransferItem & { webkitGetAsEntry?: () => FsEntry | null }).webkitGetAsEntry?.() ?? null);
  if (entries.length > 0 && entries.every(Boolean)) {
    for (const e of entries) await walk(e!, [], out);
    return out;
  }
  return readPickedFiles(dt.files);
}
