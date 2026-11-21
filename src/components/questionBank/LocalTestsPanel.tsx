import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Download, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { questionBankRepository } from '../../services/questionBank/repository';
import { exportBundle, exportTests } from '../../services/questionBank/backup';
import { onBankChanged } from '../../services/questionBank/bankEvents';
import { downloadText } from '../../utils/download';
import { subjectRegistry } from '../../data/registry/subjectRegistry';
import type { BankTestRecord } from '../../services/questionBank/types';

/** The tests imported on this device: export them as valid JSON, or delete them. */
export function LocalTestsPanel() {
  const [tests, setTests] = useState<BankTestRecord[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toDelete, setToDelete] = useState<BankTestRecord | null>(null);

  const load = useCallback(() => { void questionBankRepository.getLocalTests().then(setTests, () => setTests([])); }, []);
  useEffect(() => { load(); return onBankChanged(load); }, [load]);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function exportSelected() {
    const files = await exportTests(Array.from(selected));
    for (const f of files) downloadText(f.fileName, f.text);
    toast.success(`Exported ${files.length} file${files.length === 1 ? '' : 's'}`);
  }
  async function exportAll() {
    const b = await exportBundle('all');
    downloadText(b.fileName, b.text);
    toast.success('Exported every imported test in one file');
  }
  async function doDelete() {
    if (!toDelete) return;
    await questionBankRepository.deleteLocalTest(toDelete.id);
    toast.success(`Removed “${toDelete.title}” from this device`);
    setSelected((s) => { const n = new Set(s); n.delete(toDelete.id); return n; });
    setToDelete(null);
  }

  return (
    <section aria-label="Imported tests" className="space-y-3" data-testid="local-tests-panel">
      <h3 className="font-display font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Imported tests on this device</h3>
      {tests === null ? <div className="h-16 rounded-xl shimmer" style={{ background: 'var(--border)' }} aria-busy />
        : tests.length === 0 ? <p className="text-sm" style={{ color: 'var(--text-muted)' }} role="status">No imported tests yet. Add some above.</p>
        : (
          <>
            <ul className="space-y-1">
              {tests.map((t) => (
                <li key={t.key} className="flex items-center gap-2">
                  <label className="flex-1 min-w-0 min-h-11 flex items-center gap-3 text-sm cursor-pointer">
                    <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} aria-label={`Select ${t.title}`} />
                    <span className="min-w-0"><span className="block font-medium truncate" style={{ color: 'var(--text-primary)' }}>{t.title}</span>
                      <span className="block text-xs truncate" style={{ color: 'var(--text-muted)' }}>{subjectRegistry.getSubject(t.subjectId)?.name ?? t.subjectId} › {t.chapterTitle} · {t.questionCount} questions · v{t.version} · id {t.id}</span></span>
                  </label>
                  <button type="button" onClick={() => setToDelete(t)} aria-label={`Delete ${t.title}`} className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 flex-shrink-0"><Trash2 size={16} aria-hidden /></button>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary px-4 py-2.5 text-sm inline-flex items-center gap-2 disabled:opacity-50" disabled={selected.size === 0} onClick={() => { void exportSelected(); }}><Download size={14} aria-hidden />Export selected ({selected.size})</button>
              <button type="button" className="btn-secondary px-4 py-2.5 text-sm inline-flex items-center gap-2" onClick={() => { void exportAll(); }}><Download size={14} aria-hidden />Export all as one file</button>
            </div>
          </>
        )}
      <ConfirmDialog open={!!toDelete} title="Remove this test from this device?" confirmLabel="Remove" destructive onConfirm={() => { void doDelete(); }} onCancel={() => setToDelete(null)}>
        <p>“{toDelete?.title}” will no longer appear in Practice by Topic. Your attempts and bookmarks are kept, and you can still review old attempts of its questions. You can re-import the file any time.</p>
      </ConfirmDialog>
    </section>
  );
}
