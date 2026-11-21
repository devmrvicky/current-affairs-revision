import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, HardDrive } from 'lucide-react';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { DataTable, type Column } from '../results/DataTable';
import { FileDropZone } from './FileDropZone';
import { ImportPreviewCard } from './ImportPreviewCard';
import { LocalTestsPanel } from './LocalTestsPanel';
import { BackupPanel } from './BackupPanel';
import { commitImports, expandBundles, previewImports, readCandidate, type ImportBatchMode, type ImportCandidate, type ImportPreview } from '../../services/questionBank/importPipeline';
import { getImportHistory } from '../../services/questionBank/bankDb';
import { onBankChanged } from '../../services/questionBank/bankEvents';
import type { CommitSummary } from '../../services/questionBank/bankDb';
import type { ImportHistoryRecord } from '../../services/questionBank/types';
import type { TestFileMeta } from '../../services/questionBank/testFile';

const MODES: { id: ImportBatchMode; label: string; help: string }[] = [
  { id: 'add', label: 'Add new', help: 'Create new tests. A test id that already exists is rejected.' },
  { id: 'replace', label: 'Replace', help: 'Replace the questions of an existing test. Other tests and all your progress are untouched.' },
  { id: 'merge', label: 'Merge', help: 'Add the questions a test does not have yet; you choose what happens to ids it already has.' },
];

const HISTORY_COLUMNS: Column<ImportHistoryRecord>[] = [
  { key: 'file', header: 'File', render: (r) => <span className="whitespace-nowrap">{r.fileName}</span> },
  { key: 'test', header: 'Test', render: (r) => r.testId },
  { key: 'when', header: 'When', render: (r) => new Date(r.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) },
  { key: 'mode', header: 'Mode', render: (r) => r.mode },
  { key: 'added', header: 'Added', align: 'right', render: (r) => r.added },
  { key: 'updated', header: 'Updated', align: 'right', render: (r) => r.updated },
  { key: 'skipped', header: 'Skipped', align: 'right', render: (r) => r.skipped },
  { key: 'status', header: 'Status', render: (r) => (r.status === 'success' ? 'Success' : <span title={r.error}>Failed — {r.error}</span>) },
];

