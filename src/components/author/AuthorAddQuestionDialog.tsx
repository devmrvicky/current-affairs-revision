import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { FolderPlus, FilePlus2, FileJson, Layers3 } from 'lucide-react';
import { Modal } from '../common/Modal';
import { AuthorQuestionEditorDialog, type EditableQuestion } from './AuthorQuestionEditorDialog';
import {
  createFile,
  createFolder,
  getFile,
  getFileContent,
  listChildren,
  trashFolder,
  updateFileContent,
  setFilePracticeLink,
} from '../../services/author/authorDb';
import type { AuthorFile, AuthorFolder, AuthorPracticeTarget } from '../../types/authorStudio';
import { examIdsForSubject, parseTestFile } from '../../services/questionBank/testFile';
import { questionBankRepository } from '../../services/questionBank/repository';
import { v4 as uuidv4 } from 'uuid';

type DestinationMode = 'folder' | 'existing-file' | 'new-file' | 'new-folder';
type Destination =
  | { mode: 'folder'; folderId: string }
  | { mode: 'existing-file'; folderId: string | null; fileId: string }
  | { mode: 'new-file'; folderId: string; fileName: string }
  | { mode: 'new-folder'; folderId: string; folderName: string; fileName: string };

interface Props {
  open: boolean;
  folders: AuthorFolder[];
  currentFolderId: string | null;
  initialFileId?: string | null;
  /** When launched from an ExamVerse Original chapter, publish the new Personal file to that Practice destination automatically. */
  practiceTarget?: AuthorPracticeTarget;
  onCancel: () => void;
  onComplete: (fileId: string, folderId: string | null) => void;
}

function folderPath(folder: AuthorFolder, byId: Map<string, AuthorFolder>): string {
  const parts = [folder.name];
  const seen = new Set([folder.id]);
  let parentId = folder.parentId;
  while (parentId) {
    if (seen.has(parentId)) break;
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    parts.unshift(parent.name);
    parentId = parent.parentId;
  }
  return parts.join('  ›  ');
}

function appendQuestionToJson(source: string, question: EditableQuestion): string {
  let root: unknown;
  try { root = JSON.parse(source); }
  catch { throw new Error('The selected JSON file contains invalid JSON. Open it and fix the source before adding questions.'); }
  if (Array.isArray(root)) {
    return JSON.stringify([...root, question], null, 2) + '\n';
  }
  if (root && typeof root === 'object' && Array.isArray((root as Record<string, unknown>).questions)) {
    const wrapper = root as Record<string, unknown>;
    return JSON.stringify({ ...wrapper, questions: [...(wrapper.questions as unknown[]), question] }, null, 2) + '\n';
  }
  throw new Error('The selected file must contain a question array or an object with a questions array.');
}

async function syncLinkedPractice(file: AuthorFile, source: string): Promise<void> {
  const link = file.practiceLink;
  if (!link) return;
  const parsed = parseTestFile(source, file.name, {
    id: link.testId,
    title: link.title,
    subjectId: link.subjectId,
    chapterId: link.chapterId,
    chapterTitle: link.chapterTitle,
    examIds: link.examIds,
  });
  if (!parsed.ok || !parsed.meta) {
    throw new Error(parsed.errors[0]?.message ?? 'The saved questions could not be converted into a Practice test.');
  }
  const existing = await questionBankRepository.getTestById(`local:${link.testId}`);
  if (existing) await questionBankRepository.replaceLocalTest(link.testId, parsed);
  else await questionBankRepository.importLocalTest(parsed);
}

