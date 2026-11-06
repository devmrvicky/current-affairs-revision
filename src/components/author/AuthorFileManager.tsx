import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, ChevronRight, Copy, Download, FileJson, FilePlus2, FolderInput, FolderPlus, FolderUp, Grid2x2, List, MoreVertical, Pencil, Search, Star, Trash2, Upload, XCircle } from 'lucide-react';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Modal } from '../common/Modal';
import {
  AuthorError, copyFile, copyFolder, createFile, createFolder, duplicateFile, duplicateFolder, getFileContent, listChildren, listFolders, moveFile, moveFolder,
  renameFile, renameFolder, saveAuthorSettings, searchAuthor, setFileFavorite, setFolderFavorite, trashFile, trashFolder, type ImportResult,
} from '../../services/author/authorDb';
import { buildBackup } from '../../services/author/authorBackup';
import { findImportConflicts, importTree, type IncomingFile } from '../../services/author/authorImportTree';
import { isSameOrDescendant } from '../../services/author/authorNames';
import type { AuthorFile, AuthorFolder, ConflictPolicy } from '../../types/authorStudio';
import { AuthorTree, FolderPickerDialog } from './AuthorTree';
import { ImportConflictDialog, ImportReportDialog, NameDialog } from './AuthorDialogs';
import { downloadBlob, formatBytes, formatWhen, readDroppedFiles, readPickedFiles } from './authorUi';

type SortKey = 'name' | 'modified' | 'size' | 'questions';
type Filter = 'all' | 'valid' | 'invalid' | 'favorites';
type Item = { kind: 'folder'; folder: AuthorFolder } | { kind: 'file'; file: AuthorFile; matchedIn?: string[] };

const itemKey = (i: Item) => (i.kind === 'folder' ? `d:${i.folder.id}` : `f:${i.file.id}`);
const itemName = (i: Item) => (i.kind === 'folder' ? i.folder.name : i.file.name);
const naturalCompare = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

const STARTER = JSON.stringify([{
  id: 'q001', question: 'Write the question here', difficulty: 'medium',
  options: [{ id: 'A', text: 'Option A' }, { id: 'B', text: 'Option B' }, { id: 'C', text: 'Option C' }, { id: 'D', text: 'Option D' }],
  correctAnswer: 'A', explanation: 'Explain why A is correct.',
}], null, 2);

interface MenuState { x: number; y: number; item: Item }

interface Props {
  initialView: 'list' | 'grid';
  /** Folder to open first (e.g. from Favourites). The parent remounts the manager with a new key to change it. */
  startFolderId?: string | null;
  onOpenFile: (id: string) => void;
  /** Bumped by the parent when something outside changed the data (e.g. a save in the viewer). */
  refreshKey: number;
  onChanged: () => void;
}

