import { useState } from 'react';
import toast from 'react-hot-toast';
import { Archive, RotateCcw } from 'lucide-react';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { FileDropZone } from './FileDropZone';
import { buildBackup, previewBackup, restoreBackup, type BackupPreview } from '../../services/questionBank/backup';
import { downloadText } from '../../utils/download';

/** Full local backup and restore. Progress (attempts, bookmarks…) is in a backup — or put back from one — only if you tick the box. */
export function BackupPanel() {
  const [includeProgress, setIncludeProgress] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [restoreProgress, setRestoreProgress] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function backup() {
    const b = await buildBackup({ includeProgress });
    downloadText(b.fileName, b.text);
    toast.success(`Backup saved — ${b.counts.tests} tests, ${b.counts.questions} questions${includeProgress ? `, ${b.counts.progressRecords} progress records` : ''}`);
  }

  async function pick(files: File[]) {
    setError(null); setRestoreProgress(false);
    const f = files[0];
    const t = await f.text().catch(() => null);
    if (t === null) { setError('That file could not be read.'); return; }
    setText(t); setFileName(f.name); setPreview(await previewBackup(t));
  }

  async function doRestore() {
    if (!text) return;
    setBusy(true); setError(null);
    try {
      const r = await restoreBackup(text, { restoreProgress });
      toast.success(`Restored ${r.tests} tests (${r.questions} questions)${r.progressRecords ? ` and ${r.progressRecords} progress records` : ''}`);
      setText(null); setPreview(null); setConfirmOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'The restore failed. Nothing was changed.'); setConfirmOpen(false); }
    finally { setBusy(false); }
  }

  const progressTotal = preview ? Object.values(preview.progressCounts).reduce((n, c) => n + (c ?? 0), 0) : 0;

  return (
    <section aria-label="Backup and restore" className="space-y-4" data-testid="backup-panel">
      <h3 className="font-display font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Backup and restore</h3>
      <div className="card p-4 space-y-3">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>A backup holds your imported tests and the bank's own records.</p>
        <label className="flex items-start gap-2 text-sm min-h-11"><input type="checkbox" className="mt-1" checked={includeProgress} onChange={(e) => setIncludeProgress(e.target.checked)} />
          <span>Also include my attempts, bookmarks and other progress<span className="block text-xs" style={{ color: 'var(--text-muted)' }}>Off by default. Leave it off to back up the question bank only.</span></span></label>
        <button type="button" className="btn-secondary px-4 py-2.5 text-sm inline-flex items-center gap-2" onClick={() => { void backup(); }}><Archive size={14} aria-hidden />Create backup</button>
      </div>

      <div className="card p-4 space-y-3">
        <FileDropZone label="Choose a backup file to restore" multiple={false} onFiles={(f) => { void pick(f); }} hint="A file made by “Create backup”" />
        {preview && (
          <div data-testid="restore-preview" className="space-y-2 text-sm">
            <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{fileName}</p>
            {preview.ok ? (
              <>
                <p style={{ color: 'var(--text-secondary)' }}>{preview.tests.length} tests, {preview.questionCount} questions{preview.createdAt ? ` · made ${new Date(preview.createdAt).toLocaleDateString()}` : ''}.</p>
                {preview.tests.some((t) => t.willReplace) && <p className="text-amber-600 dark:text-amber-400 text-xs">These tests are already here and will be replaced: {preview.tests.filter((t) => t.willReplace).map((t) => t.title).join(', ')}.</p>}
                {preview.hasProgress && (
                  <label className="flex items-start gap-2 min-h-11"><input type="checkbox" className="mt-1" checked={restoreProgress} onChange={(e) => setRestoreProgress(e.target.checked)} />
                    <span>Also restore my progress ({progressTotal} records: attempts, bookmarks…)<span className="block text-xs" style={{ color: 'var(--text-muted)' }}>Off by default — it overwrites records that have the same ids.</span></span></label>
                )}
                <button type="button" className="btn-primary px-4 py-2.5 text-sm inline-flex items-center gap-2" onClick={() => setConfirmOpen(true)}><RotateCcw size={14} aria-hidden />Restore…</button>
              </>
            ) : (
              <ul role="alert" className="text-xs text-red-600 dark:text-red-400 space-y-1">{preview.errors.map((e, i) => <li key={i}>{e.message}</li>)}</ul>
            )}
          </div>
        )}
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>

      <ConfirmDialog open={confirmOpen} title="Restore this backup?" confirmLabel="Restore" busy={busy} onConfirm={() => { void doRestore(); }} onCancel={() => !busy && setConfirmOpen(false)}>
        <p>This puts back {preview?.tests.length ?? 0} tests{restoreProgress ? ` and ${progressTotal} progress records` : ''} in one step — if anything fails, nothing changes. {restoreProgress ? '' : 'Your current attempts and bookmarks are not touched.'}</p>
      </ConfirmDialog>
    </section>
  );
}