/** LOCAL IMPORT — fully offline, no backend. Everything here changes THIS DEVICE only. */
export function LocalImportTab() {
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [mode, setMode] = useState<ImportBatchMode>('add');
  const [mergeConflict, setMergeConflict] = useState<'skip' | 'update'>('skip');
  const [previews, setPreviews] = useState<ImportPreview[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CommitSummary[] | null>(null);
  const [history, setHistory] = useState<ImportHistoryRecord[] | null>(null);

  const expanded = useMemo(() => expandBundles(candidates), [candidates]);
  const ownUids = useMemo(() => new Set(candidates.map((c) => c.uid)), [candidates]);

  useEffect(() => {
    let alive = true;
    void previewImports(expanded, mode).then((p) => { if (alive) setPreviews(p); });
    return () => { alive = false; };
  }, [expanded, mode]);

  useEffect(() => {
    let alive = true;
    const load = () => getImportHistory().then((h) => { if (alive) setHistory(h); }).catch(() => { if (alive) setHistory([]); });
    void load();
    const off = onBankChanged(() => { void load(); });
    return () => { alive = false; off(); };
  }, []);

  async function addFiles(files: File[]) {
    setSummary(null); setError(null);
    const read = await Promise.all(files.map(readCandidate));
    setCandidates((c) => [...c, ...read]);
  }
  const setOverrides = (uid: string, o: Partial<TestFileMeta>) => setCandidates((c) => c.map((x) => (x.uid === uid ? { ...x, overrides: o } : x)));

  const allValid = previews.length > 0 && previews.every((p) => p.valid);
  const questions = previews.reduce((n, p) => n + p.parsed.questionCount, 0);
  const invalid = previews.filter((p) => !p.valid).length;

  async function doImport() {
    setBusy(true); setError(null);
    try {
      const done = await commitImports(previews, mode, { mergeConflict });
      setSummary(done); setCandidates([]); setPreviews([]); setConfirmOpen(false);
      toast.success(`Imported ${done.length} test${done.length === 1 ? '' : 's'} on this device`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The import failed. Nothing was changed.');
      setConfirmOpen(false);
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6" data-testid="local-import-tab">
      <p className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300" data-testid="scope-local">
        <HardDrive size={14} aria-hidden /> This device only — nothing here is sent anywhere
      </p>

      <section className="space-y-3" aria-label="Import JSON files">
        <FileDropZone label="Choose question JSON files" onFiles={addFiles} disabled={busy} hint="One or more test files in the ExamVerse question format (max 5 MB each)" />

        <div role="radiogroup" aria-label="Import mode" className="grid gap-2 sm:grid-cols-3">
          {MODES.map((m) => (
            <label key={m.id} className={`card p-3 cursor-pointer text-sm ${mode === m.id ? 'ring-2 ring-brand-500' : ''}`}>
              <span className="flex items-center gap-2 font-medium" style={{ color: 'var(--text-primary)' }}>
                <input type="radio" name="import-mode" checked={mode === m.id} onChange={() => setMode(m.id)} />{m.label}
              </span>
              <span className="block text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{m.help}</span>
            </label>
          ))}
        </div>
        {mode === 'merge' && (
          <fieldset className="text-sm flex flex-wrap gap-4" aria-label="When a question id already exists">
            <legend className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>When a question id already exists in the test:</legend>
            {(['skip', 'update'] as const).map((c) => (
              <label key={c} className="inline-flex items-center gap-2 min-h-11"><input type="radio" name="merge-conflict" checked={mergeConflict === c} onChange={() => setMergeConflict(c)} />{c === 'skip' ? 'Skip it (keep what is there)' : 'Update it with the file’s version'}</label>
            ))}
          </fieldset>
        )}
      </section>

      {previews.length > 0 && (
        <section aria-label="Preview" className="space-y-3">
          <h3 className="font-display font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Preview — {previews.length} test{previews.length === 1 ? '' : 's'}, {questions} questions</h3>
          <ul className="space-y-3">
            {previews.map((p) => (
              <ImportPreviewCard key={p.uid} preview={p} editable={ownUids.has(p.uid)} overrides={candidates.find((c) => c.uid === p.uid)?.overrides}
                onRemove={() => setCandidates((c) => c.filter((x) => x.uid !== p.uid))} onOverrides={(o) => setOverrides(p.uid, o)} />
            ))}
          </ul>
          <button type="button" className="btn-primary w-full sm:w-auto px-5 py-3 disabled:opacity-50" disabled={!allValid || busy} onClick={() => setConfirmOpen(true)}>
            Import {previews.length} file{previews.length === 1 ? '' : 's'} — this device only
          </button>
          {!allValid && <p className="text-xs" style={{ color: 'var(--text-muted)' }} role="status">{invalid} file{invalid === 1 ? ' has' : 's have'} errors. Nothing is imported until every file is valid — it is all or nothing.</p>}
        </section>
      )}

      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {summary && (
        <section aria-label="Import result" className="card p-4" data-testid="import-summary">
          <p className="flex items-center gap-2 font-medium text-sm text-green-600 dark:text-green-400"><CheckCircle2 size={16} aria-hidden /> Imported {summary.length} test{summary.length === 1 ? '' : 's'}</p>
          <ul className="mt-2 text-xs space-y-0.5" style={{ color: 'var(--text-secondary)' }}>
            {summary.map((s) => <li key={s.testId}><b>{s.testId}</b>: {s.added} added · {s.updated} updated · {s.skipped} skipped</li>)}
          </ul>
        </section>
      )}

      <ConfirmDialog open={confirmOpen} title={`${MODES.find((m) => m.id === mode)!.label} ${previews.length} test${previews.length === 1 ? '' : 's'}?`} confirmLabel="Import" busy={busy} onConfirm={doImport} onCancel={() => !busy && setConfirmOpen(false)}>
        <p>{questions} questions in {previews.length} file{previews.length === 1 ? '' : 's'} will be {mode === 'add' ? 'added' : mode === 'replace' ? 'swapped in for the existing tests' : `merged (existing ids: ${mergeConflict})`} on <b>this device only</b>. It all happens together — if anything fails, nothing changes. Your attempts, bookmarks and progress are never touched.</p>
      </ConfirmDialog>

      <LocalTestsPanel />
      <BackupPanel />

      <section aria-label="Import history" className="space-y-2">
        <h3 className="font-display font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Import history</h3>
        {history === null ? <div className="h-16 rounded-xl shimmer" style={{ background: 'var(--border)' }} aria-busy /> : history.length === 0
          ? <p className="text-sm" style={{ color: 'var(--text-muted)' }} role="status">Nothing imported yet.</p>
          : <DataTable caption="Import history" columns={HISTORY_COLUMNS} rows={history} rowKey={(r) => r.id} testId="table-import-history" />}
      </section>
    </div>
  );
}
