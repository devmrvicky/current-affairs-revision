import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, Download, FileUp, Pencil, Plus, Trash2, UploadCloud, XCircle } from 'lucide-react';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { QuestionMarkdownRenderer } from '../mock/QuestionMarkdownRenderer';
import { AuthorQuestionEditorDialog, type EditableQuestion } from './AuthorQuestionEditorDialog';
import { createFolder, getBreadcrumb, getFile, getFileContent, listFolders, setFilePracticeLink, touchFileOpened, updateFileContent } from '../../services/author/authorDb';
import { validateQuestionFileText } from '../../services/author/authorValidation';
import { questionBankRepository } from '../../services/questionBank/repository';
import { parseTestFile, examIdsForSubject } from '../../services/questionBank/testFile';
import type { AuthorFile, AuthorFolder } from '../../types/authorStudio';
import { downloadBlob } from './authorUi';

type Tab = 'preview' | 'source' | 'validation';
const PAGE = 15;
const AUTHOR_SUBJECTS = [
  { id: 'mathematics', name: 'Mathematics' },
  { id: 'english', name: 'English' },
  { id: 'reasoning', name: 'Reasoning' },
  { id: 'general-awareness', name: 'General Awareness' },
] as const;

interface Props {
  fileId: string | null;
  onClose: () => void;
  /** Called after a save so lists can refresh their cached validation badges. */
  onSaved: () => void;
}

function getPracticeFolderDisplayPath(folder: AuthorFolder, folders: AuthorFolder[]): string {
  const byId = new Map(folders.map((item) => [item.id, item] as const));
  const names = [folder.name];
  let parentId = folder.parentId;
  const seen = new Set<string>([folder.id]);
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    if (!parent.systemSubjectId) names.unshift(parent.name);
    parentId = parent.parentId;
  }
  return names.join(' / ');
}

function readQuestionContainer(source: string): { root: unknown[] | Record<string, unknown>; questions: EditableQuestion[]; wrapped: boolean } {
  const root: unknown = JSON.parse(source);
  if (Array.isArray(root)) return { root, questions: root as EditableQuestion[], wrapped: false };
  if (root && typeof root === 'object' && Array.isArray((root as Record<string, unknown>).questions)) {
    return { root: root as Record<string, unknown>, questions: (root as { questions: EditableQuestion[] }).questions, wrapped: true };
  }
  throw new Error('This file is not an ExamVerse question array or a { questions: [...] } file.');
}

function updateQuestionContainer(source: string, questions: EditableQuestion[]): string {
  const container = readQuestionContainer(source);
  const next = container.wrapped ? { ...(container.root as Record<string, unknown>), questions } : questions;
  return JSON.stringify(next, null, 2) + '\n';
}

