import { useMemo, useState } from 'react';
import { ChevronRight, Folder, FolderOpen, Home, Star } from 'lucide-react';
import { Modal } from '../common/Modal';
import type { AuthorFolder } from '../../types/authorStudio';

interface TreeProps {
  folders: AuthorFolder[];
  /** null = the top level. */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Folders (and, implicitly, their descendants) that cannot be chosen — e.g. the folder being moved. */
  disabledIds?: ReadonlySet<string>;
  rootLabel?: string;
}

function childrenOf(folders: AuthorFolder[]) {
  const map = new Map<string, AuthorFolder[]>();
  for (const f of folders) map.set(f.parentKey, [...(map.get(f.parentKey) ?? []), f]);
  for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  return map;
}

/** Folder tree with expand/collapse. Keyboard: each row is a button; the chevron toggles without selecting. */
export function AuthorTree({ folders, selectedId, onSelect, disabledIds, rootLabel = 'My Question Bank' }: TreeProps) {
  const byParent = useMemo(() => childrenOf(folders), [folders]);
  const byId = useMemo(() => new Map(folders.map((f) => [f.id, f] as const)), [folders]);
  const [open, setOpen] = useState<Set<string>>(new Set());

  // The path to the selected folder is always expanded, so the selection is never hidden.
  const forced = useMemo(() => {
    const s = new Set<string>();
    let cur = selectedId ? byId.get(selectedId)?.parentId ?? null : null;
    while (cur) { s.add(cur); cur = byId.get(cur)?.parentId ?? null; }
    return s;
  }, [selectedId, byId]);

  const toggle = (id: string) => setOpen((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const renderLevel = (parentKey: string, depth: number, blocked: boolean) => (
    <ul role={depth === 0 ? 'tree' : 'group'}>
      {(byParent.get(parentKey) ?? []).map((f) => {
        const kids = byParent.get(f.id) ?? [];
        const expanded = open.has(f.id) || forced.has(f.id);
        const disabled = blocked || !!disabledIds?.has(f.id);
        const selected = selectedId === f.id;
        return (
          <li key={f.id} role="treeitem" aria-expanded={kids.length ? expanded : undefined} aria-selected={selected}>
            <div className={`flex items-center rounded-lg ${selected ? 'bg-brand-500/10' : 'hover:bg-gray-100 dark:hover:bg-white/5'}`} style={{ paddingLeft: depth * 12 }}>
              <button type="button" onClick={() => toggle(f.id)} aria-label={expanded ? `Collapse ${f.name}` : `Expand ${f.name}`} tabIndex={kids.length ? 0 : -1}
                className={`p-1.5 ${kids.length ? '' : 'invisible'}`}><ChevronRight size={13} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} style={{ color: 'var(--text-muted)' }} /></button>
              <button type="button" onClick={() => onSelect(f.id)} disabled={disabled}
                className="flex-1 min-w-0 flex items-center gap-1.5 py-1.5 pr-2 text-left text-sm disabled:opacity-40 disabled:cursor-not-allowed" style={{ color: selected ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                {expanded && kids.length ? <FolderOpen size={14} className="shrink-0 text-brand-500" /> : <Folder size={14} className="shrink-0 text-brand-500" />}
                <span className="truncate">{f.name}</span>
                {f.favorite && <Star size={11} className="shrink-0 fill-amber-400 text-amber-400" aria-label="favourite" />}
              </button>
            </div>
            {kids.length > 0 && expanded && renderLevel(f.id, depth + 1, disabled)}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div>
      <button type="button" onClick={() => onSelect(null)} aria-current={selectedId === null}
        className={`w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-left ${selectedId === null ? 'bg-brand-500/10 font-semibold' : 'hover:bg-gray-100 dark:hover:bg-white/5'}`} style={{ color: selectedId === null ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
        <Home size={14} className="text-brand-500" /> {rootLabel}
      </button>
      <div className="mt-0.5">{renderLevel('', 0, false)}</div>
    </div>
  );
}

interface PickerProps {
  open: boolean;
  title: string;
  confirmLabel: string;
  folders: AuthorFolder[];
  startId: string | null;
  disabledIds?: ReadonlySet<string>;
  busy?: boolean;
  onConfirm: (folderId: string | null) => void;
  onCancel: () => void;
}

/** "Move to…" / "Copy to…" destination chooser. */
export function FolderPickerDialog({ open, title, confirmLabel, folders, startId, disabledIds, busy, onConfirm, onCancel }: PickerProps) {
  const [choice, setChoice] = useState<string | null>(startId);
  const [seed, setSeed] = useState<{ open: boolean; startId: string | null }>({ open, startId });
  if (seed.open !== open || seed.startId !== startId) { setSeed({ open, startId }); if (open) setChoice(startId); }
  return (
    <Modal open={open} onClose={onCancel} title={title} size="lg">
      <div className="max-h-[50vh] overflow-y-auto rounded-xl p-2" style={{ border: '1px solid var(--border)' }}>
        <AuthorTree folders={folders} selectedId={choice} onSelect={setChoice} disabledIds={disabledIds} />
      </div>
      <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        Destination: <strong>{choice === null ? 'My Question Bank (top level)' : folders.find((f) => f.id === choice)?.name}</strong>. If a name is already taken there, the item is renamed — nothing is overwritten.
      </p>
      <div className="flex gap-2 mt-4">
        <button type="button" onClick={onCancel} disabled={busy} className="btn-secondary flex-1 text-sm py-2.5">Cancel</button>
        <button type="button" onClick={() => onConfirm(choice)} disabled={busy} className="btn-primary flex-1 text-sm py-2.5">{busy ? 'Working…' : confirmLabel}</button>
      </div>
    </Modal>
  );
}