export function AuthorFileManager({ initialView, startFolderId = null, onOpenFile, refreshKey, onChanged }: Props) {
  const [folderId, setFolderId] = useState<string | null>(startFolderId);
  const [folders, setFolders] = useState<AuthorFolder[]>([]);
  const [children, setChildren] = useState<{ folders: AuthorFolder[]; files: AuthorFile[] }>({ folders: [], files: [] });
  const [found, setFound] = useState<Item[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [view, setView] = useState<'list' | 'grid'>(initialView);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('name');
  const [filter, setFilter] = useState<Filter>('all');
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [treeOpen, setTreeOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  const [dialog, setDialog] = useState<
    | { type: 'new-folder' } | { type: 'new-file' } | { type: 'rename'; item: Item }
    | { type: 'move' | 'copy'; items: Item[] } | { type: 'delete'; items: Item[] } | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [pendingImport, setPendingImport] = useState<{ files: IncomingFile[]; conflicts: string[]; source: 'upload' | 'folder-upload' } | null>(null);
  const [report, setReport] = useState<ImportResult | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try {
      const all = await listFolders();
      // If the current folder disappeared (deleted in another tab), fall back to the top level.
      const here = folderId !== null && !all.some((f) => f.id === folderId) ? null : folderId;
      const [kids, hits] = await Promise.all([
        listChildren(here),
        query.trim() || filter === 'favorites' ? searchAuthor({ query, scopeFolderId: here, validity: filter === 'valid' || filter === 'invalid' ? filter : undefined, onlyFavorites: filter === 'favorites' }) : Promise.resolve(null),
      ]);
      setFolders(all);
      if (here !== folderId) setFolderId(here);
      setChildren(kids);
      setFound(hits ? [...hits.folders.map((folder): Item => ({ kind: 'folder', folder })), ...hits.files.map((h): Item => ({ kind: 'file', file: h.file, matchedIn: h.matchedIn }))] : null);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not read your files.');
    } finally {
      setLoading(false);
    }
  }, [folderId, query, filter]);

  useEffect(() => {
    const id = setTimeout(() => { void reload(); }, query ? 200 : 0); // debounce typing only
    return () => clearTimeout(id);
  }, [reload, refreshKey, query]);

  const run = useCallback(async (label: string, work: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    try {
      await work();
      if (success) toast.success(success);
      onChanged();
      await reload();
      return true;
    } catch (err) {
      toast.error(err instanceof AuthorError || err instanceof Error ? err.message : `${label} failed.`);
      return false;
    } finally {
      setBusy(false);
    }
  }, [onChanged, reload]);

  // ── Derived list ──────────────────────────────────────────────────────────
  const items: Item[] = useMemo(() => {
    let list: Item[];
    if (found) list = found;
    else {
      list = [...children.folders.map((folder): Item => ({ kind: 'folder', folder })), ...children.files.map((file): Item => ({ kind: 'file', file }))];
      if (filter === 'valid') list = list.filter((i) => i.kind === 'file' && i.file.validation?.valid);
      if (filter === 'invalid') list = list.filter((i) => i.kind === 'file' && i.file.validation && !i.file.validation.valid);
    }
    const dir = (a: Item, b: Item) => (a.kind === b.kind ? 0 : a.kind === 'folder' ? -1 : 1); // folders first
    const stamp = (i: Item) => (i.kind === 'folder' ? i.folder.updatedAt : i.file.updatedAt);
    const size = (i: Item) => (i.kind === 'file' ? i.file.size : 0);
    const qs = (i: Item) => (i.kind === 'file' ? i.file.validation?.questions ?? 0 : 0);
    return [...list].sort((a, b) => {
      const d = dir(a, b);
      if (d) return d;
      if (sort === 'modified') return stamp(b) - stamp(a);
      if (sort === 'size') return size(b) - size(a) || naturalCompare(itemName(a), itemName(b));
      if (sort === 'questions') return qs(b) - qs(a) || naturalCompare(itemName(a), itemName(b));
      return naturalCompare(itemName(a), itemName(b));
    });
  }, [children, found, filter, sort]);

  const crumbs = useMemo(() => {
    const byId = new Map(folders.map((f) => [f.id, f] as const));
    const chain: AuthorFolder[] = [];
    const seen = new Set<string>();
    let cur = folderId;
    while (cur && !seen.has(cur)) { seen.add(cur); const f = byId.get(cur); if (!f) break; chain.unshift(f); cur = f.parentId; }
    return chain;
  }, [folders, folderId]);

  const selectedItems = items.filter((i) => selection.has(itemKey(i)));
  const allSelected = items.length > 0 && selectedItems.length === items.length;

  function goTo(id: string | null) { setFolderId(id); setSelection(new Set()); setQuery(''); setFilter('all'); setTreeOpen(false); }
  function toggleSelect(i: Item) { setSelection((prev) => { const n = new Set(prev); const k = itemKey(i); if (n.has(k)) n.delete(k); else n.add(k); return n; }); }
  function openItem(i: Item) { if (i.kind === 'folder') goTo(i.folder.id); else onOpenFile(i.file.id); }
  function openMenu(e: ReactMouseEvent, item: Item) {
    e.preventDefault(); e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const fromButton = e.type === 'click';
    setMenu({ x: Math.min(fromButton ? r.right - 190 : e.clientX, window.innerWidth - 200), y: Math.min(fromButton ? r.bottom + 4 : e.clientY, window.innerHeight - 330), item });
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  async function download(i: Item) {
    if (i.kind === 'file') {
      const text = await getFileContent(i.file.id);
      downloadBlob(i.file.name, text ?? '', 'application/json');
    } else {
      const b = await buildBackup('selection', { folderIds: [i.folder.id], fileIds: [] });
      downloadBlob(`${i.folder.name}.zip`, b.bytes as BlobPart, 'application/zip');
    }
  }

  async function exportSelection(list: Item[]) {
    const b = await buildBackup('selection', { folderIds: list.filter((i) => i.kind === 'folder').map((i) => (i as { folder: AuthorFolder }).folder.id), fileIds: list.filter((i) => i.kind === 'file').map((i) => (i as { file: AuthorFile }).file.id) });
    downloadBlob(b.fileName, b.bytes as BlobPart, 'application/zip');
    toast.success(`Exported ${b.manifest.counts.files} file(s)`);
  }

  async function startImport(files: IncomingFile[], source: 'upload' | 'folder-upload') {
    if (files.length === 0) return void toast('Nothing to import.');
    try {
      const conflicts = (await findImportConflicts(folderId, files.filter((f) => /\.json$/i.test(f.name)))).map((c) => c.path);
      if (conflicts.length > 0) return setPendingImport({ files, conflicts, source });
      await finishImport(files, 'rename', source);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed.');
    }
  }

  async function finishImport(files: IncomingFile[], policy: ConflictPolicy, source: 'upload' | 'folder-upload') {
    setBusy(true);
    try {
      const r = await importTree(folderId, files, policy, source);
      setPendingImport(null);
      if (r.failed + r.skipped + r.renamed + r.replaced > 0) setReport(r); else toast.success(`Imported ${r.added} file(s)`);
      onChanged();
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  }

  async function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (!e.dataTransfer.types.includes('Files')) return;
    await startImport(await readDroppedFiles(e.dataTransfer), 'upload');
  }

  const moveBlocked = useMemo(() => {
    if (dialog?.type !== 'move') return undefined;
    const map = new Map(folders.map((f) => [f.id, { id: f.id, parentId: f.parentId }] as const));
    const blocked = new Set<string>();
    for (const i of dialog.items) if (i.kind === 'folder') for (const f of folders) if (isSameOrDescendant(map, f.id, i.folder.id)) blocked.add(f.id);
    return blocked;
  }, [dialog, folders]);

  const single = selectedItems.length === 1 ? selectedItems[0] : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="hidden lg:block card p-2 h-fit max-h-[70vh] overflow-y-auto" aria-label="Folders">
        <AuthorTree folders={folders} selectedId={folderId} onSelect={goTo} />
      </aside>

      <section
        className={`min-w-0 space-y-3 rounded-2xl ${dragging ? 'outline outline-2 outline-dashed outline-brand-500' : ''}`}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
        onDrop={(e) => void onDrop(e)}
      >
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Breadcrumb" className="flex items-center flex-wrap gap-0.5 text-sm min-w-0 flex-1">
            <button type="button" onClick={() => setTreeOpen(true)} className="lg:hidden btn-ghost text-xs px-2 py-1 mr-1">Folders</button>
            <button type="button" onClick={() => goTo(null)} className="px-1.5 py-1 rounded-md hover:bg-gray-100 dark:hover:bg-white/5 font-medium" style={{ color: crumbs.length ? 'var(--text-secondary)' : 'var(--text-primary)' }}>My Question Bank</button>
            {crumbs.map((c, i) => (
              <span key={c.id} className="inline-flex items-center">
                <ChevronRight size={13} style={{ color: 'var(--text-muted)' }} aria-hidden />
                <button type="button" onClick={() => goTo(c.id)} aria-current={i === crumbs.length - 1 ? 'page' : undefined} className="px-1.5 py-1 rounded-md hover:bg-gray-100 dark:hover:bg-white/5 truncate max-w-[10rem]" style={{ color: i === crumbs.length - 1 ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: i === crumbs.length - 1 ? 600 : 400 }}>{c.name}</button>
              </span>
            ))}
          </nav>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className="btn-ghost text-xs inline-flex items-center gap-1 px-2.5 py-1.5" onClick={() => setDialog({ type: 'new-folder' })}><FolderPlus size={14} /> Folder</button>
            <button type="button" className="btn-ghost text-xs inline-flex items-center gap-1 px-2.5 py-1.5" onClick={() => setDialog({ type: 'new-file' })}><FilePlus2 size={14} /> File</button>
            <button type="button" className="btn-ghost text-xs inline-flex items-center gap-1 px-2.5 py-1.5" onClick={() => fileInput.current?.click()}><Upload size={14} /> Upload</button>
            <button type="button" className="btn-ghost text-xs inline-flex items-center gap-1 px-2.5 py-1.5" onClick={() => folderInput.current?.click()}><FolderUp size={14} /> Upload folder</button>
          </div>
          <input ref={fileInput} type="file" multiple accept=".json,application/json" className="hidden" onChange={async (e) => { const f = e.target.files; if (f?.length) await startImport(await readPickedFiles(f), 'upload'); e.target.value = ''; }} />
          <input ref={folderInput} type="file" multiple className="hidden" {...({ webkitdirectory: '' } as object)} onChange={async (e) => { const f = e.target.files; if (f?.length) await startImport(await readPickedFiles(f), 'folder-upload'); e.target.value = ''; }} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex-1 min-w-[10rem]">
            <span className="sr-only">Search files and questions</span>
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search names, subjects, topics, question text…" data-exam-keys="off"
              className="w-full rounded-xl pl-8 pr-3 py-2 text-sm bg-transparent" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          </label>
          <select aria-label="Filter" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="rounded-xl px-2.5 py-2 text-xs bg-transparent" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
            <option value="all">All</option><option value="valid">Valid only</option><option value="invalid">Has errors</option><option value="favorites">Favourites</option>
          </select>
          <select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded-xl px-2.5 py-2 text-xs bg-transparent" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
            <option value="name">Name</option><option value="modified">Modified</option><option value="size">Size</option><option value="questions">Questions</option>
          </select>
          <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }} role="group" aria-label="View">
            {(['list', 'grid'] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} aria-label={`${v} view`} onClick={() => { setView(v); void saveAuthorSettings({ view: v }); }} className={`p-2 ${view === v ? 'bg-brand-500 text-white' : ''}`} style={view === v ? undefined : { color: 'var(--text-secondary)' }}>
                {v === 'list' ? <List size={15} /> : <Grid2x2 size={15} />}
              </button>
            ))}
          </div>
        </div>

        {/* Bulk bar */}
        {selectedItems.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-xs" style={{ background: 'var(--border)' }} role="toolbar" aria-label="Bulk actions">
            <strong style={{ color: 'var(--text-primary)' }}>{selectedItems.length} selected</strong>
            <button type="button" className="btn-ghost px-2 py-1 inline-flex items-center gap-1" onClick={() => setDialog({ type: 'move', items: selectedItems })}><FolderInput size={13} /> Move…</button>
            <button type="button" className="btn-ghost px-2 py-1 inline-flex items-center gap-1" onClick={() => setDialog({ type: 'copy', items: selectedItems })}><Copy size={13} /> Copy…</button>
            <button type="button" className="btn-ghost px-2 py-1 inline-flex items-center gap-1" onClick={() => void exportSelection(selectedItems)}><Download size={13} /> Export ZIP</button>
            <button type="button" className="btn-ghost px-2 py-1 inline-flex items-center gap-1 text-red-600" onClick={() => setDialog({ type: 'delete', items: selectedItems })}><Trash2 size={13} /> Delete</button>
            <button type="button" className="btn-ghost px-2 py-1 ml-auto" onClick={() => setSelection(new Set())}>Clear</button>
          </div>
        )}

        {/* Content */}
        {loadError ? (
          <div className="card p-6 text-sm text-center space-y-2" role="alert"><p className="text-red-600">{loadError}</p><button type="button" className="btn-secondary text-xs px-4 py-2" onClick={() => void reload()}>Try again</button></div>
        ) : loading ? (
          <div className="space-y-2">{[1, 2, 3].map((n) => <div key={n} className="card h-14 shimmer" style={{ background: 'var(--border)' }} />)}</div>
        ) : items.length === 0 ? (
          <div className="card p-8 text-center text-sm space-y-2" style={{ color: 'var(--text-secondary)' }}>
            <FileJson size={28} className="mx-auto text-brand-500" aria-hidden />
            {query || filter !== 'all' ? <p>No matches{query ? <> for “{query}”</> : null}.</p> : (
              <><p className="font-semibold" style={{ color: 'var(--text-primary)' }}>This folder is empty</p><p>Create a folder or file, or drop JSON files (or a whole folder) here.</p></>
            )}
          </div>
        ) : (
          <div className={single ? 'grid gap-3 xl:grid-cols-[minmax(0,1fr)_240px]' : ''}>
            <div>
              {view === 'list' && (
                <div className="flex items-center gap-3 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                  <input type="checkbox" aria-label="Select all" checked={allSelected} onChange={() => setSelection(allSelected ? new Set() : new Set(items.map(itemKey)))} />
                  <span className="flex-1">Name</span><span className="hidden sm:block w-24 text-right">Questions</span><span className="hidden md:block w-20 text-right">Size</span><span className="hidden md:block w-40 text-right">Modified</span><span className="w-8" />
                </div>
              )}
              <ul className={view === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 gap-2.5' : 'space-y-1.5'} aria-label="Files and folders">
                {items.map((i) => {
                  const k = itemKey(i);
                  const selected = selection.has(k);
                  const isFolder = i.kind === 'folder';
                  const fav = isFolder ? i.folder.favorite : i.file.favorite;
                  const v = !isFolder ? i.file.validation : undefined;
                  const badge = v ? (v.valid ? <CheckCircle2 size={14} className="text-green-600 shrink-0" aria-label="valid" /> : <XCircle size={14} className="text-red-600 shrink-0" aria-label={`${v.errors} errors`} />) : null;
                  return (
                    <li key={k} onContextMenu={(e) => openMenu(e, i)} data-testid={isFolder ? 'author-folder' : 'author-file'}
                      className={`card ${view === 'grid' ? 'p-3 flex flex-col gap-2' : 'px-3 py-2.5 flex items-center gap-3'} ${selected ? 'ring-2 ring-brand-500' : ''}`}>
                      <input type="checkbox" aria-label={`Select ${itemName(i)}`} checked={selected} onChange={() => toggleSelect(i)} />
                      <button type="button" onClick={() => openItem(i)} className={`min-w-0 text-left flex items-center gap-2.5 ${view === 'grid' ? 'flex-col items-start' : 'flex-1'}`}>
                        {isFolder ? <FolderPlusIcon /> : <FileJson size={view === 'grid' ? 26 : 18} className="text-brand-500 shrink-0" aria-hidden />}
                        <span className="min-w-0">
                          <span className="block text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{itemName(i)}</span>
                          {!isFolder && i.matchedIn && i.matchedIn.length > 0 && <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>matched in {i.matchedIn.join(', ')}</span>}
                          {view === 'grid' && !isFolder && <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>{v?.questions ?? 0} questions · {formatBytes(i.file.size)}</span>}
                        </span>
                      </button>
                      {fav && <Star size={13} className="fill-amber-400 text-amber-400 shrink-0" aria-label="favourite" />}
                      {badge}
                      {view === 'list' && (
                        <>
                          <span className="hidden sm:block w-24 text-right text-xs" style={{ color: 'var(--text-muted)' }}>{!isFolder ? v?.questions ?? 0 : ''}</span>
                          <span className="hidden md:block w-20 text-right text-xs" style={{ color: 'var(--text-muted)' }}>{!isFolder ? formatBytes(i.file.size) : ''}</span>
                          <span className="hidden md:block w-40 text-right text-xs" style={{ color: 'var(--text-muted)' }}>{formatWhen(isFolder ? i.folder.updatedAt : i.file.updatedAt)}</span>
                        </>
                      )}
                      <button type="button" aria-label={`Actions for ${itemName(i)}`} aria-haspopup="menu" onClick={(e) => openMenu(e, i)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 shrink-0"><MoreVertical size={15} style={{ color: 'var(--text-secondary)' }} /></button>
                    </li>
                  );
                })}
              </ul>
            </div>
            {single && (
              <aside className="hidden xl:block card p-3 text-xs space-y-1.5 h-fit" aria-label="Details">
                <p className="font-semibold text-sm break-words" style={{ color: 'var(--text-primary)' }}>{itemName(single)}</p>
                <p style={{ color: 'var(--text-muted)' }}>{single.kind === 'folder' ? 'Folder' : 'JSON question file'}</p>
                {single.kind === 'file' && (<>
                  <p>{single.file.validation?.questions ?? 0} question(s) · {formatBytes(single.file.size)}</p>
                  <p style={{ color: single.file.validation?.valid ? '#16a34a' : '#dc2626' }}>{single.file.validation?.valid ? 'Valid' : `${single.file.validation?.errors ?? 0} error(s)`}{single.file.validation?.warnings ? ` · ${single.file.validation.warnings} warning(s)` : ''}</p>
                  {!!single.file.validation?.subjects?.length && <p>Subjects: {single.file.validation.subjects.join(', ')}</p>}
                </>)}
                <p>Created {formatWhen(single.kind === 'folder' ? single.folder.createdAt : single.file.createdAt)}</p>
                <p>Modified {formatWhen(single.kind === 'folder' ? single.folder.updatedAt : single.file.updatedAt)}</p>
                <div className="flex gap-1.5 pt-1">
                  <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={() => openItem(single)}>Open</button>
                  <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setDialog({ type: 'rename', item: single })}>Rename</button>
                </div>
              </aside>
            )}
          </div>
        )}
      </section>

      {/* Context menu */}
      {menu && <ItemMenu menu={menu} onClose={() => setMenu(null)} actions={{
        open: () => openItem(menu.item),
        rename: () => setDialog({ type: 'rename', item: menu.item }),
        move: () => setDialog({ type: 'move', items: [menu.item] }),
        copy: () => setDialog({ type: 'copy', items: [menu.item] }),
        duplicate: () => void run('Duplicate', () => (menu.item.kind === 'folder' ? duplicateFolder(menu.item.folder.id) : duplicateFile(menu.item.file.id)), 'Duplicated'),
        favorite: () => void run('Favourite', () => (menu.item.kind === 'folder' ? setFolderFavorite(menu.item.folder.id, !menu.item.folder.favorite) : setFileFavorite(menu.item.file.id, !menu.item.file.favorite))),
        download: () => void download(menu.item),
        remove: () => setDialog({ type: 'delete', items: [menu.item] }),
      }} />}

      {/* Dialogs */}
      <NameDialog open={dialog?.type === 'new-folder'} title="New folder" label="Folder name" confirmLabel="Create" onCancel={() => setDialog(null)}
        onSubmit={async (name) => { try { await createFolder(folderId, name); onChanged(); await reload(); setDialog(null); } catch (e) { return e instanceof Error ? e.message : 'Could not create the folder.'; } }} />
      <NameDialog open={dialog?.type === 'new-file'} title="New JSON file" label="File name (.json is added for you)" confirmLabel="Create" onCancel={() => setDialog(null)}
        onSubmit={async (name) => { try { const f = await createFile(folderId, name, STARTER); onChanged(); await reload(); setDialog(null); toast.success('Created from the starter template — edit it in the viewer.'); onOpenFile(f.id); } catch (e) { return e instanceof Error ? e.message : 'Could not create the file.'; } }} />
      <NameDialog open={dialog?.type === 'rename'} title="Rename" label="New name" confirmLabel="Rename" initial={dialog?.type === 'rename' ? itemName(dialog.item) : ''} onCancel={() => setDialog(null)}
        onSubmit={async (name) => {
          if (dialog?.type !== 'rename') return;
          const it = dialog.item;
          try { if (it.kind === 'folder') await renameFolder(it.folder.id, name); else await renameFile(it.file.id, name); onChanged(); await reload(); setDialog(null); } catch (e) { return e instanceof Error ? e.message : 'Could not rename.'; }
        }} />
      <FolderPickerDialog open={dialog?.type === 'move' || dialog?.type === 'copy'} title={dialog?.type === 'copy' ? 'Copy to…' : 'Move to…'} confirmLabel={dialog?.type === 'copy' ? 'Copy here' : 'Move here'}
        folders={folders} startId={folderId} disabledIds={moveBlocked} busy={busy} onCancel={() => setDialog(null)}
        onConfirm={async (target) => {
          if (dialog?.type !== 'move' && dialog?.type !== 'copy') return;
          const { type, items: list } = dialog;
          const ok = await run(type === 'copy' ? 'Copy' : 'Move', async () => {
            for (const it of list) {
              if (type === 'move') { if (it.kind === 'folder') await moveFolder(it.folder.id, target); else await moveFile(it.file.id, target); }
              else if (it.kind === 'folder') await copyFolder(it.folder.id, target); else await copyFile(it.file.id, target);
            }
          }, `${type === 'copy' ? 'Copied' : 'Moved'} ${list.length} item(s)`);
          if (ok) { setDialog(null); setSelection(new Set()); }
        }} />
      <ConfirmDialog open={dialog?.type === 'delete'} title="Move to Trash?" confirmLabel="Move to Trash" destructive busy={busy} onCancel={() => setDialog(null)}
        onConfirm={async () => {
          if (dialog?.type !== 'delete') return;
          const list = dialog.items;
          const ok = await run('Delete', async () => { for (const it of list) { if (it.kind === 'folder') await trashFolder(it.folder.id); else await trashFile(it.file.id); } }, `Moved ${list.length} item(s) to Trash`);
          if (ok) { setDialog(null); setSelection(new Set()); }
        }}>
        <p>{dialog?.type === 'delete' && dialog.items.length === 1 ? <strong>{itemName(dialog.items[0])}</strong> : `${dialog?.type === 'delete' ? dialog.items.length : 0} items`} will be moved to the Trash{dialog?.type === 'delete' && dialog.items.some((i) => i.kind === 'folder') ? ', including everything inside the folder(s)' : ''}.</p>
        <p>Nothing is permanently deleted — you can restore it from Trash.</p>
      </ConfirmDialog>
      <ImportConflictDialog open={pendingImport !== null} conflicts={pendingImport?.conflicts ?? []} total={pendingImport?.files.length ?? 0} busy={busy}
        onChoose={(p) => pendingImport && void finishImport(pendingImport.files, p, pendingImport.source)} onCancel={() => setPendingImport(null)} />
      <ImportReportDialog result={report} onClose={() => setReport(null)} />
      <Modal open={treeOpen} onClose={() => setTreeOpen(false)} title="Folders" size="lg">
        <div className="max-h-[60vh] overflow-y-auto"><AuthorTree folders={folders} selectedId={folderId} onSelect={goTo} /></div>
      </Modal>
    </div>
  );
}