/** Open a question file: Preview, Source, Validation, structured question editing and local Practice publishing. */
export function AuthorFileViewer({ fileId, onClose, onSaved }: Props) {
  const [file, setFile] = useState<AuthorFile | null>(null);
  const [saved, setSaved] = useState('');
  const [text, setText] = useState('');
  const [tab, setTab] = useState<Tab>('preview');
  const [page, setPage] = useState(0);
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [pendingReplace, setPendingReplace] = useState<string | null>(null);
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null);
  const [editor, setEditor] = useState<{ open: boolean; question: EditableQuestion | null; index: number | null; key: number }>({ open: false, question: null, index: null, key: 0 });
  const [practiceDialogOpen, setPracticeDialogOpen] = useState(false);
  const [practiceSubject, setPracticeSubject] = useState<string>('general-awareness');
  const [practiceChapter, setPracticeChapter] = useState('');
  const [practiceFolderId, setPracticeFolderId] = useState('');
  const [practiceFolders, setPracticeFolders] = useState<AuthorFolder[]>([]);
  const [createPracticeFolderOpen, setCreatePracticeFolderOpen] = useState(false);
  const [newPracticeFolderName, setNewPracticeFolderName] = useState('');
  const [practiceTitle, setPracticeTitle] = useState('');
  const [practiceBusy, setPracticeBusy] = useState(false);
  const [debounced, setDebounced] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!fileId) return;
    let alive = true;
    void (async () => {
      const [meta, content] = await Promise.all([getFile(fileId), getFileContent(fileId)]);
      if (!alive) return;
      if (!meta || meta.deletedAt) { toast.error('That file is no longer available.'); onClose(); return; }
      const source = content ?? '';
      setFile(meta); setSaved(source); setText(source); setDebounced(source);
      const [breadcrumb, allFolders] = await Promise.all([getBreadcrumb(meta.folderId), listFolders()]);
      if (!alive) return;
      const subjectRoot = breadcrumb.find((folder) => folder.systemSubjectId);
      const subjectId = meta.practiceLink?.subjectId ?? subjectRoot?.systemSubjectId ?? 'general-awareness';
      const folderPath = breadcrumb.filter((folder) => !folder.systemSubjectId).map((folder) => folder.name).join(' / ');
      const linkedFolderId = meta.practiceLink?.chapterId.startsWith('author-folder-') ? meta.practiceLink.chapterId.slice('author-folder-'.length) : '';
      const linkedFolderExists = linkedFolderId && allFolders.some((folder) => folder.id === linkedFolderId);
      const subjectFolder = allFolders.find((folder) => folder.parentId === null && folder.systemSubjectId === subjectId);
      const initialFolderId = linkedFolderExists ? linkedFolderId : (subjectRoot?.systemSubjectId === subjectId ? meta.folderId ?? subjectRoot.id : subjectFolder?.id ?? '');
      setPracticeFolders(allFolders);
      setPracticeSubject(subjectId);
      setPracticeFolderId(initialFolderId);
      setPracticeChapter(meta.practiceLink?.chapterTitle ?? (folderPath || meta.name.replace(/\.json$/i, '').replace(/[-_]/g, ' ')));
      setCreatePracticeFolderOpen(false);
      setNewPracticeFolderName('');
      setPracticeTitle(meta.practiceLink?.title ?? meta.name.replace(/\.json$/i, '').replace(/[-_]/g, ' '));
      setTab('preview'); setPage(0);
      setEditor({ open: false, question: null, index: null, key: 0 });
      void touchFileOpened(fileId);
    })();
    return () => { alive = false; };
  }, [fileId, onClose]);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(text), 250);
    return () => clearTimeout(id);
  }, [text]);

  const result = useMemo(() => (fileId ? validateQuestionFileText(debounced) : null), [debounced, fileId]);
  const loading = fileId !== null && file?.id !== fileId;
  const dirty = text !== saved;
  const practiceFolderOptions = useMemo(() => {
    const byId = new Map(practiceFolders.map((folder) => [folder.id, folder] as const));
    const root = practiceFolders.find((folder) => folder.parentId === null && folder.systemSubjectId === practiceSubject);
    if (!root) return [] as { id: string; label: string; isRoot: boolean }[];
    const isInTree = (folder: AuthorFolder) => {
      let parentId: string | null = folder.id;
      const seen = new Set<string>();
      while (parentId && !seen.has(parentId)) {
        if (parentId === root.id) return true;
        seen.add(parentId);
        parentId = byId.get(parentId)?.parentId ?? null;
      }
      return false;
    };
    const labelFor = (folder: AuthorFolder) => {
      const names = [folder.name];
      let parentId = folder.parentId;
      const seen = new Set<string>([folder.id]);
      while (parentId && !seen.has(parentId)) {
        seen.add(parentId);
        const parent = byId.get(parentId);
        if (!parent) break;
        if (parent.id === root.id) break;
        names.unshift(parent.name);
        parentId = parent.parentId;
      }
      return names.join('  ›  ');
    };
    return [root, ...practiceFolders.filter((folder) => folder.id !== root.id && isInTree(folder))]
      .map((folder) => ({ id: folder.id, label: folder.id === root.id ? `${root.name} (subject root)` : labelFor(folder), isRoot: folder.id === root.id }))
      .sort((a, b) => a.isRoot ? -1 : b.isRoot ? 1 : a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }));
  }, [practiceFolders, practiceSubject]);
  const requestClose = useCallback(() => { if (dirty) setConfirmClose(true); else onClose(); }, [dirty, onClose]);

  async function syncPracticeProjection(targetFile: AuthorFile, source: string) {
    const link = targetFile.practiceLink;
    if (!link) return false;
    const parsed = parseTestFile(source, targetFile.name, {
      id: link.testId,
      title: link.title,
      subjectId: link.subjectId,
      chapterId: link.chapterId,
      chapterTitle: link.chapterTitle,
      examIds: link.examIds,
    });
    if (!parsed.ok || !parsed.meta) {
      const first = parsed.errors[0]?.message ?? 'The question file is not valid.';
      throw new Error(`Saved in Author Studio, but Practice was not updated: ${first}`);
    }
    const existing = await questionBankRepository.getTestById(`local:${link.testId}`);
    if (existing) await questionBankRepository.replaceLocalTest(link.testId, parsed);
    else await questionBankRepository.importLocalTest(parsed);
    return true;
  }

  async function save() {
    if (!file) return;
    setSaving(true);
    try {
      const next = await updateFileContent(file.id, text);
      setFile(next); setSaved(text);
      let synced = false;
      let syncMessage = '';
      if (next.practiceLink) {
        try { synced = await syncPracticeProjection(next, text); }
        catch (err) { syncMessage = err instanceof Error ? err.message : 'Practice sync failed.'; }
      }
      if (syncMessage) toast.error(syncMessage, { duration: 5000 });
      else if (synced) toast.success(`Saved and synced to Practice · ${next.validation?.questions ?? 0} questions`);
      else toast.success(next.validation?.valid ? 'Saved — file is valid' : `Saved — ${next.validation?.errors} error(s) remain`);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  function openQuestionEditor(index: number | null) {
    try {
      const container = readQuestionContainer(text);
      const question = index === null ? null : container.questions[index];
      if (index !== null && !question) throw new Error('That question could not be found.');
      setEditor((current) => ({ open: true, question, index, key: current.key + 1 }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open the question editor.');
      setTab('source');
    }
  }

  function applyQuestion(question: EditableQuestion) {
    try {
      const container = readQuestionContainer(text);
      const nextQuestions = [...container.questions];
      const index = editor.index;
      if (index === null) {
        nextQuestions.push(question);
        setPage(Math.floor(nextQuestions.length - 1) / PAGE);
      } else {
        nextQuestions[index] = question;
        setPage(Math.floor(index / PAGE));
      }
      setText(updateQuestionContainer(text, nextQuestions));
      setTab('preview');
      setEditor({ open: false, question: null, index: null, key: editor.key });
      toast.success(index === null ? 'Question added to the file. Press Save to keep it.' : 'Question updated. Press Save to keep it.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the question file.');
    }
  }

  function deleteQuestion(index: number) {
    try {
      const container = readQuestionContainer(text);
      const nextQuestions = container.questions.filter((_, i) => i !== index);
      setText(updateQuestionContainer(text, nextQuestions));
      setPage(Math.min(page, Math.max(0, Math.ceil(nextQuestions.length / PAGE) - 1)));
      setPendingDeleteIndex(null);
      toast.success('Question removed from the editor. Press Save to keep the change.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete the question.');
    }
  }

  async function chooseReplacement(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    if (!/\.json$/i.test(f.name)) return void toast.error('Choose a .json file.');
    setPendingReplace(await f.text());
    if (fileInput.current) fileInput.current.value = '';
  }

  function openPracticeSettings() {
    if (!file) return;
    setPracticeSubject(file.practiceLink?.subjectId ?? practiceSubject);
    setPracticeChapter(file.practiceLink?.chapterTitle ?? (practiceChapter || file.name.replace(/\.json$/i, '').replace(/[-_]/g, ' ')));
    setPracticeTitle(file.practiceLink?.title ?? file.name.replace(/\.json$/i, '').replace(/[-_]/g, ' '));
    setCreatePracticeFolderOpen(false);
    setPracticeDialogOpen(true);
  }

  function changePracticeSubject(subjectId: string) {
    setPracticeSubject(subjectId);
    const root = practiceFolders.find((folder) => folder.parentId === null && folder.systemSubjectId === subjectId);
    setPracticeFolderId(root?.id ?? '');
    setCreatePracticeFolderOpen(false);
  }

  async function createPracticeDestinationFolder() {
    if (!practiceFolderId || !newPracticeFolderName.trim()) return void toast.error('Choose a parent folder and enter a folder name.');
    try {
      const created = await createFolder(practiceFolderId, newPracticeFolderName.trim());
      const folders = await listFolders();
      setPracticeFolders(folders);
      setPracticeFolderId(created.id);
      setPracticeChapter(created.name);
      setNewPracticeFolderName('');
      setCreatePracticeFolderOpen(false);
      toast.success('Practice destination folder created.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the Practice folder.');
    }
  }

  async function enablePractice() {
    if (!file) return;
    const title = practiceTitle.trim();
    const destinationFolder = practiceFolders.find((folder) => folder.id === practiceFolderId);
    const chapterTitle = destinationFolder ? (destinationFolder.systemSubjectId ? destinationFolder.name : getPracticeFolderDisplayPath(destinationFolder, practiceFolders)) : '';
    const sameExistingDestination = !!file.practiceLink && file.practiceLink.subjectId === practiceSubject && practiceFolderId === file.folderId && file.practiceLink.chapterTitle === chapterTitle;
    const chapterId = sameExistingDestination ? file.practiceLink!.chapterId : destinationFolder ? `author-folder-${destinationFolder.id}` : '';
    if (!title || !destinationFolder || !chapterTitle || !chapterId) return void toast.error('Choose a destination folder and enter a test title.');
    if (!AUTHOR_SUBJECTS.some((subject) => subject.id === practiceSubject)) return void toast.error('Choose one of the four ExamVerse subjects.');
    setPracticeBusy(true);
    try {
      if (dirty) throw new Error('Save the file changes before adding it to Practice.');
      const testId = file.practiceLink?.testId ?? `author-${file.id}`;
      const examIds = examIdsForSubject(practiceSubject);
      const parsed = parseTestFile(text, file.name, { id: testId, title, subjectId: practiceSubject, chapterId, chapterTitle, examIds });
      if (!parsed.ok || !parsed.meta) {
        setTab('validation');
        throw new Error(parsed.errors[0]?.message ?? 'The file must be valid before it can be added to Practice.');
      }
      const existing = await questionBankRepository.getTestById(`local:${testId}`);
      if (existing) await questionBankRepository.replaceLocalTest(testId, parsed);
      else await questionBankRepository.importLocalTest(parsed);
      const next = await setFilePracticeLink(file.id, { testId, subjectId: practiceSubject, chapterId, chapterTitle, title, examIds, syncedAt: Date.now() });
      setFile(next);
      setPracticeDialogOpen(false);
      onSaved();
      toast.success(`Added ${parsed.questionCount} question(s) to Practice and Mock Test on this device.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add this file to Practice.');
    } finally {
      setPracticeBusy(false);
    }
  }

  async function removePracticeLink() {
    if (!file?.practiceLink) return;
    setPracticeBusy(true);
    try {
      await questionBankRepository.deleteLocalTest(file.practiceLink.testId);
      const next = await setFilePracticeLink(file.id, undefined);
      setFile(next);
      setPracticeDialogOpen(false);
      onSaved();
      toast.success('Removed from Practice. The Author Studio source file is unchanged.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove the Practice link.');
    } finally {
      setPracticeBusy(false);
    }
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
                  <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setDebounced(text); setTab(t); }} className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize ${tab === t ? 'bg-brand-500 text-white' : ''}`} style={tab === t ? undefined : { color: 'var(--text-secondary)' }}>
                    {t}{t === 'validation' && (result.errors.length + result.warnings.length > 0) ? ` (${result.errors.length + result.warnings.length})` : ''}
                  </button>
                ))}
              </div>
              <span className={`inline-flex items-center gap-1 text-xs font-medium ${result.valid ? 'text-green-600' : 'text-red-600'}`} role="status">
                {result.valid ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                {result.valid ? 'Valid' : `${result.errors.length} error${result.errors.length === 1 ? '' : 's'}`}{result.warnings.length > 0 && <span className="text-amber-600"> · {result.warnings.length} warning{result.warnings.length === 1 ? '' : 's'}</span>}
              </span>
              {file.practiceLink && <span className="text-[10px] rounded-full px-2 py-1 bg-green-500/10 text-green-700 dark:text-green-300">Linked to Practice</span>}
              <div className="ml-auto flex flex-wrap gap-1.5">
                <button type="button" onClick={openPracticeSettings} disabled={!result.valid || dirty} title={dirty ? 'Save changes before linking to Practice' : 'Add this question set to Practice and Mock Test'} className="btn-secondary text-xs inline-flex items-center gap-1 px-2.5 py-1.5 disabled:opacity-40"><UploadCloud size={13} /> {file.practiceLink ? 'Practice settings' : 'Add to Practice'}</button>
                <button type="button" onClick={() => fileInput.current?.click()} className="btn-ghost text-xs inline-flex items-center gap-1 px-2.5 py-1.5"><FileUp size={13} /> Replace…</button>
                <button type="button" onClick={() => downloadBlob(file.name, text, 'application/json')} className="btn-ghost text-xs inline-flex items-center gap-1 px-2.5 py-1.5"><Download size={13} /> Download</button>
                <button type="button" onClick={save} disabled={!dirty || saving} className="btn-primary text-xs px-3.5 py-1.5">{saving ? 'Saving…' : 'Save'}</button>
              </div>
              <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" onChange={(e) => void chooseReplacement(e.target.files)} />
            </div>

            {tab === 'preview' && (
              <div className="space-y-3" data-testid="author-preview">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Question preview · {questions.length} total</p>
                  <button type="button" onClick={() => openQuestionEditor(null)} className="btn-primary text-xs inline-flex items-center gap-1 px-3 py-2"><Plus size={14}/> Add Question</button>
                </div>
                {!result.valid && result.questionCount === 0 && <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nothing to preview yet — see the Validation tab or edit the JSON source.</p>}
                {shown.map((q) => (
                  <article key={`${q.index}-${q.id}`} className="rounded-xl p-3 text-sm" style={{ border: `1px solid ${q.valid ? 'var(--border)' : '#fca5a5'}` }}>
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-semibold mt-0.5" style={{ color: 'var(--text-muted)' }}>{q.index + 1}.</span>
                      <div className="min-w-0 flex-1" style={{ color: 'var(--text-primary)' }}><QuestionMarkdownRenderer content={q.question || '(no question text)'} /></div>
                      {q.difficulty && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--border)', color: 'var(--text-secondary)' }}>{q.difficulty}</span>}
                      <button type="button" onClick={() => { try { openQuestionEditor(q.index); } catch { /* error is shown by the editor opener */ } }} aria-label={`Edit question ${q.index + 1}`} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10"><Pencil size={13}/></button>
                      <button type="button" onClick={() => setPendingDeleteIndex(q.index)} aria-label={`Delete question ${q.index + 1}`} className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"><Trash2 size={13}/></button>
                    </div>
                    <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                      {q.options.map((o) => (
                        <li key={o.id} className={`rounded-lg px-2.5 py-1.5 text-xs ${o.id === q.correctAnswer ? 'font-semibold' : ''}`} style={{ border: `1px solid ${o.id === q.correctAnswer ? '#16a34a' : 'var(--border)'}`, color: 'var(--text-primary)', background: o.id === q.correctAnswer ? 'rgba(22,163,74,0.08)' : undefined }}>
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
              <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} aria-label="JSON source" data-exam-keys="off" className="w-full h-[50vh] rounded-xl p-3 text-xs font-mono bg-transparent resize-y" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)', tabSize: 2 }} />
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

      <AuthorQuestionEditorDialog key={editor.key} open={editor.open} initial={editor.question} onCancel={() => setEditor((current) => ({ ...current, open: false }))} onSave={applyQuestion} />

      <Modal open={practiceDialogOpen} onClose={() => setPracticeDialogOpen(false)} title={file?.practiceLink ? 'Practice settings' : 'Add to Practice'} description="This creates or updates a local test on this device. It becomes available to the existing Practice and Mock Test engines.">
        <div className="space-y-3">
          <label className="block text-sm">
            <span style={{ color: 'var(--text-secondary)' }}>Subject</span>
            <select value={practiceSubject} onChange={(event) => changePracticeSubject(event.target.value)} className="mt-1 w-full rounded-xl px-3 py-2.5 text-sm bg-transparent" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
              {AUTHOR_SUBJECTS.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
            </select>
          </label>
          <div className="space-y-2">
            <label className="block text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>Practice destination folder</span>
              <select value={practiceFolderId} onChange={(event) => { setPracticeFolderId(event.target.value); setCreatePracticeFolderOpen(false); }} className="mt-1 w-full rounded-xl px-3 py-2.5 text-sm bg-transparent" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                <option value="">Choose a folder…</option>
                {practiceFolderOptions.map((folder) => <option key={folder.id} value={folder.id}>{folder.label}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => { setCreatePracticeFolderOpen((open) => !open); setNewPracticeFolderName(''); }} className="text-xs font-semibold inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg hover:bg-brand-500/10" style={{ color: 'var(--brand-500)' }}>
              <Plus size={13} /> {createPracticeFolderOpen ? 'Cancel new folder' : 'Create new folder'}
            </button>
            {createPracticeFolderOpen && (
              <div className="rounded-xl p-3 space-y-2" style={{ background: 'var(--border)' }}>
                <label className="block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>New folder inside selected folder</label>
                <input value={newPracticeFolderName} onChange={(event) => setNewPracticeFolderName(event.target.value)} placeholder="e.g. Parliament" maxLength={120} className="w-full rounded-xl px-3 py-2.5 text-sm bg-transparent" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                <button type="button" onClick={() => void createPracticeDestinationFolder()} className="btn-secondary text-xs px-3 py-2">Create folder</button>
              </div>
            )}
          </div>
          <label className="block text-sm">
            <span style={{ color: 'var(--text-secondary)' }}>Test title</span>
            <input value={practiceTitle} onChange={(event) => setPracticeTitle(event.target.value)} placeholder="e.g. Parliament Practice Set" maxLength={100} className="mt-1 w-full rounded-xl px-3 py-2.5 text-sm bg-transparent" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          </label>
          <p className="rounded-xl p-3 text-xs" style={{ background: 'var(--border)', color: 'var(--text-secondary)' }}>
            The JSON stays in My Question Bank. Its valid questions are also indexed in the local Practice bank. Changes saved here will automatically update that Practice test.
          </p>
          <div className="flex flex-col-reverse sm:flex-row gap-2">
            {file?.practiceLink && <button type="button" onClick={() => void removePracticeLink()} disabled={practiceBusy} className="btn-ghost text-xs py-2.5 text-red-600">Remove from Practice</button>}
            <button type="button" onClick={() => setPracticeDialogOpen(false)} disabled={practiceBusy} className="btn-secondary flex-1 py-2.5 text-sm">Cancel</button>
            <button type="button" onClick={() => void enablePractice()} disabled={practiceBusy || dirty || !result?.valid} className="btn-primary flex-1 py-2.5 text-sm">{practiceBusy ? 'Working…' : file?.practiceLink ? 'Update Practice settings' : 'Add to Practice'}</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={pendingDeleteIndex !== null} title="Remove this question?" confirmLabel="Remove question" destructive onConfirm={() => pendingDeleteIndex !== null && deleteQuestion(pendingDeleteIndex)} onCancel={() => setPendingDeleteIndex(null)}>
        <p>The question will be removed from the editor. Press <strong>Save</strong> in the file viewer to store the change{file?.practiceLink ? ' and update its Practice version' : ''}.</p>
      </ConfirmDialog>

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
