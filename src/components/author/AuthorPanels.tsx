import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, ArchiveRestore, CheckCircle2, Download, FileJson, Folder, Lock, RotateCcw, Trash2, Upload, XCircle } from 'lucide-react';
import { ConfirmDialog } from '../common/ConfirmDialog';
import {
  emptyTrash, getAuthorSettings, getStats, getStorageInfo, listAllFiles, listFavorites, listFolders, listImports, listRecent, listTrash, purgeFromTrash,
  restoreFile, restoreFolder, saveAuthorSettings, type AuthorStats, type TrashEntry,
} from '../../services/author/authorDb';
import { applyRestore, buildBackup, parseBackup, planRestore, type ParsedBackup, type RestoreMode, type RestorePlan, type RestoreResult } from '../../services/author/authorBackup';
import { changePassword } from '../../services/author/authorLockService';
import { MIN_PASSWORD_LENGTH } from '../../services/author/authorCrypto';
import { useAuthorLockStore } from '../../store/authorLockStore';
import type { AuthorFile, AuthorFolder, AuthorImportRecord, AuthorSettingsRecord, ConflictPolicy } from '../../types/authorStudio';
import { downloadBlob, formatBytes, formatWhen } from './authorUi';

/** Loads once, again whenever `key` changes, and on demand. Errors become a message, never a blank screen. */
function useLoad<T>(loader: () => Promise<T>, key: unknown) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const loaderRef = useRef(loader);
  useEffect(() => { loaderRef.current = loader; });
  const reload = useCallback(async () => {
    try { setState({ data: await loaderRef.current(), error: null, loading: false }); }
    catch (err) { setState({ data: null, error: err instanceof Error ? err.message : 'Could not load.', loading: false }); }
  }, []);
  useEffect(() => { void reload(); }, [reload, key]);
  return { ...state, reload };
}

function Loading() { return <div className="space-y-2">{[1, 2].map((n) => <div key={n} className="card h-16 shimmer" style={{ background: 'var(--border)' }} />)}</div>; }
function Failure({ message, retry }: { message: string; retry: () => void }) {
  return <div className="card p-5 text-sm text-center space-y-2" role="alert"><p className="text-red-600">{message}</p><button type="button" className="btn-secondary text-xs px-4 py-2" onClick={retry}>Try again</button></div>;
}
function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return <div className="card p-8 text-center text-sm space-y-1.5" style={{ color: 'var(--text-secondary)' }}><div className="mx-auto w-fit text-brand-500" aria-hidden>{icon}</div><p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</p>{children && <p>{children}</p>}</div>;
}
function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return <div className="space-y-3"><div className="flex items-center justify-between gap-2"><h2 className="font-display font-bold text-base" style={{ color: 'var(--text-primary)' }}>{title}</h2>{aside}</div>{children}</div>;
}

function FileRow({ file, path, onOpen }: { file: AuthorFile; path?: string; onOpen: (id: string) => void }) {
  const v = file.validation;
  return (
    <li className="card px-3 py-2.5 flex items-center gap-3">
      <button type="button" onClick={() => onOpen(file.id)} className="flex-1 min-w-0 flex items-center gap-2.5 text-left">
        <FileJson size={18} className="text-brand-500 shrink-0" aria-hidden />
        <span className="min-w-0"><span className="block text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{file.name}</span>
          <span className="block text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{path ? `${path} · ` : ''}{v?.questions ?? 0} questions · {formatBytes(file.size)} · {formatWhen(file.updatedAt)}</span></span>
      </button>
      {v && (v.valid ? <CheckCircle2 size={15} className="text-green-600 shrink-0" aria-label="valid" /> : <XCircle size={15} className="text-red-600 shrink-0" aria-label={`${v.errors} errors`} />)}
    </li>
  );
}