/** Adds one question directly to any existing folder/file, or creates the requested destination. */
export function AuthorAddQuestionDialog({ open, folders, currentFolderId, initialFileId = null, practiceTarget, onCancel, onComplete }: Props) {
  const [folderId, setFolderId] = useState('');
  const [mode, setMode] = useState<DestinationMode>('folder');
  const [files, setFiles] = useState<AuthorFile[]>([]);
  const [fileId, setFileId] = useState('');
  const [newFileName, setNewFileName] = useState('Questions');
  const [newFolderName, setNewFolderName] = useState('New folder');
  const [destination, setDestination] = useState<Destination | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');

  const byId = useMemo(() => new Map(folders.map((folder) => [folder.id, folder] as const)), [folders]);
  const folderOptions = useMemo(() => folders
    .filter((folder) => !folder.deletedAt)
    .map((folder) => ({ id: folder.id, label: folderPath(folder, byId) }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' })), [folders, byId]);

  useEffect(() => {
    if (!open) return;
    setFolderId(currentFolderId && byId.has(currentFolderId) ? currentFolderId : '');
    setMode(initialFileId ? 'existing-file' : 'folder');
    setFileId(initialFileId ?? '');
    setNewFileName('Questions');
    setNewFolderName('New folder');
    setDestination(null);
    setLoadError('');
    setEditorKey((key) => key + 1);
  }, [open, currentFolderId, initialFileId, byId]);

  useEffect(() => {
    if (!open || (!folderId && !initialFileId)) { setFiles([]); setFileId(''); return; }
    let active = true;
    void listChildren(folderId || null).then((result) => {
      if (!active) return;
      setFiles(result.files.filter((file) => !file.deletedAt));
      setFileId((current) => result.files.some((file) => file.id === current && !file.deletedAt) ? current : result.files.find((file) => !file.deletedAt)?.id ?? '');
      setLoadError('');
    }).catch((error: unknown) => {
      if (active) setLoadError(error instanceof Error ? error.message : 'Could not load files in this folder.');
    });
    return () => { active = false; };
  }, [open, folderId, initialFileId]);

  function continueToEditor() {
    if (mode === 'existing-file') {
      if (!fileId || !files.some((file) => file.id === fileId)) return toast.error('Choose an existing JSON file.');
      setDestination({ mode, folderId: folderId || null, fileId });
      return;
    }
    if (!folderId || !byId.has(folderId)) return toast.error('Choose a subject or destination folder first.');
    if (mode === 'new-file') {
      if (!newFileName.trim()) return toast.error('Enter a name for the new JSON file.');
      setDestination({ mode, folderId, fileName: newFileName.trim() });
    } else if (mode === 'new-folder') {
      if (!newFolderName.trim() || !newFileName.trim()) return toast.error('Enter both the new folder and JSON file names.');
      setDestination({ mode, folderId, folderName: newFolderName.trim(), fileName: newFileName.trim() });
    } else {
      setDestination({ mode: 'folder', folderId });
    }
  }

  async function saveQuestion(question: EditableQuestion) {
    if (!destination) return;
    setBusy(true);
    try {
      let targetFile: AuthorFile;
      let source: string;

      if (destination.mode === 'existing-file') {
        const currentFile = await getFile(destination.fileId);
        const currentSource = await getFileContent(destination.fileId);
        if (!currentFile || currentFile.deletedAt || currentSource === undefined) throw new Error('The selected file no longer exists. Refresh the Question Bank and try again.');
        const nextQuestion = makeQuestionIdUnique(question, currentSource);
        source = appendQuestionToJson(currentSource, nextQuestion);
        targetFile = await updateFileContent(currentFile.id, source);
      } else if (destination.mode === 'folder') {
        const folderChildren = await listChildren(destination.folderId);
        const defaultFile = folderChildren.files.find((file) => !file.deletedAt && file.name.toLowerCase() === 'questions.json');
        if (defaultFile) {
          const currentSource = await getFileContent(defaultFile.id);
          if (currentSource === undefined) throw new Error('Questions.json could not be read.');
          source = appendQuestionToJson(currentSource, makeQuestionIdUnique(question, currentSource));
          targetFile = await updateFileContent(defaultFile.id, source);
        } else {
          source = JSON.stringify([question], null, 2) + '\n';
          targetFile = await createFile(destination.folderId, 'Questions.json', source);
        }
      } else if (destination.mode === 'new-file') {
        source = JSON.stringify([question], null, 2) + '\n';
        targetFile = await createFile(destination.folderId, destination.fileName, source);
      } else {
        const folder = await createFolder(destination.folderId, destination.folderName);
        source = JSON.stringify([question], null, 2) + '\n';
        try {
          targetFile = await createFile(folder.id, destination.fileName, source);
        } catch (error) {
          // Do not leave an empty folder behind if creating its first file fails.
          try { await trashFolder(folder.id); } catch { /* keep the original creation error */ }
          throw error;
        }
      }

      let syncWarning = '';
      let addedToPractice = false;
      if (targetFile.practiceLink) {
        // Preserve an existing Practice destination and update the same local test.
        try { await syncLinkedPractice(targetFile, source); addedToPractice = true; }
        catch (error) { syncWarning = error instanceof Error ? error.message : 'Practice sync failed.'; }
      } else if (practiceTarget) {
        // A launch from an Original chapter provides a canonical destination. The
        // question remains in the Personal Author DB, while a linked local projection
        // makes it immediately available to Practice/Mock without a second manual step.
        const testId = `author-${targetFile.id}`;
        const title = practiceTarget.title?.trim() || targetFile.name.replace(/\.json$/i, '');
        const examIds = examIdsForSubject(practiceTarget.subjectId);
        const parsed = parseTestFile(source, targetFile.name, {
          id: testId,
          title,
          subjectId: practiceTarget.subjectId,
          chapterId: practiceTarget.chapterId,
          chapterTitle: practiceTarget.chapterTitle,
          examIds,
        });
        if (!parsed.ok || !parsed.meta) {
          syncWarning = parsed.errors[0]?.message ?? 'The question was saved, but it could not be added to Practice.';
        } else {
          let importedNewTest = false;
          try {
            const existing = await questionBankRepository.getTestById(`local:${testId}`);
            if (existing) await questionBankRepository.replaceLocalTest(testId, parsed);
            else {
              await questionBankRepository.importLocalTest(parsed);
              importedNewTest = true;
            }
            await setFilePracticeLink(targetFile.id, {
              testId,
              subjectId: practiceTarget.subjectId,
              chapterId: practiceTarget.chapterId,
              chapterTitle: practiceTarget.chapterTitle,
              title,
              examIds,
              syncedAt: Date.now(),
            });
            addedToPractice = true;
          } catch (error) {
            // Do not leave an unlinked local test behind if the Author DB link could
            // not be saved. The original question file itself remains safely saved.
            try { if (importedNewTest) await questionBankRepository.deleteLocalTest(testId); } catch { /* preserve the original error */ }
            syncWarning = error instanceof Error ? error.message : 'Practice publishing failed.';
          }
        }
      }
      if (syncWarning) toast.error(`Question saved, but Practice was not updated: ${syncWarning}`, { duration: 6000 });
      else if (addedToPractice) toast.success(`Question added to ${targetFile.name} and made available in Practice.`);
      else toast.success(`Question added to ${targetFile.name}.`);
      setDestination(null);
      onComplete(targetFile.id, targetFile.folderId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add the question.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Modal open={open && destination === null} onClose={onCancel} title="Add a question" description="Choose any subject or nested folder, then add to an existing file or create a destination.">
        <div className="space-y-3">
          <label className="block text-sm">
            <span style={{ color: 'var(--text-secondary)' }}>Subject / destination folder</span>
            <select value={folderId} onChange={(event) => setFolderId(event.target.value)} data-autofocus className="mt-1 w-full rounded-xl px-3 py-2.5 text-sm bg-transparent" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
              <option value="">Choose a subject or folder…</option>
              {folderOptions.map((folder) => <option key={folder.id} value={folder.id}>{folder.label}</option>)}
            </select>
          </label>
          <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Question destination">
            {([
              ['folder', 'Add directly to folder', 'Use or create Questions.json', Layers3],
              ['existing-file', 'Existing JSON file', 'Append to a selected file', FileJson],
              ['new-file', 'Create new file', 'Create a JSON file here', FilePlus2],
              ['new-folder', 'Create new folder', 'Create a folder and JSON file', FolderPlus],
            ] as const).map(([value, label, detail, Icon]) => (
              <button key={value} type="button" onClick={() => setMode(value)} aria-pressed={mode === value} className={`rounded-xl border p-3 text-left ${mode === value ? 'border-brand-500 bg-brand-500/10' : ''}`} style={mode === value ? undefined : { borderColor: 'var(--border)' }}>
                <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}><Icon size={15}/>{label}</span>
                <span className="block mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>{detail}</span>
              </button>
            ))}
          </div>

          {mode === 'existing-file' && (
            <label className="block text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>Existing file in selected folder</span>
              <select value={fileId} onChange={(event) => setFileId(event.target.value)} className="mt-1 w-full rounded-xl px-3 py-2.5 text-sm bg-transparent" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                <option value="">Choose JSON file…</option>
                {files.map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}
              </select>
              {folderId && files.length === 0 && <span className="block mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>No JSON files in this folder yet. Choose another destination or create a file.</span>}
            </label>
          )}
          {(mode === 'new-file' || mode === 'new-folder') && (
            <label className="block text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>New JSON file name</span>
              <input value={newFileName} onChange={(event) => setNewFileName(event.target.value)} maxLength={120} placeholder="Questions" className="mt-1 w-full rounded-xl px-3 py-2.5 text-sm bg-transparent" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </label>
          )}
          {mode === 'new-folder' && (
            <label className="block text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>New subfolder name</span>
              <input value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} maxLength={120} placeholder="e.g. Number System" className="mt-1 w-full rounded-xl px-3 py-2.5 text-sm bg-transparent" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </label>
          )}
          {loadError && <p role="alert" className="text-xs text-red-600">{loadError}</p>}
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>You can repeat this at any folder depth. Existing files keep their IDs and any linked Practice test is refreshed after the question is saved.</p>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={onCancel} className="btn-secondary flex-1 py-2.5 text-sm">Cancel</button>
            <button type="button" disabled={busy || (mode !== 'existing-file' && !folderId) || (mode === 'existing-file' && !fileId)} onClick={continueToEditor} className="btn-primary flex-1 py-2.5 text-sm">Continue</button>
          </div>
        </div>
      </Modal>
      <AuthorQuestionEditorDialog
        key={editorKey}
        open={open && destination !== null}
        initial={null}
        description="This question will be saved directly to the selected folder or JSON file."
        saving={busy}
        onCancel={() => { if (!busy) setDestination(null); }}
        onSave={(question) => { void saveQuestion(question); }}
      />
    </>
  );
}

function makeQuestionIdUnique(question: EditableQuestion, source: string): EditableQuestion {
  try {
    const root: unknown = JSON.parse(source);
    const list = Array.isArray(root) ? root : root && typeof root === 'object' && Array.isArray((root as Record<string, unknown>).questions) ? (root as { questions: unknown[] }).questions : [];
    const ids = new Set(list.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object').map((item) => String(item.id ?? '')));
    if (question.id === undefined || ids.has(String(question.id))) return { ...question, id: `q-${uuidv4()}` };
  } catch { /* appendQuestionToJson below will show the clear JSON error */ }
  return question;
}
