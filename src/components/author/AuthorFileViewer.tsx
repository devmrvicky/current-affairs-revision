import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, Download, FileUp, XCircle } from 'lucide-react';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { QuestionMarkdownRenderer } from '../mock/QuestionMarkdownRenderer';
import { getFile, getFileContent, touchFileOpened, updateFileContent } from '../../services/author/authorDb';
import { validateQuestionFileText } from '../../services/author/authorValidation';
import type { AuthorFile } from '../../types/authorStudio';
import { downloadBlob } from './authorUi';

type Tab = 'preview' | 'source' | 'validation';
const PAGE = 15;

interface Props {
  fileId: string | null;
  onClose: () => void;
  /** Called after a save so lists can refresh their cached validation badges. */
  onSaved: () => void;
}

/** Open a question file: Preview (as questions), Source (editable JSON), Validation (errors/warnings). Edits are revalidated live and saved only on request. */
export function AuthorFileViewer({ fileId, onClose, onSaved }: Props) {
  const [file, setFile] = useState<AuthorFile | null>(null);
  const [saved, setSaved] = useState('');
  const [text, setText] = useState('');
  const [tab, setTab] = useState<Tab>('preview');
  const [page, setPage] = useState(0);
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [pendingReplace, setPendingReplace] = useState<string | null>(null);
  const [debounced, setDebounced] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!fileId) return;
    let alive = true;
    void (async () => {
      const [meta, content] = await Promise.all([getFile(fileId), getFileContent(fileId)]);
      if (!alive) return;
      if (!meta || meta.deletedAt) { toast.error('That file is no longer available.'); onClose(); return; }
      setFile(meta); setSaved(content ?? ''); setText(content ?? ''); setDebounced(content ?? '');
      setTab('preview'); setPage(0);
      void touchFileOpened(fileId);
    })();
    return () => { alive = false; };
  }, [fileId, onClose]);

  // Revalidate while typing, without re-parsing on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(text), 250);
    return () => clearTimeout(id);
  }, [text]);

  const result = useMemo(() => (fileId ? validateQuestionFileText(debounced) : null), [debounced, fileId]);
  const loading = fileId !== null && file?.id !== fileId; // derived: the file for this id has not arrived yet
  const dirty = text !== saved;

  const requestClose = useCallback(() => { if (dirty) setConfirmClose(true); else onClose(); }, [dirty, onClose]);

  async function save() {
    if (!file) return;
    setSaving(true);
    try {
      const next = await updateFileContent(file.id, text);
      setFile(next); setSaved(text);
      toast.success(next.validation?.valid ? 'Saved — file is valid' : `Saved — ${next.validation?.errors} error(s) remain`);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  async function chooseReplacement(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    if (!/\.json$/i.test(f.name)) return void toast.error('Choose a .json file.');
    setPendingReplace(await f.text());
    if (fileInput.current) fileInput.current.value = '';
  }

  const questions = result?.questions ?? [];
  const pageCount = Math.max(1, Math.ceil(questions.length / PAGE));
  const shown = questions.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <>
      <Modal open={fileId !== null} onClose={requestClose} title={file?.name ?? 'Loading…'} description={file ? `${result?.questionCount ?? 0} question(s)${dirty ? ' · unsaved changes' : ''}` : undefined} size="lg" panelClassName="sm:max-w-4xl">
        {loading || !file || !result ? <div className="h-40 card shimmer" style={{ background: 'var(--border)' }} /> : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div role="tablist" aria-label="File views" className="flex rounded-xl p-0.5" style={{ background: 'var(--border)' }}>
                {(['preview', 'source', 'validation'] as Tab[]).map((t) => (
                  <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setDebounced(text); setTab(t); }} // flush the typing debounce so a tab never shows stale results

                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize ${tab === t ? 'bg-brand-500 text-white' : ''}`} style={tab === t ? undefined : { color: 'var(--text-secondary)' }}>
                    {t}{t === 'validation' && (result.errors.length + result.warnings.length > 0) ? ` (${result.errors.length + result.warnings.length})` : ''}
                  </button>
                ))}
              </div>
              <span className={`inline-flex items-center gap-1 text-xs font-medium ${result.valid ? 'text-green-600' : 'text-red-600'}`} role="status">
                {result.valid ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                {result.valid ? 'Valid' : `${result.errors.length} error${result.errors.length === 1 ? '' : 's'}`}{result.warnings.length > 0 && <span className="text-amber-600"> · {result.warnings.length} warning{result.warnings.length === 1 ? '' : 's'}</span>}
              </span>
              <div className="ml-auto flex gap-1.5">
                <button type="button" onClick={() => fileInput.current?.click()} className="btn-ghost text-xs inline-flex items-center gap-1 px-2.5 py-1.5"><FileUp size={13} /> Replace…</button>
                <button type="button" onClick={() => downloadBlob(file.name, text, 'application/json')} className="btn-ghost text-xs inline-flex items-center gap-1 px-2.5 py-1.5"><Download size={13} /> Download</button>
                <button type="button" onClick={save} disabled={!dirty || saving} className="btn-primary text-xs px-3.5 py-1.5">{saving ? 'Saving…' : 'Save'}</button>
              </div>
              <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" onChange={(e) => void chooseReplacement(e.target.files)} />
            </div>

            {tab === 'preview' && (
              <div className="space-y-3" data-testid="author-preview">
                {!result.valid && result.questionCount === 0 && <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nothing to preview yet — see the Validation tab.</p>}
                {shown.map((q) => (
                  <article key={q.index} className="rounded-xl p-3 text-sm" style={{ border: `1px solid ${q.valid ? 'var(--border)' : '#fca5a5'}` }}>
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-semibold mt-0.5" style={{ color: 'var(--text-muted)' }}>{q.index + 1}.</span>
                      <div className="min-w-0 flex-1" style={{ color: 'var(--text-primary)' }}><QuestionMarkdownRenderer content={q.question || '(no question text)'} /></div>
                      {q.difficulty && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--border)', color: 'var(--text-secondary)' }}>{q.difficulty}</span>}
                    </div>
                    <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                      {q.options.map((o) => (
                        <li key={o.id} className={`rounded-lg px-2.5 py-1.5 text-xs ${o.id === q.correctAnswer ? 'font-semibold' : ''}`}
                          style={{ border: `1px solid ${o.id === q.correctAnswer ? '#16a34a' : 'var(--border)'}`, color: 'var(--text-primary)', background: o.id === q.correctAnswer ? 'rgba(22,163,74,0.08)' : undefined }}>
                          <strong>{o.id}.</strong> <QuestionMarkdownRenderer content={o.text} />
                        </li>
                      ))}
                    </ul>
                    {q.explanation && <div className="mt-2 text-xs p-2 rounded-lg" style={{ background: 'var(--border)', color: 'var(--text-secondary)' }}><QuestionMarkdownRenderer content={q.explanation} /></div>}
                    {(q.subjectId || q.topicId) && <p className="mt-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>{[q.subjectId, q.topicId].filter(Boolean).join(' › ')}</p>}
                  </article>
                ))}
                {pageCount > 1 && (
                  <div className="flex items-center justify-between text-xs">
                    <button type="button" className="btn-ghost px-3 py-1.5" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
                    <span style={{ color: 'var(--text-muted)' }}>Page {page + 1} of {pageCount}</span>
                    <button type="button" className="btn-ghost px-3 py-1.5" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
                  </div>
                )}
              </div>
            )}

            {tab === 'source' && (
              <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} aria-label="JSON source" data-exam-keys="off"
                className="w-full h-[50vh] rounded-xl p-3 text-xs font-mono bg-transparent resize-y" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)', tabSize: 2 }} />
            )}

            {tab === 'validation' && (
              <div className="space-y-2 text-sm" data-testid="author-validation">
                {result.errors.length + result.warnings.length === 0 && <p className="flex items-center gap-2 text-green-600"><CheckCircle2 size={16} /> No problems found in {result.questionCount} question(s).</p>}
                {[...result.errors, ...result.warnings].map((i, n) => (
                  <div key={n} className="flex gap-2 rounded-lg p-2.5 text-xs" style={{ background: i.severity === 'error' ? 'rgba(220,38,38,0.08)' : 'rgba(217,119,6,0.08)' }}>
                    {i.severity === 'error' ? <XCircle size={14} className="text-red-600 shrink-0 mt-0.5" /> : <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />}
                    <div style={{ color: 'var(--text-primary)' }}>
                      {i.questionIndex !== undefined && <strong>Question {i.questionIndex + 1}{i.questionId ? ` (${i.questionId})` : ''}{i.field ? ` · ${i.field}` : ''}: </strong>}
                      {i.message}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog open={confirmClose} title="Discard unsaved changes?" confirmLabel="Discard" destructive onConfirm={() => { setConfirmClose(false); onClose(); }} onCancel={() => setConfirmClose(false)}>
        <p>Your edits to <strong>{file?.name}</strong> have not been saved.</p>
      </ConfirmDialog>

      <ConfirmDialog open={pendingReplace !== null} title="Replace this file's content?" confirmLabel="Replace content" destructive
        onConfirm={() => { if (pendingReplace !== null) { setText(pendingReplace); setTab('validation'); } setPendingReplace(null); toast('Loaded into the editor — review it, then press Save.'); }} onCancel={() => setPendingReplace(null)}>
        <p>The chosen file will be loaded into the editor in place of the current text. Nothing is saved until you press <strong>Save</strong>, and you can still discard it.</p>
      </ConfirmDialog>
    </>
  );
}