function pathMap(folders: AuthorFolder[]) {
  const byId = new Map(folders.map((f) => [f.id, f] as const));
  return (folderId: string | null) => {
    const parts: string[] = [];
    const seen = new Set<string>();
    let cur = folderId;
    while (cur && !seen.has(cur)) { seen.add(cur); const f = byId.get(cur); if (!f) break; parts.unshift(f.name); cur = f.parentId; }
    return parts.length ? parts.join(' / ') : 'Top level';
  };
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export function DashboardPanel({ refreshKey, onOpenFile, onNavigate }: { refreshKey: number; onOpenFile: (id: string) => void; onNavigate: (section: string) => void }) {
  const { data, error, loading, reload } = useLoad(async () => {
    const [stats, recent, storage, folders] = await Promise.all([getStats(), listRecent(5), getStorageInfo(), listFolders()]);
    return { stats, recent, storage, folders };
  }, refreshKey);
  if (loading) return <Loading />;
  if (error || !data) return <Failure message={error ?? 'Could not load.'} retry={() => void reload()} />;
  const { stats, recent, storage, folders } = data;
  const where = pathMap(folders);
  const cards: [string, string | number, string][] = [
    ['Files', stats.files, 'all'], ['Folders', stats.folders, 'bank'], ['Questions', stats.questions, 'all'], ['Size', formatBytes(stats.bytes), 'storage'],
    ['Valid files', stats.validFiles, 'all'], ['With errors', stats.invalidFiles, 'all'], ['Favourites', stats.favorites, 'favorites'], ['In Trash', stats.trashEntries, 'trash'],
  ];
  const pct = storage.quota && storage.usage !== undefined ? Math.min(100, (storage.usage / storage.quota) * 100) : null;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5" data-testid="author-stats">
        {cards.map(([label, value, to]) => (
          <button key={label} type="button" onClick={() => onNavigate(to)} className="card p-3 text-left hover:shadow-md transition-shadow">
            <span className="block text-xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>{value}</span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
          </button>
        ))}
      </div>
      {pct !== null && (
        <div className="card p-3 text-xs space-y-1.5"><div className="flex justify-between" style={{ color: 'var(--text-secondary)' }}><span>Browser storage used by this app</span><span>{formatBytes(storage.usage!)} of {formatBytes(storage.quota!)}</span></div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}><div className="h-full bg-brand-500" style={{ width: `${Math.max(1, pct)}%` }} /></div></div>
      )}
      <Section title="Recent files" aside={<button type="button" className="btn-ghost text-xs" onClick={() => onNavigate('recent')}>See all</button>}>
        {recent.length === 0 ? <Empty icon={<FileJson size={26} />} title="No files yet">Open <strong>My Question Bank</strong> to create a folder, create a file, or upload JSON.</Empty>
          : <ul className="space-y-1.5">{recent.map((f) => <FileRow key={f.id} file={f} path={where(f.folderId)} onOpen={onOpenFile} />)}</ul>}
      </Section>
    </div>
  );
}

// ─── All files / Recent / Favourites ─────────────────────────────────────────