function FolderPlusIcon() {
  return <span className="shrink-0 rounded-md bg-brand-500/10 p-1" aria-hidden><FolderPlus size={16} className="text-brand-500" /></span>;
}

interface MenuActions { open: () => void; rename: () => void; move: () => void; copy: () => void; duplicate: () => void; favorite: () => void; download: () => void; remove: () => void }

function ItemMenu({ menu, onClose, actions }: { menu: MenuState; onClose: () => void; actions: MenuActions }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [onClose]);
  const fav = menu.item.kind === 'folder' ? menu.item.folder.favorite : menu.item.file.favorite;
  const entries: { label: string; icon: typeof Pencil; run: () => void; danger?: boolean }[] = [
    { label: menu.item.kind === 'folder' ? 'Open folder' : 'Open', icon: FileJson, run: actions.open },
    { label: 'Rename', icon: Pencil, run: actions.rename },
    { label: 'Move to…', icon: FolderInput, run: actions.move },
    { label: 'Copy to…', icon: Copy, run: actions.copy },
    { label: 'Duplicate', icon: Copy, run: actions.duplicate },
    { label: fav ? 'Remove favourite' : 'Add to favourites', icon: Star, run: actions.favorite },
    { label: menu.item.kind === 'folder' ? 'Export folder (ZIP)' : 'Download', icon: Download, run: actions.download },
    { label: 'Move to Trash', icon: Trash2, run: actions.remove, danger: true },
  ];
  return (
    <div ref={ref} role="menu" aria-label={`Actions for ${itemName(menu.item)}`} style={{ position: 'fixed', left: Math.max(8, menu.x), top: Math.max(8, menu.y), zIndex: 60, background: 'var(--card)', border: '1px solid var(--border)' }} className="rounded-xl shadow-xl py-1 w-48">
      {entries.map((e) => (
        <button key={e.label} role="menuitem" type="button" onClick={() => { onClose(); e.run(); }}
          className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-white/5 ${e.danger ? 'text-red-600' : ''}`} style={e.danger ? undefined : { color: 'var(--text-primary)' }}>
          <e.icon size={14} aria-hidden /> {e.label}
        </button>
      ))}
    </div>
  );
}