export function AllFilesPanel({ refreshKey, onOpenFile }: { refreshKey: number; onOpenFile: (id: string) => void }) {
  const [filter, setFilter] = useState('');
  const { data, error, loading, reload } = useLoad(async () => ({ files: await listAllFiles(), folders: await listFolders() }), refreshKey);
  const rows = useMemo(() => {
    if (!data) return [];
    const where = pathMap(data.folders);
    const q = filter.trim().toLowerCase();
    return data.files.filter((f) => !q || f.name.toLowerCase().includes(q) || where(f.folderId).toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map((f) => ({ f, path: where(f.folderId) }));
  }, [data, filter]);
  return (
    <Section title="All files" aside={<input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by name or folder" aria-label="Filter files" data-exam-keys="off" className="rounded-xl px-3 py-1.5 text-xs bg-transparent w-48" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }} />}>
      {loading ? <Loading /> : error || !data ? <Failure message={error ?? ''} retry={() => void reload()} />
        : rows.length === 0 ? <Empty icon={<FileJson size={26} />} title={filter ? 'No matching files' : 'No files yet'} />
          : <ul className="space-y-1.5">{rows.map(({ f, path }) => <FileRow key={f.id} file={f} path={path} onOpen={onOpenFile} />)}</ul>}
    </Section>
  );
}

export function RecentPanel({ refreshKey, onOpenFile }: { refreshKey: number; onOpenFile: (id: string) => void }) {
  const { data, error, loading, reload } = useLoad(async () => ({ files: await listRecent(30), folders: await listFolders() }), refreshKey);
  return (
    <Section title="Recent">
      {loading ? <Loading /> : error || !data ? <Failure message={error ?? ''} retry={() => void reload()} />
        : data.files.length === 0 ? <Empty icon={<FileJson size={26} />} title="Nothing recent yet" />
          : <ul className="space-y-1.5">{data.files.map((f) => <FileRow key={f.id} file={f} path={pathMap(data.folders)(f.folderId)} onOpen={onOpenFile} />)}</ul>}
    </Section>
  );
}

export function FavoritesPanel({ refreshKey, onOpenFile, onOpenFolder }: { refreshKey: number; onOpenFile: (id: string) => void; onOpenFolder: (id: string) => void }) {
  const { data, error, loading, reload } = useLoad(async () => ({ fav: await listFavorites(), folders: await listFolders() }), refreshKey);
  if (loading) return <Loading />;
  if (error || !data) return <Failure message={error ?? ''} retry={() => void reload()} />;
  const where = pathMap(data.folders);
  const empty = data.fav.files.length === 0 && data.fav.folders.length === 0;
  return (
    <Section title="Favourites">
      {empty ? <Empty icon={<FileJson size={26} />} title="No favourites yet">Use a file or folder's menu → <strong>Add to favourites</strong>.</Empty> : (
        <ul className="space-y-1.5">
          {data.fav.folders.map((f) => (
            <li key={f.id} className="card px-3 py-2.5"><button type="button" onClick={() => onOpenFolder(f.id)} className="w-full flex items-center gap-2.5 text-left"><Folder size={18} className="text-brand-500" aria-hidden /><span className="min-w-0"><span className="block text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{f.name}</span><span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>Folder · {where(f.parentId)}</span></span></button></li>
          ))}
          {data.fav.files.map((f) => <FileRow key={f.id} file={f} path={where(f.folderId)} onOpen={onOpenFile} />)}
        </ul>
      )}
    </Section>
  );
}

// ─── Trash ───────────────────────────────────────────────────────────────────

export function TrashPanel({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const { data, error, loading, reload } = useLoad(() => listTrash(), refreshKey);
  const [purge, setPurge] = useState<TrashEntry | 'all' | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(work: () => Promise<string>) {
    setBusy(true);
    try { toast.success(await work()); onChanged(); await reload(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed.'); } finally { setBusy(false); setPurge(null); }
  }
  async function restore(e: TrashEntry) {
    await act(async () => {
      const r = e.kind === 'folder' ? await restoreFolder(e.id) : await restoreFile(e.id);
      return r.movedToTopLevel ? `Restored "${e.name}" to the top level (its original folder no longer exists)` : `Restored "${e.name}"`;
    });
  }
  return (
    <Section title="Trash" aside={data && data.length > 0 ? <button type="button" className="btn-ghost text-xs text-red-600" onClick={() => setPurge('all')}>Empty Trash</button> : undefined}>
      {loading ? <Loading /> : error || !data ? <Failure message={error ?? ''} retry={() => void reload()} />
        : data.length === 0 ? <Empty icon={<Trash2 size={26} />} title="Trash is empty">Deleted files and folders wait here until you restore or permanently delete them.</Empty> : (
          <ul className="space-y-1.5">
            {data.map((e) => (
              <li key={`${e.kind}${e.id}`} className="card px-3 py-2.5 flex items-center gap-3">
                {e.kind === 'folder' ? <Folder size={18} className="text-brand-500 shrink-0" aria-hidden /> : <FileJson size={18} className="text-brand-500 shrink-0" aria-hidden />}
                <div className="min-w-0 flex-1"><p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{e.name}</p>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Deleted {formatWhen(e.deletedAt)}{e.kind === 'folder' ? ` · ${e.itemCount} item(s)` : e.size !== undefined ? ` · ${formatBytes(e.size)}` : ''}</p></div>
                <button type="button" disabled={busy} onClick={() => void restore(e)} className="btn-ghost text-xs inline-flex items-center gap-1 px-2.5 py-1.5"><RotateCcw size={13} /> Restore</button>
                <button type="button" disabled={busy} onClick={() => setPurge(e)} className="btn-ghost text-xs inline-flex items-center gap-1 px-2.5 py-1.5 text-red-600"><Trash2 size={13} /> Delete forever</button>
              </li>
            ))}
          </ul>
        )}
      <ConfirmDialog open={purge !== null} title={purge === 'all' ? 'Empty the Trash?' : 'Delete permanently?'} confirmLabel="Delete forever" destructive busy={busy} onCancel={() => setPurge(null)}
        onConfirm={() => void act(async () => {
          if (purge === 'all') { const n = await emptyTrash(); return `Permanently deleted ${n} item(s)`; }
          if (purge) { const n = await purgeFromTrash([{ kind: purge.kind, id: purge.id }]); return `Permanently deleted ${n} item(s)`; }
          return '';
        })}>
        <p>{purge === 'all' ? 'Everything in the Trash' : <strong>{purge?.name}</strong>} will be permanently deleted from this browser.</p>
        <p><strong>This cannot be undone.</strong></p>
      </ConfirmDialog>
    </Section>
  );
}

// ─── Import history ──────────────────────────────────────────────────────────

const SOURCE_LABEL: Record<AuthorImportRecord['source'], string> = { upload: 'Upload', 'folder-upload': 'Folder upload', 'backup-restore': 'Backup restore', create: 'Created', duplicate: 'Duplicated' };

export function ImportHistoryPanel({ refreshKey }: { refreshKey: number }) {
  const { data, error, loading, reload } = useLoad(() => listImports(200), refreshKey);
  return (
    <Section title="Import history">
      {loading ? <Loading /> : error || !data ? <Failure message={error ?? ''} retry={() => void reload()} />
        : data.length === 0 ? <Empty icon={<Upload size={26} />} title="No imports yet" />
          : <ul className="space-y-1.5">{data.map((r) => (
            <li key={r.id} className="card px-3 py-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5"><strong className="text-sm" style={{ color: 'var(--text-primary)' }}>{SOURCE_LABEL[r.source]} · {r.label}</strong><span style={{ color: 'var(--text-muted)' }}>{formatWhen(r.at)}</span></div>
              <p style={{ color: 'var(--text-secondary)' }}>{r.added} added · {r.renamed} renamed · {r.replaced} replaced · {r.skipped} skipped{r.failed ? ` · ${r.failed} failed` : ''}</p>
              {r.notes?.map((n, i) => <p key={i} style={{ color: 'var(--text-muted)' }}>{n}</p>)}
            </li>))}</ul>}
    </Section>
  );
}

// ─── Storage, backup & restore ───────────────────────────────────────────────

export function StoragePanel({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const { data, error, loading, reload } = useLoad(async () => ({ stats: await getStats(), storage: await getStorageInfo() }), refreshKey);
  return (
    <div className="space-y-6">
      <Section title="Storage">
        {loading ? <Loading /> : error || !data ? <Failure message={error ?? ''} retry={() => void reload()} /> : <StorageNumbers stats={data.stats} storage={data.storage} />}
      </Section>
      <BackupSection />
      <RestoreSection onRestored={() => { onChanged(); void reload(); }} />
    </div>
  );
}

function StorageNumbers({ stats, storage }: { stats: AuthorStats; storage: { authorBytes: number; usage?: number; quota?: number } }) {
  return (
    <div className="card p-4 text-sm space-y-1.5" style={{ color: 'var(--text-secondary)' }}>
      <p>Author Studio holds <strong style={{ color: 'var(--text-primary)' }}>{stats.files}</strong> file(s) in <strong style={{ color: 'var(--text-primary)' }}>{stats.folders}</strong> folder(s) — {formatBytes(storage.authorBytes)} (including Trash).</p>
      {storage.usage !== undefined && storage.quota !== undefined ? <p>Whole app: {formatBytes(storage.usage)} used of roughly {formatBytes(storage.quota)} the browser allows.</p> : <p>This browser does not report storage quota.</p>}
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Files live only in this browser. Clearing site data erases them — download a backup regularly.</p>
    </div>
  );
}

function BackupSection() {
  const [scope, setScope] = useState<'bank' | 'full'>('bank');
  const [busy, setBusy] = useState(false);
  async function make() {
    setBusy(true);
    try {
      const b = await buildBackup(scope);
      downloadBlob(b.fileName, b.bytes as BlobPart, 'application/zip');
      toast.success(`Backup saved — ${b.manifest.counts.files} file(s), ${b.manifest.counts.folders} folder(s)`);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Backup failed.'); } finally { setBusy(false); }
  }
  return (
    <Section title="Back up">
      <div className="card p-4 space-y-3 text-sm">
        {([['bank', 'Complete private question bank', 'All folders and JSON files, favourites'], ['full', 'Complete Author Studio data', 'Everything above plus import history and settings']] as const).map(([v, t, d]) => (
          <label key={v} className="flex items-start gap-2.5 cursor-pointer"><input type="radio" name="backup-scope" checked={scope === v} onChange={() => setScope(v)} className="mt-1" /><span><strong style={{ color: 'var(--text-primary)' }}>{t}</strong><br /><span className="text-xs" style={{ color: 'var(--text-muted)' }}>{d}</span></span></label>
        ))}
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>To back up only some files or folders, select them in My Question Bank and choose <em>Export ZIP</em>. Your password and the Trash are never included in a backup.</p>
        <button type="button" onClick={() => void make()} disabled={busy} className="btn-primary text-sm px-5 py-2.5 inline-flex items-center gap-2"><Download size={15} /> {busy ? 'Preparing…' : 'Download backup (.zip)'}</button>
      </div>
    </Section>
  );
}

function RestoreSection({ onRestored }: { onRestored: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedBackup | null>(null);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<RestoreMode>('merge');
  const [policy, setPolicy] = useState<ConflictPolicy>('skip');
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RestoreResult | null>(null);

  useEffect(() => {
    if (!parsed || parsed.fatal) return;
    let alive = true;
    void planRestore(parsed, mode).then((p) => { if (alive) setPlan(p); }).catch((e) => toast.error(e instanceof Error ? e.message : 'Could not preview the backup.'));
    return () => { alive = false; };
  }, [parsed, mode]);

  async function pick(file: File | undefined) {
    if (!file) return;
    setResult(null); setPlan(null); setParsed(null); setName(file.name);
    setBusy(true);
    try { setParsed(await parseBackup(new Uint8Array(await file.arrayBuffer()))); } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not read that file.'); } finally { setBusy(false); }
    if (input.current) input.current.value = '';
  }

  async function apply() {
    if (!parsed) return;
    setBusy(true);
    try {
      const r = await applyRestore(parsed, { mode, policy });
      setResult(r); setParsed(null); setPlan(null); setConfirm(false);
      toast.success('Restore complete');
      onRestored();
    } catch (e) {
      toast.error(`Restore failed — nothing was changed. ${e instanceof Error ? e.message : ''}`);
    } finally { setBusy(false); }
  }

  const risky = mode === 'replace-all' || (policy === 'replace' && (plan?.counts.conflict ?? 0) > 0);
  return (
    <Section title="Restore from backup">
      <div className="card p-4 space-y-3 text-sm">
        <button type="button" onClick={() => input.current?.click()} disabled={busy} className="btn-secondary text-sm px-5 py-2.5 inline-flex items-center gap-2"><ArchiveRestore size={15} /> Choose backup (.zip)…</button>
        <input ref={input} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />

        {result && (
          <div className="rounded-xl p-3 text-xs space-y-0.5" style={{ background: 'rgba(22,163,74,0.08)', color: 'var(--text-primary)' }} role="status">
            <p className="font-semibold flex items-center gap-1.5"><CheckCircle2 size={14} className="text-green-600" /> Restore finished</p>
            <p>{result.filesAdded} added · {result.filesReplaced} replaced · {result.filesRenamed} kept as copies · {result.filesSkipped} skipped · {result.filesIdentical} already identical · {result.foldersCreated} folder(s) created</p>
            {result.trashedExisting > 0 && <p>{result.trashedExisting} existing item(s) were moved to Trash and can be restored.</p>}
          </div>
        )}

        {parsed?.fatal && <div role="alert" className="rounded-xl p-3 text-xs flex gap-2" style={{ background: 'rgba(220,38,38,0.08)', color: 'var(--text-primary)' }}><XCircle size={15} className="text-red-600 shrink-0" /><div><p className="font-semibold">“{name}” can't be restored</p>{parsed.errors.map((e, i) => <p key={i}>{e}</p>)}</div></div>}

        {parsed && !parsed.fatal && (
          <div className="space-y-3">
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}><strong style={{ color: 'var(--text-primary)' }}>{name}</strong> — made {parsed.manifest ? formatWhen(new Date(parsed.manifest.createdAt).getTime()) : 'at an unknown time'} · scope “{parsed.manifest?.scope}” · {parsed.files.length} file(s), {parsed.folders.length} folder(s)</p>
            {parsed.errors.length > 0 && <div className="rounded-xl p-2.5 text-xs space-y-0.5" style={{ background: 'rgba(220,38,38,0.08)' }}><p className="font-semibold text-red-600 flex items-center gap-1.5"><XCircle size={13} /> {parsed.errors.length} problem(s) — these entries will be skipped</p>{parsed.errors.slice(0, 8).map((e, i) => <p key={i} style={{ color: 'var(--text-secondary)' }}>{e}</p>)}</div>}
            {parsed.warnings.length > 0 && <details className="rounded-xl p-2.5 text-xs" style={{ background: 'rgba(217,119,6,0.08)' }}><summary className="font-semibold text-amber-700 cursor-pointer flex items-center gap-1.5"><AlertTriangle size={13} className="inline" /> {parsed.warnings.length} warning(s)</summary><div className="mt-1 space-y-0.5" style={{ color: 'var(--text-secondary)' }}>{parsed.warnings.slice(0, 40).map((w, i) => <p key={i}>{w}</p>)}</div></details>}

            <fieldset className="space-y-2"><legend className="text-xs font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>How should it be restored?</legend>
              <label className="flex items-start gap-2.5 cursor-pointer"><input type="radio" name="restore-mode" checked={mode === 'merge'} onChange={() => setMode('merge')} className="mt-1" /><span><strong style={{ color: 'var(--text-primary)' }}>Merge into what I have</strong><br /><span className="text-xs" style={{ color: 'var(--text-muted)' }}>Adds missing folders and files. Nothing existing is changed unless you choose Replace below.</span></span></label>
              <label className="flex items-start gap-2.5 cursor-pointer"><input type="radio" name="restore-mode" checked={mode === 'replace-all'} onChange={() => setMode('replace-all')} className="mt-1" /><span><strong style={{ color: 'var(--text-primary)' }}>Replace everything with the backup</strong><br /><span className="text-xs" style={{ color: 'var(--text-muted)' }}>Your current bank is moved to Trash first (recoverable), then the backup is restored.</span></span></label>
            </fieldset>

            {plan && (
              <div className="rounded-xl p-3 text-xs space-y-2" style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }} data-testid="restore-plan">
                <p><strong style={{ color: 'var(--text-primary)' }}>Preview:</strong> {plan.counts.new} new · {plan.counts.identical} identical · {plan.counts.conflict} conflicting · {plan.newFolders} new folder(s){plan.willTrash > 0 ? ` · ${plan.willTrash} existing top-level item(s) will go to Trash` : ''}</p>
                {mode === 'merge' && plan.counts.conflict > 0 && (<>
                  <ul className="max-h-28 overflow-y-auto space-y-0.5">{plan.items.filter((i) => i.status === 'conflict').slice(0, 50).map((i) => <li key={i.path} className="truncate">≠ {i.path}</li>)}</ul>
                  <fieldset className="space-y-1"><legend className="font-semibold" style={{ color: 'var(--text-primary)' }}>For the {plan.counts.conflict} conflicting file(s):</legend>
                    {([['skip', 'Skip — keep my current version'], ['rename', 'Keep both — restore the backup copy under a new name'], ['replace', 'Replace — overwrite my version with the backup']] as const).map(([v, t]) => (
                      <label key={v} className="flex items-center gap-2 cursor-pointer"><input type="radio" name="restore-policy" checked={policy === v} onChange={() => setPolicy(v)} /> {t}</label>))}
                  </fieldset></>)}
              </div>
            )}
            <button type="button" disabled={busy || !plan || (plan.items.length === 0 && plan.newFolders === 0)} onClick={() => setConfirm(true)} className="btn-primary text-sm px-5 py-2.5">Restore…</button>
          </div>
        )}
        {busy && !parsed && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Reading backup…</p>}
      </div>
      <ConfirmDialog open={confirm} title="Restore this backup?" confirmLabel="Restore" destructive={risky} busy={busy} onConfirm={() => void apply()} onCancel={() => setConfirm(false)}>
        {plan && (<>
          <p>{plan.counts.new} new file(s) will be added{plan.newFolders ? ` in ${plan.newFolders} new folder(s)` : ''}.</p>
          {mode === 'merge' && plan.counts.conflict > 0 && <p>{plan.counts.conflict} conflicting file(s): <strong>{policy === 'skip' ? 'your current versions are kept' : policy === 'rename' ? 'both versions are kept' : 'your current versions will be OVERWRITTEN'}</strong>.</p>}
          {mode === 'replace-all' && <p>Your current bank ({plan.willTrash} top-level item(s)) will be moved to Trash first.</p>}
          <p>It is applied all-or-nothing: if anything fails, nothing changes.</p>
        </>)}
      </ConfirmDialog>
    </Section>
  );
}

// ─── Settings ────────────────────────────────────────────────────────────────

export function SettingsPanel() {
  const lock = useAuthorLockStore((s) => s.lock);
  const { data, error, loading, reload } = useLoad(() => getAuthorSettings(), 0);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(patch: Partial<Omit<AuthorSettingsRecord, 'key'>>) { await saveAuthorSettings(patch); toast.success('Saved'); await reload(); }

  async function change() {
    setMsg(null);
    if (next !== again) return setMsg({ ok: false, text: 'The new passwords do not match.' });
    if (next.length < MIN_PASSWORD_LENGTH) return setMsg({ ok: false, text: `Use at least ${MIN_PASSWORD_LENGTH} characters.` });
    setBusy(true);
    try {
      const r = await changePassword(cur, next);
      if ('reason' in r) setMsg({ ok: false, text: r.reason === 'wrong-current' ? 'The current password is incorrect.' : r.reason === 'throttled' ? 'Too many attempts — wait a moment.' : 'Could not change the password.' });
      else { setMsg({ ok: true, text: 'Password changed.' }); setCur(''); setNext(''); setAgain(''); }
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <Section title="Settings">
        {loading ? <Loading /> : error || !data ? <Failure message={error ?? ''} retry={() => void reload()} /> : (
          <div className="card p-4 space-y-4 text-sm">
            <label className="flex flex-wrap items-center justify-between gap-2"><span style={{ color: 'var(--text-primary)' }}>Lock automatically after inactivity</span>
              <select value={data.autoLockMinutes} onChange={(e) => void save({ autoLockMinutes: Number(e.target.value) })} className="rounded-xl px-2.5 py-2 text-xs bg-transparent" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                {[[0, 'Never'], [1, '1 minute'], [5, '5 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 hour']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></label>
            <label className="flex flex-wrap items-center justify-between gap-2"><span style={{ color: 'var(--text-primary)' }}>Default file view</span>
              <select value={data.view} onChange={(e) => void save({ view: e.target.value as 'list' | 'grid' })} className="rounded-xl px-2.5 py-2 text-xs bg-transparent" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }}><option value="list">List</option><option value="grid">Grid</option></select></label>
            <button type="button" onClick={lock} className="btn-secondary text-sm px-5 py-2.5 inline-flex items-center gap-2"><Lock size={14} /> Lock now</button>
          </div>
        )}
      </Section>
      <Section title="Change password">
        <form className="card p-4 space-y-3 text-sm max-w-md" onSubmit={(e) => { e.preventDefault(); void change(); }}>
          {([['Current password', cur, setCur, 'current-password'], ['New password', next, setNext, 'new-password'], ['Confirm new password', again, setAgain, 'new-password']] as const).map(([label, value, set, ac]) => (
            <label key={label} className="block"><span style={{ color: 'var(--text-secondary)' }}>{label}</span><input type="password" autoComplete={ac} value={value} onChange={(e) => set(e.target.value)} className="mt-1 w-full rounded-xl px-3 py-2 text-sm bg-transparent" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }} /></label>
          ))}
          <p role="status" className="text-xs min-h-4" style={{ color: msg?.ok ? '#16a34a' : '#dc2626' }}>{msg?.text}</p>
          <button type="submit" disabled={busy || !cur || !next} className="btn-primary text-sm px-5 py-2.5">{busy ? 'Changing…' : 'Change password'}</button>
        </form>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>The lock is a privacy gate on this device, not encryption. A forgotten password cannot be recovered.</p>
      </Section>
    </div>
  );
}
